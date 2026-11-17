from django.http import Http404
from django.utils import timezone

from audit import services as audit
from core.exceptions import DomainError

from .. import policy
from ..choices import Role
from ..models import UserJurisdiction

REGION, OFFICE, DEPARTMENT = "region", "office", "department"
LEVELS = {
    Role.REGIONAL_REPRESENTATIVE.value: REGION,
    Role.MANAGER.value: OFFICE,
    Role.CHIEF_OF_SERVICE.value: DEPARTMENT,
}
COMMERCIAL_CENTER = "COMMERCIAL_CENTER"
AUDITED = ("user", "region", "office", "department", "ended_at")

def _invalid(error_code, message):
    return DomainError(error_code, message, status_code=400)

def required_level(role):
    """REGION, OFFICE, DEPARTMENT, or None for a role that takes no jurisdiction."""
    return LEVELS.get(role)

def resolve(actor, role, jurisdiction):
    """Checks `jurisdiction` ({region, office, department}, any of them, or None) against
    what `role` requires and what the actor may grant. Returns the full
    (region, office, department) triple, or None for a role without one."""
    jurisdiction = {key: value for key, value in (jurisdiction or {}).items() if value}
    label = Role(role).label
    level = required_level(role)
    if level is None:
        if jurisdiction:
            raise _invalid(
                "JURISDICTION_NOT_ALLOWED", f"The {label} role does not take a jurisdiction."
            )
        return None
    if not jurisdiction:
        raise _invalid("JURISDICTION_REQUIRED", f"A {label} needs a jurisdiction: one {level}.")

    region = jurisdiction.get("region")
    office = jurisdiction.get("office")
    department = jurisdiction.get("department")
    wrong_level = _invalid(
        "JURISDICTION_INVALID", f"A {label}'s jurisdiction is exactly one {level}."
    )
    if level == REGION:
        if office is not None or department is not None or region is None:
            raise wrong_level
    elif level == OFFICE:
        if department is not None or office is None:
            raise wrong_level
        if office.kind != COMMERCIAL_CENTER:
            raise _invalid(
                "JURISDICTION_INVALID",
                f"A {label}'s jurisdiction is a commercial branch; {office.code} is not one.",
            )
    elif department is None:
        raise wrong_level

    if department is not None:
        if office is not None and department.office_id != office.pk:
            raise _invalid("DEPARTMENT_NOT_IN_OFFICE", "The department is not in that office.")
        office = department.office
    if office is not None:
        if region is not None and office.region_id != region.pk:
            raise _invalid("OFFICE_NOT_IN_REGION", "The office is not in that region.")
        region = office.region
    for target, what in ((region, "region"), (office, "office"), (department, "department")):
        if target is not None and not target.is_active:
            raise _invalid("INACTIVE_TARGET", f"The {what} {target.code} is inactive.")

    context = policy.context_for(actor)
    office_path = office.path if office is not None else None
    department_id = department.pk if department is not None else None
    if not (
        context.administers_organization or context.covers(region.pk, office_path, department_id)
    ):
        raise Http404
    return region, office, department

def current(user):
    """The user's active jurisdictions as (region, office, department) id triples."""
    return set(
        UserJurisdiction.objects.filter(user=user, ended_at__isnull=True).values_list(
            "region_id", "office_id", "department_id"
        )
    )

def as_ids(scope):
    if scope is None:
        return set()
    region, office, department = scope
    return {(region.pk, getattr(office, "pk", None), getattr(department, "pk", None))}


def replace(actor, user, scope):
    """Makes `scope` the user's only active jurisdiction (none for a role without one).
    The ones it replaces are ended, not deleted. Call inside the role change's
    transaction; the caller then syncs the Chief of Service of Computing post."""
    if current(user) == as_ids(scope):
        return
    now = timezone.now()
    for held in UserJurisdiction.objects.select_for_update().filter(
        user=user, ended_at__isnull=True
    ):
        before = audit.snapshot(held, AUDITED)
        held.ended_at = now
        held.ended_by = actor
        held.save(update_fields=["ended_at", "ended_by"])
        audit.record(
            actor,
            "accounts.jurisdiction.ended",
            held,
            before=before,
            after=audit.snapshot(held, AUDITED),
        )
    if scope is None:
        return
    region, office, department = scope
    created = UserJurisdiction.objects.create(
        user=user, region=region, office=office, department=department, granted_by=actor
    )
    audit.record(
        actor, "accounts.jurisdiction.granted", created, after=audit.snapshot(created, AUDITED)
    )
