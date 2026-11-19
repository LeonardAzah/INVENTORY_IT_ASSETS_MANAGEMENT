from django.db.models import Q

from accounts import policy
from accounts.policy import Code

from .models import (
    InventoryBalance,
    InventoryTransaction,
    StockAdjustment,
    StockIssue,
    StockReceipt,
    StockReturn,
    StockTake,
    StockUnit,
)

def visible_warehouses_q(context, prefix="warehouse__"):
    return (
        Q(**{f"{prefix}pk__in": context.warehouse_ids})
        | policy.jurisdiction_q(context, prefix)
        | Q(**{f"{prefix}type": "IT", f"{prefix}region_id__in": context.it_regions})
    )

def scoped(queryset, user, code=Code.INVENTORY_VIEW, prefix="warehouse__"):
    context = policy.context_for(user)
    if code not in context.codes:
        return queryset.none()
    if context.sees_organization:
        return queryset
    return queryset.filter(visible_warehouses_q(context, prefix))

def balances_for(user):
    return scoped(
        InventoryBalance.objects.select_related("warehouse", "item__unit", "item__category"), user
    )

def transactions_for(user):
    return scoped(
        InventoryTransaction.objects.select_related("warehouse", "item__unit", "actor"), user
    )

def receipts_for(user):
    return scoped(
        StockReceipt.objects.select_related("warehouse", "created_by").prefetch_related(
            "lines__item__unit"
        ),
        user,
    )

def issues_for(user):
    return scoped(
        StockIssue.objects.select_related(
            "warehouse", "employee", "recipient_store", "created_by"
        ).prefetch_related("lines__item__unit"),
        user,
    )

def returns_for(user):
    return scoped(
        StockReturn.objects.select_related(
            "warehouse", "employee", "issue", "created_by"
        ).prefetch_related("lines__item__unit"),
        user,
    )

def stock_takes_for(user):
    return scoped(
        StockTake.objects.select_related(
            "warehouse", "started_by", "completed_by"
        ).prefetch_related("lines__item__unit", "lines__adjustments", "lines__serials"),
        user,
    )

def adjustments_for(user):
    return scoped(
        StockAdjustment.objects.select_related("warehouse", "item__unit", "created_by"), user
    )

def units_for(user):
    """Units of serialized general items, seen with the stock of the warehouse that holds
    them, or that issued them."""
    return scoped(
        StockUnit.objects.select_related(
            "item__unit",
            "warehouse",
            "issued_to_employee",
            "issued_to_store",
            "current_issue_line__issue",
        ),
        user,
    )
