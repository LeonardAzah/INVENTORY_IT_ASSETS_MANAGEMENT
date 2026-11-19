from core.exceptions import DomainError

from ..models import InventoryBalance, InventoryTransaction, ReceiptLine, StockUnit

def warehouse_has_no_stock(warehouse):
    count = InventoryBalance.objects.filter(warehouse=warehouse, quantity_on_hand__gt=0).count()
    if count:
        raise DomainError(
            "WAREHOUSE_HAS_STOCK",
            f"Warehouse {warehouse.code} still holds stock of {count} item(s).",
            context={"items_in_stock": count},
        )

def item_is_used(item):
    return (
        InventoryTransaction.objects.filter(item=item).exists()
        or InventoryBalance.objects.filter(item=item).exists()
        or ReceiptLine.objects.filter(item=item).exists()
        or StockUnit.objects.filter(item=item).exists()
    )
