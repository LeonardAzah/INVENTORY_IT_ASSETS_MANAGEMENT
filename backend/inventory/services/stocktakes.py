from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError
from core.quantities import ZERO, has_valid_precision
from core.serials import normalize_serial

from ..choices import AdjustmentKind, StockTakeStatus
from ..models import IN_STOCK_STATUSES, StockTake, StockTakeLine, StockTakeSerial, StockUnit
from . import adjustments, documents, ledger, units

def _locked_draft(stock_take):
    stock_take = (
        StockTake.objects.select_for_update(of=("self",))
        .select_related("warehouse")
        .get(pk=stock_take.pk)
    )
    if stock_take.status != StockTakeStatus.DRAFT:
        raise DomainError(
            "STOCK_TAKE_CLOSED", f"Stock-take {stock_take.reference} is {stock_take.status}."
        )
    return stock_take

@transaction.atomic
def start(actor, *, warehouse):
    """Opens a count. A warehouse has one open count at a time, and keeps operating
    while it is counted."""
    policy.require(actor, Code.INVENTORY_STOCK_TAKE, warehouse)
    documents.require_active_warehouse(warehouse)
    stock_take = StockTake.objects.create(
        reference=documents.new_reference("STK", warehouse), warehouse=warehouse, started_by=actor
    )
    audit.record(actor, "inventory.stock_take.started", stock_take)
    return stock_take

def _check_scan(item, warehouse, serials):
    """The scanned serials of a serialized item, checked: none blank or repeated, and none
    in stock in another warehouse (there are no transfers). Returns (serial, normalized,
    unit or None) for each, the unit being the item's unit with that serial, if any."""
    normalized = [normalize_serial(serial) for serial in serials]
    if None in normalized:
        raise documents.invalid(
            "SERIALS_REQUIRED", "A serial number cannot be blank.", item_id=str(item.pk)
        )
    repeated = sorted({value for value in normalized if normalized.count(value) > 1})
    if repeated:
        raise documents.invalid(
            "SERIAL_REPEATED",
            "A serial number appears more than once: " + ", ".join(repeated) + ".",
            item_id=str(item.pk),
            serials=repeated,
        )
    known = {
        unit.serial_normalized: unit
        for unit in StockUnit.objects.filter(
            item=item, serial_normalized__in=normalized
        ).select_related("warehouse")
    }
    elsewhere = sorted(
        f"{value} ({unit.warehouse.code})"
        for value, unit in known.items()
        if unit.status in IN_STOCK_STATUSES and unit.warehouse_id != warehouse.pk
    )
    if elsewhere:
        raise DomainError(
            "UNIT_IN_OTHER_WAREHOUSE",
            "These units are in stock in another warehouse: " + ", ".join(elsewhere) + ".",
            context={"item_id": str(item.pk), "serials": elsewhere},
        )
    return [
        (serial.strip(), value, known.get(value))
        for serial, value in zip(serials, normalized, strict=True)
    ]

def serial_outcome(line, warehouse): 
    scans = list(line.serials.select_related("unit"))
    scanned = {scan.serial_normalized for scan in scans}
    missing = list(
        StockUnit.objects.filter(
            item_id=line.item_id, warehouse=warehouse, status__in=IN_STOCK_STATUSES
        )
        .exclude(serial_normalized__in=scanned)
        .exclude(movements__occurred_at__gt=line.counted_at)
        .order_by("serial_normalized")
    )
    found = []
    for scan in scans:
        if scan.unit_status in IN_STOCK_STATUSES:
            continue  # it was on the shelf and in the records
        unit = StockUnit.objects.filter(
            item_id=line.item_id, serial_normalized=scan.serial_normalized
        ).first()
        if unit is not None and (
            unit.status in IN_STOCK_STATUSES
            or unit.movements.filter(occurred_at__gt=scan.scanned_at).exists()
        ):
            continue  # recorded since the scan
        found.append(scan)
    return missing, found

@transaction.atomic
def record_counts(actor, stock_take, *, lines):
    policy.require(actor, Code.INVENTORY_STOCK_TAKE, stock_take.warehouse)
    stock_take = _locked_draft(stock_take)
    warehouse = stock_take.warehouse
    scans = {}
    for line in lines:
        item = line["item"]
        documents.require_item_fits(item, warehouse, must_be_active=False)
        if units.tracks_units(item):
            if line.get("counted_quantity") is not None or line.get("serials") is None:
                raise documents.invalid(
                    "SERIALS_REQUIRED",
                    f"Item {item.code} is counted by scanning: give its serial numbers.",
                    item_id=str(item.pk),
                    field="serials",
                )
            scans[item.pk] = _check_scan(item, warehouse, line["serials"])
            line["counted_quantity"] = Decimal(len(line["serials"]))
            continue
        if line.get("serials") is not None:
            raise documents.invalid(
                "SERIALS_NOT_ALLOWED",
                f"Item {item.code} is not tracked by serial number.",
                item_id=str(item.pk),
            )
        counted = line.get("counted_quantity")
        if counted is None:
            raise documents.invalid(
                "INVALID_QUANTITY", f"Enter the count of {item.code}.", item_id=str(item.pk)
            )
        if counted < ZERO or not has_valid_precision(counted, item.unit.decimal_places):
            raise documents.invalid(
                "INVALID_QUANTITY",
                f"The count of {item.code} must be zero or more, in whole {item.unit.code} "
                f"or with at most {item.unit.decimal_places} decimal place(s).",
                item_id=str(item.pk),
            )
    balances = ledger.lock_balances(warehouse, [line["item"] for line in lines])
    now = timezone.now()
    for line in lines:
        saved, _ = StockTakeLine.objects.update_or_create(
            stock_take=stock_take,
            item=line["item"],
            defaults={
                "counted_quantity": line["counted_quantity"],
                "system_quantity_at_count": balances[line["item"].pk].quantity_on_hand,
                "counted_at": now,
            },
        )
        if line["item"].pk in scans:
            saved.serials.all().delete()
            StockTakeSerial.objects.bulk_create(
                [
                    StockTakeSerial(
                        line=saved,
                        serial_number=serial,
                        serial_normalized=normalized,
                        unit=unit,
                        unit_status=unit.status if unit else None,
                        scanned_at=now,
                    )
                    for serial, normalized, unit in scans[line["item"].pk]
                ]
            )
    return stock_take

@transaction.atomic
def complete(actor, stock_take, *, reasons=None):
    policy.require(actor, Code.INVENTORY_STOCK_TAKE, stock_take.warehouse)
    policy.require(actor, Code.INVENTORY_ADJUST, stock_take.warehouse)
    stock_take = _locked_draft(stock_take)
    warehouse = stock_take.warehouse
    reasons = {str(line_id): text for line_id, text in (reasons or {}).items()}

    lines = list(stock_take.lines.select_related("item__unit").order_by("item__code"))
    balances = ledger.lock_balances(warehouse, [line.item for line in lines])
    outcomes = {
        line.pk: serial_outcome(line, warehouse) for line in lines if units.tracks_units(line.item)
    }
    differing = [
        line for line in lines if (any(outcomes[line.pk]) if line.pk in outcomes else differs(line))
    ]
    missing = [str(line.pk) for line in differing if not reasons.get(str(line.pk), "").strip()]
    if missing:
        raise DomainError(
            "REASON_REQUIRED",
            "Give a reason for every line whose count differs from the system quantity.",
            context={"line_ids": missing},
            status_code=400,
        )

    made = 0
    for line in differing:
        reason = reasons[str(line.pk)]
        if line.pk in outcomes:
            made += _settle_units(actor, balances[line.item_id], line, *outcomes[line.pk], reason)
            continue
        made += 1
        adjustments.post(
            actor,
            balances[line.item_id],
            AdjustmentKind.QUANTITY,
            line.counted_quantity - line.system_quantity_at_count,
            ZERO,
            reasons[str(line.pk)],
            stock_take_line=line,
        )
    stock_take.status = StockTakeStatus.COMPLETED
    stock_take.completed_by = actor
    stock_take.completed_at = timezone.now()
    stock_take.save(update_fields=["status", "completed_by", "completed_at"])
    audit.record(
        actor,
        "inventory.stock_take.completed",
        stock_take,
        after={"lines": len(lines), "adjustments": made},
    )
    return stock_take

def differs(line):
    """A quantity line whose count differs from what the system held when counted."""
    return line.counted_quantity != line.system_quantity_at_count

def _settle_units(actor, balance, line, missing, found, reason):
    """Writes off the missing units and brings in the found ones of a serialized line.
    Returns the number of adjustments made (0 to 2)."""
    made = 0
    item, warehouse = line.item, line.stock_take.warehouse
    if missing:
        locked = units.lock(
            item, warehouse, [unit.pk for unit in missing], statuses=IN_STOCK_STATUSES
        )
        gone = len(locked)
        damaged = sum(1 for unit in locked if unit.status == units.UNAVAILABLE)
        adjustment = adjustments.post(
            actor,
            balance,
            AdjustmentKind.QUANTITY,
            Decimal(-gone),
            Decimal(-damaged),
            reason,
            stock_take_line=line,
        )
        units.move(
            locked,
            to_status=units.WRITTEN_OFF,
            ledger_entry=adjustment.ledger_entry,
            line_id=adjustment.pk,
        )
        made += 1
    if found:
        plan = units.plan_incoming(
            item, [scan.serial_number for scan in found], cross_item_reason=reason
        )
        adjustment = adjustments.post(
            actor,
            balance,
            AdjustmentKind.QUANTITY,
            Decimal(len(plan)),
            ZERO,
            reason,
            stock_take_line=line,
        )
        units.bring_in(
            plan,
            item=item,
            warehouse=warehouse,
            to_status=units.IN_STOCK,
            ledger_entry=adjustment.ledger_entry,
            line_id=adjustment.pk,
            actor=actor,
        )
        made += 1
    return made

@transaction.atomic
def cancel(actor, stock_take):
    """Abandons a count. Nothing is adjusted."""
    policy.require(actor, Code.INVENTORY_STOCK_TAKE, stock_take.warehouse)
    stock_take = _locked_draft(stock_take)
    stock_take.status = StockTakeStatus.CANCELLED
    stock_take.completed_by = actor
    stock_take.completed_at = timezone.now()
    stock_take.save(update_fields=["status", "completed_by", "completed_at"])
    audit.record(actor, "inventory.stock_take.cancelled", stock_take)
    return stock_take