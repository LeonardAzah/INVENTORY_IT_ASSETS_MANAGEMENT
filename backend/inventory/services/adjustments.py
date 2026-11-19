from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core import quantities
from core.exceptions import DomainError
from core.quantities import ZERO

from ..choices import AdjustmentKind, TransactionType
from ..models import InventoryTransaction, StockAdjustment
from . import documents, ledger, units

def _deltas(kind, quantity):
    if kind == AdjustmentKind.QUANTITY:
        return quantity, ZERO
    if kind == AdjustmentKind.WRITE_OFF_UNAVAILABLE:
        return -quantity, -quantity
    if kind == AdjustmentKind.RESTORE_UNAVAILABLE:
        return ZERO, -quantity 
    return quantity, ZERO 

def post(actor, balance, kind, quantity_delta, unavailable_delta, reason, **extra):
    warehouse = balance.warehouse
    adjustment = StockAdjustment(
        reference=documents.new_reference("ADJ", warehouse),
        warehouse=warehouse,
        item_id=balance.item_id,
        kind=kind,
        quantity_delta=quantity_delta,
        unavailable_delta=unavailable_delta,
        previous_on_hand=balance.quantity_on_hand,
        resulting_on_hand=balance.quantity_on_hand + quantity_delta,
        reason=reason.strip(),
        created_by=actor,
        **extra,
    )
    opening = kind == AdjustmentKind.OPENING_BALANCE
    adjustment.ledger_entry = ledger.post_movement(
        balance,
        TransactionType.OPENING_BALANCE if opening else TransactionType.ADJUSTMENT,
        quantity_delta=quantity_delta,
        unavailable_delta=unavailable_delta,
        source_type="ADJUSTMENT",
        source_id=adjustment.pk,
        reference=adjustment.reference,
        actor=actor,
    )
    adjustment.save()
    audit.record(
        actor,
        "inventory.adjustment.created",
        adjustment,
        after={
            "warehouse": warehouse.pk,
            "item": balance.item_id,
            "kind": kind,
            "quantity_delta": quantity_delta,
            "unavailable_delta": unavailable_delta,
            "previous_on_hand": adjustment.previous_on_hand,
            "resulting_on_hand": adjustment.resulting_on_hand,
            "reason": adjustment.reason,
        },
    )
    return adjustment

_UNIT_RULES = {
    (AdjustmentKind.QUANTITY, 1): (True, None, units.IN_STOCK),
    (AdjustmentKind.OPENING_BALANCE, 1): (True, None, units.IN_STOCK),
    (AdjustmentKind.QUANTITY, -1): (False, (units.IN_STOCK,), units.WRITTEN_OFF),
    (AdjustmentKind.WRITE_OFF_UNAVAILABLE, 1): (False, (units.UNAVAILABLE,), units.WRITTEN_OFF),
    (AdjustmentKind.RESTORE_UNAVAILABLE, 1): (False, (units.UNAVAILABLE,), units.IN_STOCK),
}

@transaction.atomic
def create(
    actor,
    *,
    warehouse,
    item,
    kind,
    quantity,
    reason,
    serials=None,
    unit_ids=None,
    cross_item_serial_reason="",
    client_request_id=None,
):
    """A correction outside a stock-take. Stock is never edited or deleted: a mistake is
    corrected by another adjustment, each with its reason.
    """
    replay = documents.find_replay(StockAdjustment, actor, client_request_id)
    if replay is not None:
        return replay

    policy.require(actor, Code.INVENTORY_ADJUST, warehouse)
    documents.require_active_warehouse(warehouse)
    documents.require_item_fits(item, warehouse, must_be_active=False)
    quantities.validate(quantity, item.unit, allow_negative=kind == AdjustmentKind.QUANTITY)
    if not reason.strip():
        raise documents.invalid("REASON_REQUIRED", "An adjustment needs a reason.")
    incoming, statuses, to_status = _UNIT_RULES[(kind, 1 if quantity > 0 else -1)]
    line = {"item": item, "quantity": quantity, "serials": serials, "unit_ids": unit_ids}
    units.check_line(line, incoming=incoming)

    balance = ledger.lock_balances(warehouse, [item])[item.pk]
    if (
        kind == AdjustmentKind.OPENING_BALANCE
        and InventoryTransaction.objects.filter(warehouse=warehouse, item=item).exists()
    ):
        raise DomainError(
            "OPENING_BALANCE_NOT_ALLOWED",
            "This item already has movements in this warehouse. Use a quantity adjustment.",
        )
    quantity_delta, unavailable_delta = _deltas(kind, quantity)
    chosen = plan = None
    if units.tracks_units(item):
        if incoming:
            plan = units.plan_incoming(item, serials, cross_item_reason=cross_item_serial_reason)
        else:
            chosen = units.lock(item, warehouse, unit_ids, statuses=statuses)
    adjustment = post(
        actor,
        balance,
        kind,
        quantity_delta,
        unavailable_delta,
        reason,
        client_request_id=client_request_id,
    )
    moved = {"ledger_entry": adjustment.ledger_entry, "line_id": adjustment.pk}
    if chosen is not None:
        units.move(chosen, to_status=to_status, **moved)
    if plan is not None:
        units.bring_in(
            plan, item=item, warehouse=warehouse, to_status=to_status, actor=actor, **moved
        )
    if chosen is not None or plan is not None:
        audit.record(
            actor,
            "inventory.adjustment.units",
            adjustment,
            after={
                "serials": [serial for serial, _, _ in plan] if plan else units.serials_of(chosen),
                "cross_item_serial_reason": cross_item_serial_reason,
            },
        )
    return adjustment