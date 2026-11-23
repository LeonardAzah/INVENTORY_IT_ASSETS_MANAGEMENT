from django.utils import timezone

from audit import services as audit
from core.exceptions import DomainError
from notifications.choices import Kind
from notifications.services import email

from ..choices import AssetStatus, AssigneeType
from ..models import AssetAssignment, AssetEvent, AssetMaintenance, ITAsset
from . import custody

AUDITED = ("status", "custody_warehouse", "location", "current_assignment")

def invalid(error_code, message, **context):
    return DomainError(error_code, message, context=context, status_code=400)

def lock(asset):
    """Re-reads the asset under a row lock, with what the services need alongside."""
    return (
        ITAsset.objects.select_for_update(of=("self",))
        .select_related("item__unit", "region", "location", "custody_warehouse")
        .get(pk=asset.pk)
    )

def event(actor, asset, event_type, *, from_status="", to_status="", reason="", details=None):
    return AssetEvent.objects.create(
        asset=asset,
        event_type=event_type,
        from_status=from_status or "",
        to_status=to_status or "",
        reason=reason,
        details=details or {},
        actor=actor,
    )

def track_maintenance(actor, asset, from_status, to_status, reason):
    """Opens a maintenance record on entering MAINTENANCE and closes it on leaving."""
    now = timezone.now()
    if from_status == AssetStatus.MAINTENANCE and to_status != AssetStatus.MAINTENANCE:
        AssetMaintenance.objects.filter(asset=asset, closed_at__isnull=True).update(
            closed_by=actor, closed_at=now, outcome=f"{to_status}: {reason}"
        )
    if to_status == AssetStatus.MAINTENANCE and from_status != AssetStatus.MAINTENANCE:
        AssetMaintenance.objects.create(
            asset=asset, opened_by=actor, opened_at=now, description=reason
        )

def close_assignment(actor, asset, condition=""):
    assignment = asset.current_assignment
    if assignment is None:
        return
    assignment.returned_by = actor
    assignment.returned_at = timezone.now()
    assignment.return_condition = condition[:255]
    assignment.save(update_fields=["returned_by", "returned_at", "return_condition"])
    asset.current_assignment = None

def check_placement(asset, *, assignee_type, location, employee=None, department=None):
    """Who and where an asset may go: everything must be active and in the asset's
    region, since IT authority is regional (U-14)."""
    wanted = {
        AssigneeType.EMPLOYEE: (employee is not None, department is None),
        AssigneeType.DEPARTMENT: (employee is None, department is not None),
        AssigneeType.LOCATION: (employee is None, department is None),
    }[AssigneeType(assignee_type)]
    if not all(wanted):
        raise invalid(
            "ASSIGNEE_MISMATCH",
            "Give employee_id for EMPLOYEE, department_id for DEPARTMENT, and neither for "
            "LOCATION.",
        )
    check_location(asset, location)
    for target, what in ((employee, "employee"), (department, "department")):
        if target is None:
            continue
        if not target.is_active:
            raise invalid("ASSIGNEE_INACTIVE", f"The {what} is inactive.")
        if target.region_id != asset.region_id:
            raise invalid("ASSIGNEE_NOT_IN_REGION", f"The {what} must be in the asset's region.")

def check_location(asset, location):
    if not location.is_active:
        raise invalid("LOCATION_INACTIVE", "The location is inactive.")
    if location.region_id != asset.region_id:
        raise invalid("LOCATION_NOT_IN_REGION", "The location must be in the asset's region.")

def deploy(actor, asset, *, assignee_type, location, employee=None, department=None, notes=""):
    """Opens an assignment and puts the asset at its location. The caller has already
    validated the placement, taken the unit out of custody and locked the asset."""
    assignment = AssetAssignment.objects.create(
        asset=asset,
        assignee_type=assignee_type,
        employee=employee,
        department=department,
        location=location,
        assigned_by=actor,
        notes=notes,
    )
    asset.status = AssetStatus.ASSIGNED
    asset.current_assignment = assignment
    custody.set_location(actor, asset, location, "Assigned")
    return assignment

def notify_assignee(asset, assignment):
    employee = assignment.employee
    if employee is None or not employee.email:
        return
    email.send(
        Kind.ASSET_ASSIGNED,
        employee.email,
        {
            "name": employee.first_name,
            "asset": asset.item.name,
            "tag": asset.asset_tag,
            "location": assignment.location.name,
        },
        related=asset,
    )

def record_audit(actor, action, asset, before, **extra):
    audit.record(
        actor, action, asset, before=before, after={**audit.snapshot(asset, AUDITED), **extra}
    )

def assignee_details(assignment):
    return {
        "assignee_type": assignment.assignee_type,
        "employee": str(assignment.employee_id) if assignment.employee_id else None,
        "department": str(assignment.department_id) if assignment.department_id else None,
        "location": str(assignment.location_id),
    }
