from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from warehouses.choices import WarehouseType
from warehouses.models import Warehouse

from ..choices import TransactionType
from ..models import IssueLine, StockIssue
from . import documents, ledger, units

def recipient_stores(warehouse):
    return (
        Warehouse.objects.filter(
            region_id=warehouse.region_id, type=WarehouseType.GENERAL, is_active=True
        )
        .exclude(pk=warehouse.pk)
        .order_by("code")
    )

def _check_recipient(warehouse, employee, recipient_store):
    """An employee of the warehouse's region , or a requesting store: an
    active GENERAL warehouse of the same region, other than this one."""
    if (employee is None) == (recipient_store is None):
        raise documents.invalid(
            "ONE_RECIPIENT", "Name the recipient: either an employee or a requesting store."
        )
    if employee is not None:
        if not employee.is_active:
            raise documents.invalid("EMPLOYEE_INACTIVE", "The recipient is not an active employee.")
        if employee.region_id != warehouse.region_id:
            raise documents.invalid(
                "EMPLOYEE_NOT_IN_REGION", "The recipient must work in the warehouse's region."
            )
        return
    if recipient_store.pk == warehouse.pk:
        raise documents.invalid("RECIPIENT_STORE_IS_ISSUER", "A store cannot issue to itself.")
    if recipient_store.type != WarehouseType.GENERAL:
        raise documents.invalid(
            "RECIPIENT_STORE_NOT_GENERAL",
            "Stock is issued to a general store; IT equipment is assigned, not issued.",
        )
    if not recipient_store.is_active:
        raise documents.invalid("RECIPIENT_STORE_INACTIVE", "The requesting store is inactive.")
    if recipient_store.region_id != warehouse.region_id:
        raise documents.invalid(
            "RECIPIENT_STORE_NOT_IN_REGION",
            "The requesting store must be in the warehouse's region.",
        )

@transaction.atomic
def create_issue(
    actor,
    *,
    warehouse,
    issue_date,
    lines,
    employee=None,
    recipient_store=None,
    notes="",
    client_request_id=None,
):
    replay = documents.find_replay(StockIssue, actor, client_request_id)
    if replay is not None:
        return replay

    policy.require(actor, Code.INVENTORY_ISSUE, warehouse)
    documents.require_active_warehouse(warehouse)
    documents.require_not_future(issue_date, "issue date")
    _check_recipient(warehouse, employee, recipient_store)
    documents.check_lines(lines, warehouse)
    for line in lines:
        units.check_line(line, incoming=False)

    issue = StockIssue.objects.create(
        reference=documents.new_reference("ISS", warehouse),
        warehouse=warehouse,
        issue_date=issue_date,
        employee=employee,
        recipient_store=recipient_store,
        notes=notes,
        client_request_id=client_request_id,
        created_by=actor,
    )
    issue_lines = IssueLine.objects.bulk_create(
        [IssueLine(issue=issue, item=line["item"], quantity=line["quantity"]) for line in lines]
    )
    balances = ledger.lock_balances(warehouse, [line["item"] for line in lines])
    for line, issue_line in zip(lines, issue_lines, strict=True):
        item = line["item"]
        chosen = None
        if units.tracks_units(item):
            chosen = units.lock(item, warehouse, line["unit_ids"], statuses=(units.IN_STOCK,))
        entry = ledger.post_movement(
            balances[item.pk],
            TransactionType.ISSUE,
            quantity_delta=-line["quantity"],
            source_type="ISSUE",
            source_id=issue.pk,
            reference=issue.reference,
            actor=actor,
        )
        if chosen is not None:
            units.move(
                chosen,
                to_status=units.ISSUED,
                ledger_entry=entry,
                line_id=issue_line.pk,
                issue_line=issue_line,
                employee=employee,
                store=recipient_store,
            )
    audit.record(
        actor,
        "inventory.issue.created",
        issue,
        after={
            "warehouse": warehouse.pk,
            "issue_date": issue_date,
            "employee": employee.pk if employee else None,
            "recipient_store": recipient_store.pk if recipient_store else None,
            "notes": notes,
            "lines": [documents.audited_line(line) for line in lines],
        },
    )
    return issue
