from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError

from ..choices import DepartmentKind, OfficeKind
from ..models import Department
from .common import apply, lock, require_active

AUDITED = ("office", "region", "kind", "code", "name", "is_active")

ALLOWED_KINDS = {
    OfficeKind.REGIONAL_OFFICE.value: {
        DepartmentKind.DEPARTMENT.value,
        DepartmentKind.REGIONAL_IT.value,
    },
    OfficeKind.COMMERCIAL_CENTER.value: {DepartmentKind.CENTER_UNIT.value},
}

@transaction.atomic
def create_department(actor, *, office, kind, code, name):
    policy.require(actor, Code.ORG_STRUCTURE_MANAGE)
    office = lock(office)
    require_active(office, "office")
    if kind not in ALLOWED_KINDS[office.kind]:
        raise DomainError(
            "DEPARTMENT_KIND_NOT_ALLOWED",
            f"A {office.get_kind_display().lower()} cannot hold a department of kind {kind}.",
            context={"office_kind": office.kind, "allowed": sorted(ALLOWED_KINDS[office.kind])},
            status_code=400,
        )
    department = Department.objects.create(
        office=office, region_id=office.region_id, kind=kind, code=code.upper(), name=name
    )
    after = audit.snapshot(department, AUDITED)
    audit.record(actor, "organization.department.created", department, after=after)
    return department

@transaction.atomic
def update_department(actor, department, **changes):
    """`changes` may hold `code`, `name` and `is_active`. Office and kind are fixed."""
    policy.require(actor, Code.ORG_STRUCTURE_MANAGE)
    department = lock(department)
    before = audit.snapshot(department, AUDITED)
    if "code" in changes:
        changes["code"] = changes["code"].upper()
    changed = apply(department, changes)
    if not changed:
        return department
    if "is_active" in changed and department.is_active:
        require_active(department.office, "office")
    department.save(update_fields=changed)
    after = audit.snapshot(department, AUDITED)
    audit.record(actor, "organization.department.updated", department, before=before, after=after)
    return department
