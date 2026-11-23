from django.utils import timezone

from core.exceptions import DomainError
from inventory.choices import TransactionType
from inventory.services import ledger, thresholds
from warehouses.choices import WarehouseType
from warehouses.models import Warehouse

from ..models import AssetLocationHistory

ONE = 1

def it_warehouse(region_id):
    """The active IT warehouse of a region."""
    warehouse = Warehouse.objects.filter(
        region_id=region_id, type=WarehouseType.IT, is_active=True
    ).first()
    if warehouse is None:
        raise DomainError(
            "NO_IT_WAREHOUSE", "This region has no active IT warehouse to hold the asset."
        )
    return warehouse

def _post(actor, asset, warehouse, type, delta):
    ledger.move(
        warehouse,
        asset.item,
        type,
        delta,
        source_type="ASSET",
        source_id=asset.pk,
        reference=asset.asset_tag,
        actor=actor,
    )

def set_location(actor, asset, location, reason=""):
    """Records where the unit now is (None: in the warehouse). Not a stock movement."""
    if asset.location_id == (location.pk if location else None):
        return
    AssetLocationHistory.objects.create(
        asset=asset,
        from_location=asset.location,
        to_location=location,
        moved_by=actor,
        moved_at=timezone.now(),
        reason=reason,
    )
    asset.location = location

def take_in(actor, asset, reason=""):
    """The unit physically enters its region's IT warehouse: ASSET_IN +1."""
    warehouse = it_warehouse(asset.region_id)
    _post(actor, asset, warehouse, TransactionType.ASSET_IN, ONE)
    asset.custody_warehouse = warehouse
    set_location(actor, asset, None, reason)

def release(actor, asset, *, written_off=False):
    """The unit leaves the IT warehouse: ASSET_OUT -1, or ASSET_WRITE_OFF -1 when it is
    lost or retired while in custody."""
    type = TransactionType.ASSET_WRITE_OFF if written_off else TransactionType.ASSET_OUT
    _post(actor, asset, asset.custody_warehouse, type, -ONE)
    asset.custody_warehouse = None

def reevaluate(warehouse, item):
    """Re-checks the low-stock flag after a change that altered how many units are
    AVAILABLE without moving a quantity (e.g. AVAILABLE -> MAINTENANCE in the warehouse)."""
    if warehouse is None:
        return
    thresholds.evaluate(ledger.lock_balances(warehouse, [item])[item.pk])
