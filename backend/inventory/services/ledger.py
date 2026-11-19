from django.utils import timezone

from core.exceptions import DomainError
from core.quantities import ZERO, fmt

from ..models import InventoryBalance, InventoryTransaction
from . import thresholds

def lock_balances(warehouse, items):
    """Returns `{item id: balance}` with every row locked, creating missing rows first.

    Rows are locked in item-id order, so two transactions that touch the same items in
    the same warehouse never wait on each other in a cycle.
    """
    item_ids = sorted({item.pk for item in items})
    InventoryBalance.objects.bulk_create(
        [InventoryBalance(warehouse=warehouse, item_id=item_id) for item_id in item_ids],
        ignore_conflicts=True,
    )
    locked = (
        InventoryBalance.objects.select_for_update(of=("self",))
        .select_related("warehouse", "item__unit")
        .filter(warehouse=warehouse, item_id__in=item_ids)
        .order_by("item_id")
    )
    return {balance.item_id: balance for balance in locked}

def post_movement(
    balance,
    type,
    *,
    quantity_delta=ZERO,
    unavailable_delta=ZERO,
    source_type,
    source_id,
    reference,
    actor,
):
    """Applies one movement to a locked balance. Stock can never go negative, and
    unavailable stock can never exceed what is on hand; either rolls the caller back."""
    on_hand = balance.quantity_on_hand + quantity_delta
    unavailable = balance.quantity_unavailable + unavailable_delta
    if on_hand < ZERO or unavailable < ZERO or unavailable > on_hand:
        item = balance.item
        raise DomainError(
            "INSUFFICIENT_STOCK",
            f"Insufficient stock for item {item.code}: "
            f"{fmt(balance.quantity_available)} available, "
            f"{fmt(balance.quantity_unavailable)} unavailable.",
            context={
                "item_id": str(item.pk),
                "item_code": item.code,
                "on_hand": str(balance.quantity_on_hand),
                "unavailable": str(balance.quantity_unavailable),
                "available": str(balance.quantity_available),
            },
        )
    now = timezone.now()
    balance.quantity_on_hand = on_hand
    balance.quantity_unavailable = unavailable
    balance.last_movement_at = now
    balance.save(update_fields=["quantity_on_hand", "quantity_unavailable", "last_movement_at"])
    transaction = InventoryTransaction.objects.create(
        warehouse_id=balance.warehouse_id,
        item_id=balance.item_id,
        type=type,
        quantity_delta=quantity_delta,
        unavailable_delta=unavailable_delta,
        on_hand_after=on_hand,
        unavailable_after=unavailable,
        source_type=source_type,
        source_id=source_id,
        reference=reference,
        actor=actor,
        occurred_at=now,
    )
    thresholds.evaluate(balance)
    return transaction

def move(warehouse, item, type, quantity_delta, *, source_type, source_id, reference, actor):
    """Locks the balance and posts one movement. This is how the assets app reports that
    a unit crossed the IT warehouse boundary, without this app knowing about assets."""
    balance = lock_balances(warehouse, [item])[item.pk]
    return post_movement(
        balance,
        type,
        quantity_delta=quantity_delta,
        source_type=source_type,
        source_id=source_id,
        reference=reference,
        actor=actor,
    )
