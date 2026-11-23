"""Counts for the landing page, each limited to what the caller may see (U-18)."""

from django.db.models import Count, F, Sum

from assets import selectors as asset_selectors
from assets.choices import AssetStatus
from assets.models import AssetEvent
from inventory import selectors as inventory_selectors
from warehouses.selectors import warehouses_for

from .definitions import when

RECENT = 10


def build(user):
    warehouses = warehouses_for(user)
    balances = inventory_selectors.balances_for(user)
    assets = asset_selectors.assets_for(user)
    by_status = dict.fromkeys(AssetStatus.values, 0)
    by_status.update(
        {
            row["status"]: row["count"]
            for row in assets.order_by().values("status").annotate(count=Count("pk"))
        }
    )
    pending = asset_selectors.pending_receipt_lines(user).aggregate(
        units=Sum(F("quantity") - F("registered_quantity"))
    )["units"]
    pending_acquisitions = asset_selectors.pending_acquisitions(user).aggregate(
        units=Sum(F("quantity") - F("registered_quantity"))
    )["units"]

    movements = inventory_selectors.transactions_for(user).order_by("-occurred_at", "-id")[:RECENT]
    events = (
        AssetEvent.objects.filter(asset__in=assets)
        .select_related("asset", "actor")
        .order_by("-occurred_at", "-id")[:RECENT]
    )
    return {
        "warehouses": {
            "total": warehouses.count(),
            "active": warehouses.filter(is_active=True).count(),
        },
        "stock": {
            "items_in_stock": balances.filter(quantity_on_hand__gt=0).count(),
            "low_stock": balances.filter(low_stock_alerted=True).count(),
            "with_unavailable": balances.filter(quantity_unavailable__gt=0).count(),
        },
        "assets": {
            "total": sum(by_status.values()),
            "by_status": by_status,
            "pending_registration": int(pending or 0) + int(pending_acquisitions or 0),
        },
        "recent_movements": [
            {
                "occurred_at": when(entry.occurred_at),
                "warehouse": entry.warehouse.code,
                "item": entry.item.code,
                "type": entry.type,
                "quantity": str(entry.quantity_delta),
                "reference": entry.reference,
            }
            for entry in movements
        ],
        "recent_asset_events": [
            {
                "occurred_at": when(event.occurred_at),
                "asset_tag": event.asset.asset_tag,
                "event_type": event.event_type,
                "to_status": event.to_status,
                "by": event.actor.email,
            }
            for event in events
        ],
    }
