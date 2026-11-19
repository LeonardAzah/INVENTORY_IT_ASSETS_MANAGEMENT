from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from warehouses.choices import WarehouseType

from ..choices import TransactionType
from ..models import ReceiptLine, StockReceipt
from . import documents, ledger, units

@transaction.atomic
def create_receipt(
    actor, *, warehouse, receipt_date, source, lines, notes="", client_request_id=None
):
    replay = documents.find_replay(StockReceipt, actor, client_request_id)
    if replay is not None:
        return replay

    code = Code.IT_STOCK_RECEIVE if warehouse.type == WarehouseType.IT else Code.INVENTORY_RECEIVE
    policy.require(actor, code, warehouse)
    documents.require_active_warehouse(warehouse)
    documents.require_not_future(receipt_date, "receipt date")
    documents.check_lines(lines, warehouse)
    for line in lines:
        units.check_line(line, incoming=True)

    receipt = StockReceipt.objects.create(
        reference=documents.new_reference("RCV", warehouse),
        warehouse=warehouse,
        receipt_date=receipt_date,
        source=source,
        notes=notes,
        client_request_id=client_request_id,
        created_by=actor,
    )
    receipt_lines = ReceiptLine.objects.bulk_create(
        [
            ReceiptLine(receipt=receipt, item=line["item"], quantity=line["quantity"])
            for line in lines
        ]
    )
    balances = ledger.lock_balances(warehouse, [line["item"] for line in lines])
    for line, receipt_line in zip(lines, receipt_lines, strict=True):
        item = line["item"]
        plan = None
        if units.tracks_units(item):
            plan = units.plan_incoming(
                item, line["serials"], cross_item_reason=line.get("cross_item_serial_reason", "")
            )
        entry = ledger.post_movement(
            balances[item.pk],
            TransactionType.RECEIPT,
            quantity_delta=line["quantity"],
            source_type="RECEIPT",
            source_id=receipt.pk,
            reference=receipt.reference,
            actor=actor,
        )
        if plan is not None:
            units.bring_in(
                plan,
                item=item,
                warehouse=warehouse,
                to_status=units.IN_STOCK,
                ledger_entry=entry,
                line_id=receipt_line.pk,
                actor=actor,
            )
    audit.record(
        actor,
        "inventory.receipt.created",
        receipt,
        after={
            "warehouse": warehouse.pk,
            "receipt_date": receipt_date,
            "source": source,
            "lines": [documents.audited_line(line) for line in lines],
        },
    )
    return receipt
