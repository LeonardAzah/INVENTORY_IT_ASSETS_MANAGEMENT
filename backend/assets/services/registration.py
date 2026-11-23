from django.db import transaction
from django.utils import timezone

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError
from core.references import asset_tag, document_reference
from core.serials import normalize_serial
from inventory.models import ReceiptLine
from items.choices import AssetClass
from warehouses.choices import WarehouseType

from ..choices import AssetSource, AssetStatus, EventType
from ..models import AcquisitionRecord, ComputerDetails, ITAsset
from . import common, custody, requests
from .common import invalid

ACQUISITION_AUDITED = ("region", "item", "quantity", "acquisition_date", "source")

def check_serial(item, normalized, confirm_reason=""):
    if normalized is None:
        return
    for other in ITAsset.objects.filter(serial_normalized=normalized).select_related("item"):
        if other.item_id == item.pk:
            raise DomainError(
                "DUPLICATE_SERIAL",
                f"Asset {other.asset_tag} of this item already has this serial number.",
                context={"asset_id": str(other.pk), "asset_tag": other.asset_tag},
            )
        if not confirm_reason.strip():
            raise DomainError(
                "SERIAL_ON_OTHER_ITEM",
                f"This serial number is already registered as {other.item.code} "
                f"({other.asset_tag}). Send confirm_cross_item_serial with a reason if it "
                "really is a different device.",
                context={
                    "asset_id": str(other.pk),
                    "asset_tag": other.asset_tag,
                    "item_code": other.item.code,
                },
            )

def create_asset(
    actor,
    *,
    item,
    region_id,
    source,
    receipt_line=None,
    acquisition=None,
    serial_number="",
    lot_number="",
    computer_details=None,
    confirm_cross_item_serial="",
):
    if computer_details and item.asset_class != AssetClass.COMPUTER:
        raise invalid("NOT_A_COMPUTER", "Only computers have computer details.")
    normalized = normalize_serial(serial_number)
    check_serial(item, normalized, confirm_cross_item_serial)
    asset = ITAsset.objects.create(
        asset_tag=asset_tag(item_region_code(region_id)),
        item=item,
        region_id=region_id,
        serial_number=(serial_number or "").strip(),
        serial_normalized=normalized,
        lot_number=(lot_number or "").strip(),
        status=AssetStatus.UNKNOWN,
        source=source,
        receipt_line=receipt_line,
        acquisition=acquisition,
        registered_by=actor,
    )
    if item.asset_class == AssetClass.COMPUTER:
        ComputerDetails.objects.create(asset=asset, **(computer_details or {}))
    return asset


def item_region_code(region_id):
    from organization.models import Region

    return Region.objects.values_list("code", flat=True).get(pk=region_id)

def lock_source(receipt_line=None, acquisition=None):
    if (receipt_line is None) == (acquisition is None):
        raise invalid("SOURCE_REQUIRED", "Give either receipt_line_id or acquisition_id.")
    if receipt_line is not None:
        line = (
            ReceiptLine.objects.select_for_update(of=("self",))
            .select_related("receipt__warehouse", "item__unit")
            .get(pk=receipt_line.pk)
        )
        warehouse = line.receipt.warehouse
        if warehouse.type != WarehouseType.IT:
            raise invalid("NOT_AN_IT_RECEIPT", "Assets are registered against IT receipts only.")
        source, region_id = line, warehouse.region_id
    else:
        source = (
            AcquisitionRecord.objects.select_for_update(of=("self",))
            .select_related("item__unit")
            .get(pk=acquisition.pk)
        )
        warehouse, region_id = None, source.region_id
    if source.registered_quantity >= source.quantity:
        raise DomainError(
            "NOTHING_LEFT_TO_REGISTER", "Every unit of this source is already registered."
        )
    return source, region_id, warehouse

def count_registered(source):
    source.registered_quantity += 1
    source.save(update_fields=["registered_quantity"])

def _register(actor, *, receipt_line=None, acquisition=None, deployed=None, **details):
    source, region_id, receipt_warehouse = lock_source(receipt_line, acquisition)
    policy.require(actor, Code.IT_ASSET_REGISTER, source if acquisition else receipt_warehouse)
    from_receipt = receipt_line is not None
    asset = create_asset(
        actor,
        item=source.item,
        region_id=region_id,
        source=AssetSource.RECEIPT if from_receipt else AssetSource.ALTERNATIVE_ACQUISITION,
        receipt_line=source if from_receipt else None,
        acquisition=None if from_receipt else source,
        **details,
    )
    count_registered(source)

    if from_receipt:
        asset.custody_warehouse = receipt_warehouse
    if deployed is not None:
        common.check_placement(asset, **deployed)
        if from_receipt:
            custody.release(actor, asset) 
        assignment = common.deploy(actor, asset, **deployed)
    else:
        assignment = None
        if not from_receipt:
            custody.take_in(actor, asset) 
        asset.status = AssetStatus.AVAILABLE
    asset.save()
    if deployed is None:
        custody.reevaluate(asset.custody_warehouse, asset.item)

    common.event(
        actor,
        asset,
        EventType.REGISTERED,
        to_status=asset.status,
        details={
            "source": asset.source,
            "source_id": str(source.pk),
            "deployed": common.assignee_details(assignment) if assignment else None,
        },
    )
    audit.record(
        actor,
        "assets.asset.registered",
        asset,
        after={
            "asset_tag": asset.asset_tag,
            "item": asset.item_id,
            "serial_number": asset.serial_number,
            "source": asset.source,
            "source_id": source.pk,
            "status": asset.status,
            "cross_item_serial_reason": details.get("confirm_cross_item_serial") or None,
        },
    )
    if assignment is not None:
        common.notify_assignee(asset, assignment)
    return asset

@transaction.atomic
@requests.idempotent(ITAsset, "register")
def register(actor, **data):
    """Registers one unit against an IT receipt line or an acquisition record.

    The unit is taken to be in the IT warehouse unless `deployed` says who already has
    it. Registration itself never changes a quantity; see `custody` for when one moves.
    """
    return _register(actor, **data)

@transaction.atomic
@requests.idempotent(ITAsset, "register_bulk", many=True)
def register_bulk(actor, *, receipt_line, units):
    """Registers many units of one receipt line, all in the warehouse. All or nothing."""
    return [_register(actor, receipt_line=receipt_line, **unit) for unit in units]

@transaction.atomic
@requests.idempotent(AcquisitionRecord, "record_acquisition")
def record_acquisition(actor, *, region, item, quantity, acquisition_date, source, notes=""):

    policy.require(actor, Code.IT_ACQUISITION_RECORD, region)
    if item.warehouse_type != WarehouseType.IT:
        raise invalid("ITEM_NOT_SERIALIZED", f"Item {item.code} is not IT equipment.")
    if not item.is_active:
        raise invalid("ITEM_INACTIVE", f"Item {item.code} is inactive.")
    if not region.is_active:
        raise invalid("INACTIVE_TARGET", f"The region {region.code} is inactive.")
    if acquisition_date > timezone.localdate():
        raise invalid("FUTURE_DATE", "The acquisition date cannot be in the future.")
    acquisition = AcquisitionRecord.objects.create(
        reference=document_reference("ACQ", region.code, timezone.localdate().year),
        region=region,
        item=item,
        quantity=quantity,
        acquisition_date=acquisition_date,
        source=source,
        notes=notes,
        recorded_by=actor,
    )
    audit.record(
        actor,
        "assets.acquisition.recorded",
        acquisition,
        after=audit.snapshot(acquisition, ACQUISITION_AUDITED),
    )
    return acquisition
