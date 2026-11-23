from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError
from core.serials import normalize_serial
from warehouses.choices import WarehouseType

from ..choices import AssetSource, AssetStatus, EventType
from ..models import ITAsset
from . import common, custody, registration, requests
from .common import invalid

def _refuse_known_serial(normalized):
    """Step 1 of the reconciliation: a serial that already exists is not a discovery."""
    if normalized is None:
        return
    known = ITAsset.objects.filter(serial_normalized=normalized).first()
    if known is None:
        return
    context = {"asset_id": str(known.pk), "asset_tag": known.asset_tag}
    if known.status == AssetStatus.LOST:
        raise DomainError(
            "USE_FOUND_FLOW",
            f"This is asset {known.asset_tag}, which is recorded as lost. Record it as found.",
            context=context,
        )
    raise DomainError(
        "DUPLICATE_SERIAL",
        f"Asset {known.asset_tag} already has this serial number.",
        context=context,
    )

@transaction.atomic
@requests.idempotent(ITAsset, "discover")
def discover(
    actor,
    *,
    item,
    found_at_location,
    into_custody,
    notes,
    serial_number="",
    lot_number="",
    computer_details=None,
    candidate_receipt_line=None,
    candidate_acquisition=None,
):
    """Registers equipment that exists but has no record."""
    region_id = found_at_location.region_id
    policy.require(actor, Code.IT_ASSET_REGISTER, found_at_location)
    if item.warehouse_type != WarehouseType.IT:
        raise invalid("ITEM_NOT_SERIALIZED", f"Item {item.code} is not IT equipment.")
    if not notes.strip():
        raise invalid("NOTE_REQUIRED", "Say where and how the equipment was found.")
    if not found_at_location.is_active:
        raise invalid("LOCATION_INACTIVE", "The location is inactive.")
    if candidate_receipt_line is not None and candidate_acquisition is not None:
        raise invalid("ONE_CANDIDATE", "Give at most one candidate source.")
    _refuse_known_serial(normalize_serial(serial_number))

    source = receipt_warehouse = None
    kind = AssetSource.DISCOVERED
    if candidate_receipt_line is not None or candidate_acquisition is not None:
        source, source_region_id, receipt_warehouse = registration.lock_source(
            candidate_receipt_line, candidate_acquisition
        )
        if source.item_id != item.pk:
            raise invalid("CANDIDATE_ITEM_MISMATCH", "The candidate is for a different item.")
        if source_region_id != region_id:
            raise invalid("CANDIDATE_REGION_MISMATCH", "The candidate is in another region.")
        kind = (
            AssetSource.RECEIPT
            if candidate_receipt_line is not None
            else AssetSource.ALTERNATIVE_ACQUISITION
        )

    asset = registration.create_asset(
        actor,
        item=item,
        region_id=region_id,
        source=kind,
        receipt_line=source if kind == AssetSource.RECEIPT else None,
        acquisition=source if kind == AssetSource.ALTERNATIVE_ACQUISITION else None,
        serial_number=serial_number,
        lot_number=lot_number,
        computer_details=computer_details,
    )
    if source is not None:
        registration.count_registered(source)

    if kind == AssetSource.RECEIPT:
        asset.custody_warehouse = receipt_warehouse
        if not into_custody:
            custody.release(actor, asset)
    elif into_custody:
        custody.take_in(actor, asset, notes)
    if not into_custody:
        custody.set_location(actor, asset, found_at_location, notes)
    asset.save()

    common.event(
        actor,
        asset,
        EventType.REGISTERED,
        to_status=AssetStatus.UNKNOWN,
        reason=notes,
        details={
            "discovered": True,
            "source": kind,
            "source_id": str(source.pk) if source else None,
            "found_at_location": str(found_at_location.pk),
            "into_custody": into_custody,
        },
    )
    audit.record(
        actor,
        "assets.asset.discovered",
        asset,
        after={
            "asset_tag": asset.asset_tag,
            "item": item.pk,
            "serial_number": asset.serial_number,
            "source": kind,
            "source_id": source.pk if source else None,
            "found_at_location": found_at_location.pk,
            "into_custody": into_custody,
            "notes": notes,
        },
    )
    return asset
