from django.db import transaction

from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError
from warehouses.choices import WarehouseType

from ..choices import Tracking
from ..models import Item
from . import access
from . import specifications as specs

AUDITED = (
    "code",
    "name",
    "description",
    "category",
    "unit",
    "warehouse_type",
    "tracking",
    "asset_class",
    "brand",
    "model",
    "specifications",
    "is_active",
)

LOCKED_WHEN_USED = ("code", "unit", "tracking", "warehouse_type", "asset_class")

usage_checks = []

def is_in_use(item):
    return any(check(item) for check in usage_checks)

def _invalid(error_code, message):
    return DomainError(error_code, message, status_code=400)

def _check_consistency(item):
    """Rules that tie an item's type, tracking, class, unit and category together. IT
    items are serialized and have an asset class; a general item is tracked by quantity
    or serialized, and never has an asset class."""
    serialized = item.tracking == Tracking.SERIALIZED
    is_it = item.warehouse_type == WarehouseType.IT
    if is_it and not serialized:
        raise _invalid("TRACKING_MISMATCH", "IT items are serialized.")
    if is_it and not item.asset_class:
        raise _invalid("ASSET_CLASS_REQUIRED", "An IT item needs an asset class.")
    if not is_it and item.asset_class:
        raise _invalid(
            "ASSET_CLASS_NOT_ALLOWED",
            "Only IT items have an asset class: a general item never becomes an asset.",
        )
    if item.category.warehouse_type != item.warehouse_type:
        raise _invalid(
            "CATEGORY_TYPE_MISMATCH", "The category belongs to the other warehouse type."
        )
    if serialized and item.unit.decimal_places != 0:
        raise _invalid(
            "SERIALIZED_NEEDS_WHOLE_UNIT",
            "A serialized item must use a unit that counts whole units.",
        )

def _warnings(item):
    """Soft duplicate check: the catalogue is shared, so a similar name deserves a look
    before a second entry for the same thing is created."""
    twins = (
        Item.objects.filter(name__iexact=item.name, warehouse_type=item.warehouse_type)
        .exclude(pk=item.pk)
        .values_list("code", flat=True)
    )
    return [f"An item with the same name already exists: {code}." for code in twins]

@transaction.atomic
def create_item(
    actor,
    *,
    code,
    name,
    category,
    unit,
    warehouse_type,
    tracking,
    asset_class=None,
    description="",
    brand="",
    model="",
    specifications=None,
):
    item = Item(
        code=code.upper(),
        name=name,
        description=description,
        category=category,
        unit=unit,
        warehouse_type=warehouse_type,
        tracking=tracking,
        asset_class=asset_class or None,
        brand=brand,
        model=model,
        created_by=actor,
    )
    access.require(actor, Code.ITEM_MANAGE, item)
    _check_consistency(item)
    for related, what in ((category, "category"), (unit, "unit")):
        if not related.is_active:
            raise _invalid("INACTIVE_REFERENCE", f"The {what} is inactive.")
    item.specifications = specs.clean(category, specifications or {})
    item.save()
    audit.record(actor, "items.item.created", item, after=audit.snapshot(item, AUDITED))
    item.warnings = _warnings(item)
    return item

@transaction.atomic
def update_item(actor, item, **changes):
    """Any field may change until the item is used; after that, the fields that give
    recorded stock its meaning are locked."""
    access.require(actor, Code.ITEM_MANAGE, item)
    item = (
        Item.objects.select_for_update(of=("self",))
        .select_related("category", "unit")
        .get(pk=item.pk)
    )
    before = audit.snapshot(item, AUDITED)
    old_template_id = item.category.specification_template_id
    if "code" in changes:
        changes["code"] = changes["code"].upper()
    if "asset_class" in changes:
        changes["asset_class"] = changes["asset_class"] or None
    for name, value in changes.items():
        setattr(item, name, value)
    after = audit.snapshot(item, AUDITED)
    if after == before:
        item.warnings = []
        return item
    access.require(actor, Code.ITEM_MANAGE, item)
    locked = [name for name in LOCKED_WHEN_USED if after[name] != before[name]]
    if locked and is_in_use(item):
        raise DomainError(
            "ITEM_IN_USE",
            "This item is already used in stock or assets; these fields can no longer change.",
            context={"fields": locked},
        )
    _check_consistency(item)
    if "specifications" in changes or after["category"] != before["category"]:
        item.specifications = specs.clean(
            item.category,
            changes.get("specifications", before["specifications"]),
            previous=before["specifications"],
            same_template=item.category.specification_template_id == old_template_id,
        )
        after = audit.snapshot(item, AUDITED)
        if after == before:
            item.warnings = []
            return item
    item.save()
    audit.record(actor, "items.item.updated", item, before=before, after=after)
    item.warnings = _warnings(item) if after["name"] != before["name"] else []
    return item
