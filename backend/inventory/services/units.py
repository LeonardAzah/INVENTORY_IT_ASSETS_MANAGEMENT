from core.exceptions import DomainError
from core.serials import normalize_serial

from ..choices import StockUnitStatus
from ..models import IN_STOCK_STATUSES, StockUnit, StockUnitMovement
from .documents import invalid

IN_STOCK = StockUnitStatus.IN_STOCK
UNAVAILABLE = StockUnitStatus.UNAVAILABLE
ISSUED = StockUnitStatus.ISSUED
WRITTEN_OFF = StockUnitStatus.WRITTEN_OFF

def tracks_units(item):
    """A serialized general item (`Item.tracks_units`)."""
    return item.tracks_units

def check_line(line, *, incoming):
    item, quantity = line["item"], abs(line["quantity"])
    wanted, other = ("serials", "unit_ids") if incoming else ("unit_ids", "serials")
    given = line.get(wanted) or []
    if not tracks_units(item):
        if given or line.get(other):
            raise invalid(
                "SERIALS_NOT_ALLOWED",
                f"Item {item.code} is not tracked by serial number.",
                item_id=str(item.pk),
            )
        return
    if line.get(other):
        raise invalid(
            "SERIALS_NOT_ALLOWED",
            f"Name the units of {item.code} by "
            + ("serial number." if incoming else "the units held (unit_ids)."),
            item_id=str(item.pk),
            field=other,
        )
    if not given:
        raise invalid(
            "SERIALS_REQUIRED",
            f"Item {item.code} is serialized: "
            + ("give the serial number of every unit." if incoming else "choose the units."),
            item_id=str(item.pk),
            field=wanted,
        )
    if quantity != len(given):
        raise invalid(
            "SERIAL_COUNT_MISMATCH",
            f"The quantity of {item.code} is {quantity.normalize():f}, but "
            f"{len(given)} unit(s) are named.",
            item_id=str(item.pk),
            quantity=str(quantity),
            count=len(given),
        )


# Stock coming in, by serial
def plan_incoming(item, serials, *, cross_item_reason="", may_take=None):
    normalized = [normalize_serial(serial) for serial in serials]
    if None in normalized:
        raise invalid("SERIALS_REQUIRED", "A serial number cannot be blank.", item_id=str(item.pk))
    repeated = sorted({value for value in normalized if normalized.count(value) > 1})
    if repeated:
        raise invalid(
            "SERIAL_REPEATED",
            "A serial number appears more than once: " + ", ".join(repeated) + ".",
            item_id=str(item.pk),
            serials=repeated,
        )
    known = {
        unit.serial_normalized: unit
        for unit in StockUnit.objects.select_for_update(of=("self",))
        .select_related("warehouse")
        .filter(item=item, serial_normalized__in=normalized)
        .order_by("pk")
    }
    in_stock = sorted(value for value, unit in known.items() if unit.status in IN_STOCK_STATUSES)
    if in_stock:
        raise DomainError(
            "DUPLICATE_SERIAL",
            f"Already in stock as {item.code}: " + ", ".join(in_stock) + ".",
            context={"item_id": str(item.pk), "serials": in_stock},
        )
    if may_take is not None:
        held = sorted(value for value, unit in known.items() if not may_take(unit))
        if held:
            raise DomainError(
                "UNIT_HELD_ELSEWHERE",
                "These units are issued to someone else: " + ", ".join(held) + ".",
                context={"item_id": str(item.pk), "serials": held},
            )
    new = [value for value in normalized if value not in known]
    elsewhere = (
        StockUnit.objects.filter(serial_normalized__in=new)
        .exclude(item=item)
        .select_related("item")
        .order_by("serial_normalized")
    )
    if new and not cross_item_reason.strip():
        clashes = list(elsewhere)
        if clashes:
            raise DomainError(
                "SERIAL_ON_OTHER_ITEM",
                "These serial numbers are already recorded under another item: "
                + ", ".join(f"{unit.serial_normalized} ({unit.item.code})" for unit in clashes)
                + ". Give a reason if they really are different units.",
                context={
                    "item_id": str(item.pk),
                    "serials": [unit.serial_normalized for unit in clashes],
                    "items": sorted({unit.item.code for unit in clashes}),
                },
            )
    return [
        (serial.strip(), value, known.get(value))
        for serial, value in zip(serials, normalized, strict=True)
    ]


def bring_in(plan, *, item, warehouse, to_status, ledger_entry, line_id, actor):
    units = []
    for serial, normalized, unit in plan:
        if unit is None:
            unit = StockUnit.objects.create(
                item=item,
                serial_number=serial,
                serial_normalized=normalized,
                status=to_status,
                warehouse=warehouse,
                created_by=actor,
            )
            from_status = None
        else:
            from_status = unit.status
            _place(unit, to_status, warehouse)
        _record(unit, from_status, to_status, ledger_entry, line_id)
        units.append(unit)
    return units

# Stock going out or changing state, by unit id
def lock(item, warehouse, unit_ids, *, statuses, error_code="UNIT_NOT_AVAILABLE", check=None):
    ids = [str(unit_id) for unit_id in unit_ids]
    repeated = sorted({unit_id for unit_id in ids if ids.count(unit_id) > 1})
    if repeated:
        raise invalid(
            "UNIT_REPEATED",
            "A unit appears more than once.",
            item_id=str(item.pk),
            unit_ids=repeated,
        )
    units = list(
        StockUnit.objects.select_for_update(of=("self",)).filter(pk__in=ids).order_by("pk")
    )
    found = {str(unit.pk): unit for unit in units}
    wrong = sorted(
        unit_id
        for unit_id in ids
        if (unit := found.get(unit_id)) is None
        or unit.item_id != item.pk
        or unit.warehouse_id != warehouse.pk
        or unit.status not in statuses
        or (check is not None and not check(unit))
    )
    if wrong:
        serials = [found[unit_id].serial_number for unit_id in wrong if unit_id in found]
        raise DomainError(
            error_code,
            f"Some of the units of {item.code} cannot be used here"
            + (": " + ", ".join(serials) if serials else "")
            + ". They may have moved since the list was loaded.",
            context={"item_id": str(item.pk), "unit_ids": wrong},
        )
    return [found[unit_id] for unit_id in ids]

def move(units, *, to_status, ledger_entry, line_id, issue_line=None, employee=None, store=None):
    """Changes the state of locked units, recording each change against `ledger_entry`."""
    for unit in units:
        from_status = unit.status
        _place(unit, to_status, unit.warehouse, issue_line, employee, store)
        _record(unit, from_status, to_status, ledger_entry, line_id)

def _place(unit, status, warehouse, issue_line=None, employee=None, store=None):
    unit.status = status
    unit.warehouse = warehouse
    issued = status == ISSUED
    unit.current_issue_line = issue_line if issued else None
    unit.issued_to_employee = employee if issued else None
    unit.issued_to_store = store if issued else None
    unit.save(
        update_fields=[
            "status",
            "warehouse",
            "current_issue_line",
            "issued_to_employee",
            "issued_to_store",
            "updated_at",
        ]
    )

def _record(unit, from_status, to_status, ledger_entry, line_id):
    StockUnitMovement.objects.create(
        unit=unit,
        ledger_entry=ledger_entry,
        line_id=line_id,
        from_status=from_status,
        to_status=to_status,
        occurred_at=ledger_entry.occurred_at,
    )

def serials_of(units):
    return [unit.serial_number for unit in units]
