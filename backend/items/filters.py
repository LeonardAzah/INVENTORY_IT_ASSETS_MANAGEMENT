from core.api.filters import StrictFilterSet

from .models import Category, Item, SpecificationTemplate, UnitOfMeasure

class UnitFilter(StrictFilterSet):
    class Meta:
        model = UnitOfMeasure
        fields = ["is_active"]

class CategoryFilter(StrictFilterSet):
    class Meta:
        model = Category
        fields = ["warehouse_type", "is_predefined", "is_active", "specification_template"]

class ItemFilter(StrictFilterSet):
    class Meta:
        model = Item
        fields = ["category", "warehouse_type", "tracking", "asset_class", "is_active"]

class SpecificationTemplateFilter(StrictFilterSet):
    class Meta:
        model = SpecificationTemplate
        fields = ["is_active"]
