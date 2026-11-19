from django.contrib.auth import get_user_model
from django.db import transaction

from accounts import policy
from accounts.choices import ProfileStatus, ResponsibilityCode
from accounts.models import COMPUTING_CHIEF, UserJurisdiction, UserProfile, UserResponsibility
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError
from core.quantities import fmt, has_valid_precision
from notifications.choices import Kind
from notifications.services import email
from warehouses.choices import WarehouseType
from warehouses.models import WarehouseAssignment

available_providers = {}

def available(balance):
    provider = available_providers.get(balance.warehouse.type)
    return provider(balance) if provider else balance.quantity_available

def recipients(warehouse):
    user_model = get_user_model()
    if warehouse.type == WarehouseType.IT:
        ids = set(
            UserResponsibility.objects.filter(
                region_id=warehouse.region_id,
                responsibility=ResponsibilityCode.IT_ASSET_MANAGER,
                ended_at__isnull=True,
            ).values_list("user_id", flat=True)
        )
        ids.update(
            UserProfile.objects.filter(
                COMPUTING_CHIEF, role_region_id=warehouse.region_id, status=ProfileStatus.ACTIVE
            ).values_list("user_id", flat=True)
        )
        return list(user_model.objects.filter(pk__in=ids, is_active=True))

    ids = set(
        WarehouseAssignment.objects.filter(warehouse=warehouse, ended_at__isnull=True).values_list(
            "user_id", flat=True
        )
    )
    keepers = list(user_model.objects.filter(pk__in=ids, is_active=True))
    candidates = user_model.objects.filter(
        pk__in=UserJurisdiction.objects.filter(
            region_id=warehouse.region_id, ended_at__isnull=True
        ).values("user_id"),
        is_active=True,
    ).exclude(pk__in=ids)
    managers = [
        user
        for user in candidates
        if not policy.context_for(user).sees_organization
        and policy.can(user, Code.INVENTORY_VIEW, warehouse)
    ]
    return keepers + managers

def _notify(balance, quantity):
    warehouse, item = balance.warehouse, balance.item
    for user in recipients(warehouse):
        email.send(
            Kind.LOW_STOCK,
            user.email,
            {
                "item": f"{item.code} {item.name}",
                "warehouse": f"{warehouse.code} {warehouse.name}",
                "available": fmt(quantity),
                "threshold": fmt(balance.low_stock_threshold),
                "unit": item.unit.code,
            },
            recipient_user=user,
            related=balance,
        )

def evaluate(balance):
    """Called after every movement. One alert each time available stock drops to the
    threshold; the flag is re-armed when stock rises above it again."""
    if balance.low_stock_threshold is None:
        return
    quantity = available(balance)
    low = quantity <= balance.low_stock_threshold
    if low == balance.low_stock_alerted:
        return
    balance.low_stock_alerted = low
    balance.save(update_fields=["low_stock_alerted"])
    if low:
        _notify(balance, quantity)

@transaction.atomic
def set_threshold(actor, *, warehouse, item, threshold):
    """Sets or clears (`None`) the low-stock threshold of an item in a warehouse. The alert
    flag is brought in line with the new value, without sending an email."""
    from . import ledger

    policy.require(actor, Code.INVENTORY_THRESHOLD_SET, warehouse)
    if item.warehouse_type != warehouse.type:
        raise DomainError(
            "ITEM_TYPE_MISMATCH",
            f"Item {item.code} does not belong in a {warehouse.type} warehouse.",
            status_code=400,
        )
    if threshold is not None and not has_valid_precision(threshold, item.unit.decimal_places):
        raise DomainError(
            "INVALID_QUANTITY_PRECISION",
            f"The unit {item.unit.code} allows {item.unit.decimal_places} decimal place(s).",
            status_code=400,
        )
    balance = ledger.lock_balances(warehouse, [item])[item.pk]
    before = {"threshold": balance.low_stock_threshold}
    balance.low_stock_threshold = threshold
    balance.low_stock_alerted = threshold is not None and available(balance) <= threshold
    balance.save(update_fields=["low_stock_threshold", "low_stock_alerted"])
    audit.record(
        actor, "inventory.threshold.set", balance, before=before, after={"threshold": threshold}
    )
    return balance
