from django.db import transaction
from django.utils import timezone

from audit import services as audit
from core.exceptions import DomainError

from .. import policy
from ..choices import ProfileStatus
from ..models import UserJurisdiction
from ..policy import Code
from . import posts

AUDITED = ("user", "region", "office", "department", "ended_at")

def _invalid(error_code, message):
    return DomainError(error_code, message, status_code=400)

@transaction.atomic
def grant(actor, user, *, region=None, office=None, department=None):
    """Gives `user` a management scope. Pass the most specific level: a department implies
    its office and region, an office implies its region."""
    policy.require(actor, Code.JURISDICTION_MANAGE)

    if department is not None:
        if office is not None and department.office_id != office.pk:
            raise _invalid("DEPARTMENT_NOT_IN_OFFICE", "The department is not in that office.")
        office = department.office
    if office is not None:
        if region is not None and office.region_id != region.pk:
            raise _invalid("OFFICE_NOT_IN_REGION", "The office is not in that region.")
        region = office.region
    if region is None:
        raise _invalid("JURISDICTION_EMPTY", "Give a region, an office or a department.")
    for target, what in ((region, "region"), (office, "office"), (department, "department")):
        if target is not None and not target.is_active:
            raise _invalid("INACTIVE_TARGET", f"The {what} {target.code} is inactive.")

    profile = getattr(user, "profile", None)
    if profile is None:
        raise _invalid("NO_PROFILE", "This account has no user profile.")
    if profile.status == ProfileStatus.DEACTIVATED:
        raise DomainError(
            "ACCOUNT_DEACTIVATED", "A deactivated account cannot be given a jurisdiction."
        )

    jurisdiction = UserJurisdiction.objects.create(
        user=user, region=region, office=office, department=department, granted_by=actor
    )
    audit.record(
        actor,
        "accounts.jurisdiction.granted",
        jurisdiction,
        after=audit.snapshot(jurisdiction, AUDITED),
    )
    posts.sync_computing_chief(actor, user)
    return jurisdiction


@transaction.atomic
def end(actor, jurisdiction):
    """Ends a jurisdiction. The row is kept as history."""
    policy.require(actor, Code.JURISDICTION_MANAGE)
    jurisdiction = UserJurisdiction.objects.select_for_update().get(pk=jurisdiction.pk)
    if jurisdiction.ended_at is not None:
        raise DomainError("JURISDICTION_ENDED", "This jurisdiction has already ended.")
    before = audit.snapshot(jurisdiction, AUDITED)
    jurisdiction.ended_at = timezone.now()
    jurisdiction.ended_by = actor
    jurisdiction.save(update_fields=["ended_at", "ended_by"])
    audit.record(
        actor,
        "accounts.jurisdiction.ended",
        jurisdiction,
        before=before,
        after=audit.snapshot(jurisdiction, AUDITED),
    )
    posts.sync_computing_chief(actor, jurisdiction.user)
    return jurisdiction
