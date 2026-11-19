from django.utils import timezone

from core import quantities
from core.exceptions import DomainError
from core.references import document_reference


def invalid(error_code, message, **context):
    return DomainError(error_code, message, context=context, status_code=400)


def find_replay(model, actor, client_request_id):
    """The document this author already created with this `client_request_id`, marked
    `replayed`, or None. A double-click on Submit must not create two documents"""
    if client_request_id is None:
        return None
    document = model.objects.filter(created_by=actor, client_request_id=client_request_id).first()
    if document is not None:
        document.replayed = True
    return document

def new_reference(doc_type, warehouse):
    """Numbered per warehouse and per calendar year, in local time."""
    return document_reference(doc_type, warehouse.code, timezone.localdate().year)

def require_active_warehouse(warehouse):
    if not warehouse.is_active:
        raise DomainError("WAREHOUSE_INACTIVE", f"Warehouse {warehouse.code} is inactive.")

def require_not_future(date, what):
    """Paper documents may be entered late, never early."""
    if date > timezone.localdate():
        raise invalid("FUTURE_DATE", f"The {what} cannot be in the future.")

def require_item_fits(item, warehouse, *, must_be_active=True):
    if item.warehouse_type != warehouse.type:
        raise invalid(
            "ITEM_TYPE_MISMATCH",
            f"Item {item.code} does not belong in a {warehouse.type} warehouse.",
            item_id=str(item.pk),
        )
    if must_be_active and not item.is_active:
        raise invalid("ITEM_INACTIVE", f"Item {item.code} is inactive.", item_id=str(item.pk))

def audited_line(line, **extra):
    """A document line as the audit log records it, with its serials or units if any."""
    entry = {"item": line["item"].pk, "quantity": line["quantity"], **extra}
    for key in ("serials", "unit_ids", "cross_item_serial_reason"):
        if line.get(key):
            entry[key] = [str(value) for value in line[key]] if key == "unit_ids" else line[key]
    return entry

def check_lines(lines, warehouse, *, must_be_active=True):
    """Every line's item belongs in this warehouse and its quantity suits the unit."""
    for line in lines:
        require_item_fits(line["item"], warehouse, must_be_active=must_be_active)
        quantities.validate(line["quantity"], line["item"].unit)
