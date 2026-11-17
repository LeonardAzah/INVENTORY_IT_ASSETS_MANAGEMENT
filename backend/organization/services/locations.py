from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError

from ..models import Location
from .common import apply, lock, require_active

AUDITED = ("office", "region", "department", "name", "is_default", "is_active")

def _check_department(location, department):
    if department.office_id != location.office_id:
        raise DomainError(
            "DEPARTMENT_NOT_IN_OFFICE",
            "The department must belong to the location's office.",
            status_code=400,
        )
    require_active(department, "department")

@transaction.atomic
def create_location(actor, *, office, name, department=None):
    policy.require(actor, Code.LOCATION_MANAGE)
    office = lock(office)
    require_active(office, "office")
    location = Location(office=office, region_id=office.region_id, name=name)
    if department is not None:
        _check_department(location, department)
        location.department = department
    location.save()
    after = audit.snapshot(location, AUDITED)
    audit.record(actor, "organization.location.created", location, after=after)
    return location

@transaction.atomic
def update_location(actor, location, **changes):
    """`changes` may hold `name`, `department`, `is_default` and `is_active`."""
    policy.require(actor, Code.LOCATION_MANAGE)
    office = lock(location.office)
    location = lock(location)
    before = audit.snapshot(location, AUDITED)
    changed = apply(location, changes)
    if not changed:
        return location

    if "department" in changed and location.department is not None:
        _check_department(location, location.department)
    if "is_default" in changed and not location.is_default:
        raise DomainError(
            "DEFAULT_LOCATION_REQUIRED",
            "An office must keep a default location. Make another location the default.",
            status_code=400,
        )
    if "is_active" in changed and location.is_active:
        require_active(office, "office")
    if location.is_default and not location.is_active:
        raise DomainError(
            "DEFAULT_LOCATION",
            "The default location of an office cannot be inactive.",
        )

    if "is_default" in changed:
        previous = Location.objects.select_for_update().get(office=office, is_default=True)
        previous_before = audit.snapshot(previous, AUDITED)
        previous.is_default = False
        previous.save(update_fields=["is_default"])
        audit.record(
            actor,
            "organization.location.updated",
            previous,
            before=previous_before,
            after=audit.snapshot(previous, AUDITED),
        )
    location.save(update_fields=changed)
    after = audit.snapshot(location, AUDITED)
    audit.record(actor, "organization.location.updated", location, before=before, after=after)
    return location