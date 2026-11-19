from collections import defaultdict

from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError
from core.quantities import ZERO, fmt

from ..choices import ReturnCondition, TransactionType
from ..models import IssueLine, ReturnLine, StockReturn
from . import documents, ledger, units

def _settle_against_issue(issue, lines):
    """Locks the issue's lines and books the returned quantities on them. A return can
    never exceed what is still outstanding on the issue it refers to."""
    returned = defaultdict(lambda: ZERO)
    for line in lines:
        returned[line["item"].pk] += line["quantity"]
    issue_lines = {
        issue_line.item_id: issue_line
        for issue_line in IssueLine.objects.select_for_update().filter(issue=issue)
    }
    for line in lines:
        item = line["item"]
        issue_line = issue_lines.get(item.pk)
        if issue_line is None:
            raise documents.invalid(
                "ITEM_NOT_ON_ISSUE",
                f"Item {item.code} was not on issue {issue.reference}.",
                item_id=str(item.pk),
            )
        line["issue_line"] = issue_line
    for item_id, quantity in returned.items():
        issue_line = issue_lines[item_id]
        outstanding = issue_line.quantity - issue_line.returned_quantity
        if quantity > outstanding:
            raise DomainError(
                "RETURN_EXCEEDS_ISSUE",
                f"Only {fmt(outstanding)} of this item is still outstanding on {issue.reference}.",
                context={"item_id": str(item_id), "outstanding": str(outstanding)},
            )
        issue_line.returned_quantity += quantity
        issue_line.save(update_fields=["returned_quantity"])

@transaction.atomic
def create_return(
    actor,
    *,
    warehouse,
    return_date,
    employee,
    lines,
    issue=None,
    notes="",
    client_request_id=None,
):
    """Takes stock back from an employee. GOOD units become available again; DAMAGED
    units are counted on hand but unavailable until written off or restored.
    """
    replay = documents.find_replay(StockReturn, actor, client_request_id)
    if replay is not None:
        return replay

    policy.require(actor, Code.INVENTORY_RETURN, warehouse)
    documents.require_active_warehouse(warehouse)
    documents.require_not_future(return_date, "return date")
    if issue is None:
        if not notes.strip():
            raise documents.invalid(
                "NOTE_REQUIRED", "A return that is not linked to an issue needs a note."
            )
    else:
        if issue.warehouse_id != warehouse.pk:
            raise documents.invalid(
                "ISSUE_FROM_OTHER_WAREHOUSE", "That issue was made from another warehouse."
            )
        if issue.recipient_store_id is not None:
            # Stock issued to a store is that store's once received; it is not returned
            # against this issue (that would make the pair a transfer) [REQ 1.1].
            raise documents.invalid(
                "ISSUE_TO_A_STORE", "That issue was made to a store, not to an employee."
            )
        if issue.employee_id != employee.pk:
            raise documents.invalid(
                "ISSUE_TO_OTHER_EMPLOYEE", "That issue was made to another employee."
            )
    # An item or an employee that has since been deactivated can still be returned.
    documents.check_lines(lines, warehouse, must_be_active=False)
    for line in lines:
        units.check_line(line, incoming=issue is None)
    if issue is not None:
        _settle_against_issue(issue, lines)

    stock_return = StockReturn.objects.create(
        reference=documents.new_reference("RET", warehouse),
        warehouse=warehouse,
        return_date=return_date,
        employee=employee,
        issue=issue,
        notes=notes,
        client_request_id=client_request_id,
        created_by=actor,
    )
    return_lines = ReturnLine.objects.bulk_create(
        [
            ReturnLine(
                stock_return=stock_return,
                item=line["item"],
                quantity=line["quantity"],
                condition=line["condition"],
                issue_line=line.get("issue_line"),
            )
            for line in lines
        ]
    )
    balances = ledger.lock_balances(warehouse, [line["item"] for line in lines])
    for line, return_line in zip(lines, return_lines, strict=True):
        item = line["item"]
        damaged = line["condition"] == ReturnCondition.DAMAGED
        to_status = units.UNAVAILABLE if damaged else units.IN_STOCK
        chosen = plan = None
        if units.tracks_units(item) and issue is not None:
            issue_line = line["issue_line"]
            chosen = units.lock(
                item,
                warehouse,
                line["unit_ids"],
                statuses=(units.ISSUED,),
                error_code="UNIT_NOT_ON_ISSUE",
                check=lambda unit, issue_line=issue_line: (
                    unit.current_issue_line_id == issue_line.pk
                ),
            )
        elif units.tracks_units(item):
            plan = units.plan_incoming(
                item,
                line["serials"],
                cross_item_reason=line.get("cross_item_serial_reason", ""),
                # Issued to someone else, it is not this employee's to return.
                may_take=lambda unit: (
                    unit.status == units.WRITTEN_OFF or unit.issued_to_employee_id == employee.pk
                ),
            )
        entry = ledger.post_movement(
            balances[item.pk],
            TransactionType.RETURN,
            quantity_delta=line["quantity"],
            unavailable_delta=line["quantity"] if damaged else ZERO,
            source_type="RETURN",
            source_id=stock_return.pk,
            reference=stock_return.reference,
            actor=actor,
        )
        if chosen is not None:
            units.move(chosen, to_status=to_status, ledger_entry=entry, line_id=return_line.pk)
        if plan is not None:
            units.bring_in(
                plan,
                item=item,
                warehouse=warehouse,
                to_status=to_status,
                ledger_entry=entry,
                line_id=return_line.pk,
                actor=actor,
            )
    audit.record(
        actor,
        "inventory.return.created",
        stock_return,
        after={
            "warehouse": warehouse.pk,
            "return_date": return_date,
            "employee": employee.pk,
            "issue": issue.pk if issue else None,
            "lines": [documents.audited_line(line, condition=line["condition"]) for line in lines],
        },
    )
    return stock_return