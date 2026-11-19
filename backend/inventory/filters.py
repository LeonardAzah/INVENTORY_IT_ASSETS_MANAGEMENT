import django_filters

from core.api.filters import StrictBooleanFilter, StrictFilterSet

from .choices import ReturnCondition, StockUnitStatus
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

def date_range(field):
    """`<field>_from` and `<field>_to`, both inclusive."""
    return (
        django_filters.DateFilter(field_name=field, lookup_expr="gte"),
        django_filters.DateFilter(field_name=field, lookup_expr="lte"),
    )

def datetime_range(field):
    """`<field>_from` and `<field>_to` as dates, both inclusive, on a timestamp."""
    return (
        django_filters.DateFilter(field_name=field, lookup_expr="date__gte"),
        django_filters.DateFilter(field_name=field, lookup_expr="date__lte"),
    )

class BalanceFilter(StrictFilterSet):
    category = django_filters.UUIDFilter(field_name="item__category_id")
    below_threshold = StrictBooleanFilter(field_name="low_stock_alerted")
    has_unavailable = StrictBooleanFilter(method="filter_has_unavailable")

    class Meta:
        model = InventoryBalance
        fields = ["warehouse", "item", "category", "below_threshold", "has_unavailable"]

    def filter_has_unavailable(self, queryset, name, value):
        if value:
            return queryset.filter(quantity_unavailable__gt=0)
        return queryset.filter(quantity_unavailable=0)

class TransactionFilter(StrictFilterSet):
    occurred_at_from, occurred_at_to = datetime_range("occurred_at")

    class Meta:
        model = InventoryTransaction
        fields = ["warehouse", "item", "type", "occurred_at_from", "occurred_at_to"]

class ReceiptFilter(StrictFilterSet):
    item = django_filters.UUIDFilter(field_name="lines__item_id", distinct=True)
    receipt_date_from, receipt_date_to = date_range("receipt_date")

    class Meta:
        model = StockReceipt
        fields = ["warehouse", "item", "receipt_date_from", "receipt_date_to", "created_by"]

class IssueFilter(StrictFilterSet):
    item = django_filters.UUIDFilter(field_name="lines__item_id", distinct=True)
    issue_date_from, issue_date_to = date_range("issue_date")

    class Meta:
        model = StockIssue
        fields = [
            "warehouse",
            "employee",
            "recipient_store",
            "item",
            "issue_date_from",
            "issue_date_to",
        ]

class ReturnFilter(StrictFilterSet):
    condition = django_filters.ChoiceFilter(
        field_name="lines__condition", choices=ReturnCondition.choices, distinct=True
    )
    linked = StrictBooleanFilter(method="filter_linked")
    return_date_from, return_date_to = date_range("return_date")

    class Meta:
        model = StockReturn
        fields = [
            "warehouse",
            "employee",
            "condition",
            "linked",
            "return_date_from",
            "return_date_to",
        ]

    def filter_linked(self, queryset, name, value):
        return queryset.filter(issue__isnull=not value)

class StockTakeFilter(StrictFilterSet):
    class Meta:
        model = StockTake
        fields = ["warehouse", "status"]

class AdjustmentFilter(StrictFilterSet):
    created_at_from, created_at_to = datetime_range("created_at")

    class Meta:
        model = StockAdjustment
        fields = ["warehouse", "item", "kind", "created_at_from", "created_at_to"]

class UnitFilter(StrictFilterSet):
    status = django_filters.ChoiceFilter(choices=StockUnitStatus.choices)
    employee = django_filters.UUIDFilter(field_name="issued_to_employee_id")
    issue = django_filters.UUIDFilter(field_name="current_issue_line__issue_id")

    class Meta:
        model = StockUnit
        fields = ["warehouse", "item", "status", "employee", "issue"]