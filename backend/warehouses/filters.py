from core.api.filters import StrictBooleanFilter, StrictFilterSet

from .models import Warehouse, WarehouseAssignment
from .selectors import with_store_keeper_flag

class WarehouseFilter(StrictFilterSet):
    has_store_keeper = StrictBooleanFilter(method="filter_has_store_keeper")

    class Meta:
        model = Warehouse
        fields = [
            "region",
            "office",
            "department",
            "type",
            "is_active",
            "is_regional_store",
            "has_store_keeper",
        ]

    def filter_has_store_keeper(self, queryset, name, value):
        return with_store_keeper_flag(queryset).filter(keeper_id__isnull=not value)

class AssignmentFilter(StrictFilterSet):
    active = StrictBooleanFilter(method="filter_active")

    class Meta:
        model = WarehouseAssignment
        fields = ["active"]

    def filter_active(self, queryset, name, value):
        return queryset.filter(ended_at__isnull=value)
