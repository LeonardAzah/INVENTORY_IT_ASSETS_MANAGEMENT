from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError

from .. import state_machine
from ..choices import AssetStatus, EventType
from ..models import ComputerDetails, ITAsset
from . import common, custody, requests
from .common import invalid

DISPOSALS = (AssetStatus.LOST, AssetStatus.RETIRED)
DEDICATED = {
    AssetStatus.ASSIGNED: "assign",
    AssetStatus.RETURNED: "return",
    AssetStatus.UNKNOWN: "found",
}
COMPUTER_FIELDS = tuple(
    field.name for field in ComputerDetails._meta.fields if field.name != "asset"
)

def _snapshot(asset):
    return audit.snapshot(asset, common.AUDITED)

@transaction.atomic
@requests.idempotent(ITAsset, "change_status", on_target=True)
def change_status(actor, asset, *, to_status, reason, into_custody=None, location=None):
    code = Code.IT_ASSET_DISPOSE if to_status in DISPOSALS else Code.IT_ASSET_MAINTAIN
    policy.require(actor, code, asset)
    asset = common.lock(asset)
    if to_status in DEDICATED:
        raise invalid(
            "USE_DEDICATED_OPERATION",
            f"Use the {DEDICATED[AssetStatus(to_status)]} operation to make an asset {to_status}.",
        )
    from_status = asset.status
    state_machine.check(from_status, to_status)
    if not reason.strip():
        raise invalid("REASON_REQUIRED", "A status change needs a reason.")
    before = _snapshot(asset)
    affected = {asset.custody_warehouse}
    was_assigned = from_status == AssetStatus.ASSIGNED
    in_custody = asset.custody_warehouse_id is not None

    if to_status in DISPOSALS:
        if in_custody:
            custody.release(actor, asset, written_off=True)
    elif to_status == AssetStatus.AVAILABLE:
        # Only a unit that is in the warehouse can be handed out again.
        if not in_custody:
            if into_custody is not True:
                raise DomainError(
                    "NOT_IN_CUSTODY",
                    "This asset is not in the IT warehouse. Send into_custody=true to "
                    "record that it has been brought in.",
                )
            custody.take_in(actor, asset, reason)
    else:  # MAINTENANCE or DAMAGED
        if was_assigned and into_custody is None:
            raise invalid(
                "CUSTODY_DECISION_REQUIRED",
                "Say with into_custody whether the unit was brought into the IT warehouse.",
            )
        if into_custody and not in_custody:
            custody.take_in(actor, asset, reason)

    if was_assigned:
        common.close_assignment(actor, asset, f"{to_status}: {reason}")
    if location is not None and asset.custody_warehouse_id is None:
        common.check_location(asset, location)
        custody.set_location(actor, asset, location, reason)

    asset.status = to_status
    asset.save()
    common.track_maintenance(actor, asset, from_status, to_status, reason)
    common.event(
        actor,
        asset,
        EventType.STATUS_CHANGED,
        from_status=from_status,
        to_status=to_status,
        reason=reason,
    )
    affected.add(asset.custody_warehouse)
    for warehouse in affected:
        custody.reevaluate(warehouse, asset.item)
    common.record_audit(actor, "assets.asset.status_changed", asset, before, reason=reason)
    return asset

@transaction.atomic
@requests.idempotent(ITAsset, "assign", on_target=True)
def assign(actor, asset, *, assignee_type, location, employee=None, department=None, notes=""):
    """Gives the asset to an employee, a department or a location. Reassigning closes the
    current assignment and opens the new one. Linked peripherals are never moved along:
    each is its own asset and is handled explicitly."""
    policy.require(actor, Code.IT_ASSET_ASSIGN, asset)
    asset = common.lock(asset)
    from_status = asset.status
    state_machine.check(from_status, AssetStatus.ASSIGNED)
    placement = {
        "assignee_type": assignee_type,
        "location": location,
        "employee": employee,
        "department": department,
    }
    common.check_placement(asset, **placement)
    before = _snapshot(asset)
    warehouse = asset.custody_warehouse

    common.close_assignment(actor, asset, "Reassigned")
    if warehouse is not None:
        custody.release(actor, asset)
    assignment = common.deploy(actor, asset, **placement, notes=notes)
    asset.save()

    common.event(
        actor,
        asset,
        EventType.ASSIGNED,
        from_status=from_status,
        to_status=AssetStatus.ASSIGNED,
        details=common.assignee_details(assignment),
    )
    custody.reevaluate(warehouse, asset.item)
    common.record_audit(
        actor, "assets.asset.assigned", asset, before, **common.assignee_details(assignment)
    )
    common.notify_assignee(asset, assignment)
    return asset

@transaction.atomic
@requests.idempotent(ITAsset, "return_asset", on_target=True)
def return_asset(actor, asset, *, condition_notes):
    policy.require(actor, Code.IT_ASSET_RETURN, asset)
    asset = common.lock(asset)
    state_machine.check(asset.status, AssetStatus.RETURNED)
    before = _snapshot(asset)

    common.close_assignment(actor, asset, condition_notes)
    custody.take_in(actor, asset, "Returned")
    asset.status = AssetStatus.RETURNED
    asset.save()
    common.event(
        actor,
        asset,
        EventType.RETURNED,
        from_status=AssetStatus.ASSIGNED,
        to_status=AssetStatus.RETURNED,
        reason=condition_notes,
    )
    common.record_audit(actor, "assets.asset.returned", asset, before, condition=condition_notes)
    return asset

@transaction.atomic
@requests.idempotent(ITAsset, "relocate", on_target=True)
def relocate(actor, asset, *, location, reason):
    policy.require(actor, Code.IT_ASSET_RELOCATE, asset)
    asset = common.lock(asset)
    if asset.custody_warehouse_id is not None:
        raise DomainError(
            "ASSET_IN_WAREHOUSE", "This asset is in the IT warehouse. Assign it to move it out."
        )
    if asset.status in DISPOSALS:
        raise DomainError(
            "INVALID_TRANSITION", f"An asset that is {asset.status} cannot be relocated."
        )
    common.check_location(asset, location)
    if asset.location_id == location.pk:
        raise DomainError("SAME_LOCATION", "The asset is already at this location.")
    before = _snapshot(asset)
    previous = asset.location
    custody.set_location(actor, asset, location, reason)
    asset.save()
    common.event(
        actor,
        asset,
        EventType.RELOCATED,
        reason=reason,
        details={
            "from_location": str(previous.pk) if previous else None,
            "to_location": str(location.pk),
        },
    )
    common.record_audit(actor, "assets.asset.relocated", asset, before, reason=reason)
    return asset

@transaction.atomic
@requests.idempotent(ITAsset, "found", on_target=True)
def found(actor, asset, *, found_at_location, into_custody, notes):
    """A lost asset turns up. It becomes UNKNOWN and is then verified like a discovery;
    the LOST period stays in its history."""
    policy.require(actor, Code.IT_ASSET_MAINTAIN, asset)
    asset = common.lock(asset)
    if asset.status != AssetStatus.LOST:
        state_machine.check(asset.status, AssetStatus.UNKNOWN)
    if not notes.strip():
        raise invalid("NOTE_REQUIRED", "Say where and how the asset was found.")
    common.check_location(asset, found_at_location)
    before = _snapshot(asset)

    asset.status = AssetStatus.UNKNOWN
    if into_custody:
        custody.take_in(actor, asset, notes)
    else:
        custody.set_location(actor, asset, found_at_location, notes)
    asset.save()
    common.event(
        actor,
        asset,
        EventType.FOUND,
        from_status=AssetStatus.LOST,
        to_status=AssetStatus.UNKNOWN,
        reason=notes,
        details={"found_at_location": str(found_at_location.pk), "into_custody": into_custody},
    )
    common.record_audit(actor, "assets.asset.found", asset, before, notes=notes)
    return asset

@transaction.atomic
def update(actor, asset, **changes):
    policy.require(actor, Code.IT_ASSET_UPDATE, asset)
    asset = common.lock(asset)
    before, after = {}, {}

    for name in ("lot_number", "critical_observations"):
        if name in changes and getattr(asset, name) != changes[name]:
            before[name], after[name] = getattr(asset, name), changes[name]
            setattr(asset, name, changes[name])

    details = changes.get("computer_details")
    if details:
        specs = ComputerDetails.objects.filter(asset=asset).first()
        if specs is None:
            raise invalid("NOT_A_COMPUTER", "Only computers have computer details.")
        changed = [name for name, value in details.items() if getattr(specs, name) != value]
        for name in changed:
            before[f"computer.{name}"] = getattr(specs, name)
            after[f"computer.{name}"] = details[name]
            setattr(specs, name, details[name])
        if changed:
            specs.save(update_fields=changed)

    if not after:
        return asset
    asset.save()
    common.event(actor, asset, EventType.SPEC_CHANGED, details={"before": before, "after": after})
    audit.record(actor, "assets.asset.updated", asset, before=before, after=after)
    return asset
