import django_filters

from core.api.filters import StrictBooleanFilter, StrictFilterSet
from items.choices import AssetClass

from .choices import RelationshipKind
from .models import AcquisitionRecord, AssetEvent, AssetRelationship, ITAsset

class AssetFilter(StrictFilterSet):
    asset_class = django_filters.ChoiceFilter(
        field_name="item__asset_class", choices=AssetClass.choices
    )
    employee = django_filters.UUIDFilter(field_name="current_assignment__employee_id")
    department = django_filters.UUIDFilter(field_name="current_assignment__department_id")

    class Meta:
        model = ITAsset
        fields = [
            "region",
            "status",
            "item",
            "asset_class",
            "source",
            "location",
            "custody_warehouse",
            "employee",
            "department",
        ]

class AcquisitionFilter(StrictFilterSet):
    acquisition_date_from = django_filters.DateFilter(
        field_name="acquisition_date", lookup_expr="gte"
    )
    acquisition_date_to = django_filters.DateFilter(
        field_name="acquisition_date", lookup_expr="lte"
    )

    class Meta:
        model = AcquisitionRecord
        fields = ["region", "item", "acquisition_date_from", "acquisition_date_to"]

class RelationshipFilter(StrictFilterSet):
    kind = django_filters.ChoiceFilter(choices=RelationshipKind.choices)
    active = StrictBooleanFilter(method="filter_active")

    class Meta:
        model = AssetRelationship
        fields = ["kind", "active"]

    def filter_active(self, queryset, name, value):
        return queryset.filter(ended_at__isnull=value)

class EventFilter(StrictFilterSet):
    class Meta:
        model = AssetEvent
        fields = ["event_type"]
