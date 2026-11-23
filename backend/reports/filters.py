import django_filters

from assets.choices import AssetStatus, EventType
from assets.models import AssetAssignment, AssetEvent, ITAsset
from audit.models import AuditLog
from core.api.filters import StrictBooleanFilter, StrictFilterSet
from inventory.choices import AdjustmentKind, TransactionType
from inventory.models import InventoryBalance, InventoryTransaction, StockAdjustment
from items.choices import AssetClass
from notifications.models import Notification

def uuid_filter(field):
    return django_filters.UUIDFilter(field_name=field)

def date_from(field):
    return django_filters.DateFilter(field_name=field, lookup_expr="date__gte")

def date_to(field):
    return django_filters.DateFilter(field_name=field, lookup_expr="date__lte")

class StockReportFilter(StrictFilterSet):
    region = uuid_filter("warehouse__region_id")
    category = uuid_filter("item__category_id")
    below_threshold = StrictBooleanFilter(field_name="low_stock_alerted")

    class Meta:
        model = InventoryBalance
        fields = ["warehouse", "region", "item", "category", "below_threshold"]

class MovementReportFilter(StrictFilterSet):
    region = uuid_filter("warehouse__region_id")
    category = uuid_filter("item__category_id")
    type = django_filters.ChoiceFilter(choices=TransactionType.choices)
    date_from = date_from("occurred_at")
    date_to = date_to("occurred_at")

    class Meta:
        model = InventoryTransaction
        fields = ["warehouse", "region", "item", "category", "type", "date_from", "date_to"]

class AdjustmentReportFilter(StrictFilterSet):
    region = uuid_filter("warehouse__region_id")
    kind = django_filters.ChoiceFilter(choices=AdjustmentKind.choices)
    from_stock_take = StrictBooleanFilter(method="filter_from_stock_take")
    date_from = date_from("created_at")
    date_to = date_to("created_at")

    class Meta:
        model = StockAdjustment
        fields = [
            "warehouse",
            "region",
            "item",
            "kind",
            "from_stock_take",
            "date_from",
            "date_to",
        ]

    def filter_from_stock_take(self, queryset, name, value):
        return queryset.filter(stock_take_line__isnull=not value)

class AssetRegisterFilter(StrictFilterSet):
    asset_class = django_filters.ChoiceFilter(
        field_name="item__asset_class", choices=AssetClass.choices
    )

    class Meta:
        model = ITAsset
        fields = ["region", "status", "item", "asset_class", "source"]

class AssetLocationFilter(StrictFilterSet):
    office = uuid_filter("location__office_id")
    status = django_filters.ChoiceFilter(choices=AssetStatus.choices)

    class Meta:
        model = ITAsset
        fields = ["region", "office", "location", "status"]

class AssignmentReportFilter(StrictFilterSet):
    region = uuid_filter("asset__region_id")
    active = StrictBooleanFilter(method="filter_active")
    date_from = date_from("assigned_at")
    date_to = date_to("assigned_at")

    class Meta:
        model = AssetAssignment
        fields = [
            "region",
            "employee",
            "department",
            "location",
            "active",
            "date_from",
            "date_to",
        ]

    def filter_active(self, queryset, name, value):
        return queryset.filter(returned_at__isnull=value)

class LifecycleReportFilter(StrictFilterSet):
    region = uuid_filter("asset__region_id")
    event_type = django_filters.ChoiceFilter(choices=EventType.choices)
    date_from = date_from("occurred_at")
    date_to = date_to("occurred_at")

    class Meta:
        model = AssetEvent
        fields = ["region", "asset", "event_type", "date_from", "date_to"]

class AuditFilter(StrictFilterSet):
    occurred_at_from = date_from("occurred_at")
    occurred_at_to = date_to("occurred_at")

    class Meta:
        model = AuditLog
        fields = [
            "actor",
            "action",
            "object_type",
            "object_id",
            "occurred_at_from",
            "occurred_at_to",
        ]

class AuditReportFilter(StrictFilterSet):
    date_from = date_from("occurred_at")
    date_to = date_to("occurred_at")

    class Meta:
        model = AuditLog
        fields = ["actor", "action", "object_type", "date_from", "date_to"]

class NotificationFilter(StrictFilterSet):
    created_at_from = date_from("created_at")
    created_at_to = date_to("created_at")

    class Meta:
        model = Notification
        fields = ["kind", "status", "created_at_from", "created_at_to"]