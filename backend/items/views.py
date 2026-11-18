from django.shortcuts import get_object_or_404

from core.api.views import GenericListCreateViewAPI, GenericRetrieveUpdateViewAPI

from . import filters, selectors, serializers
from .services import categories, items, specifications, units

class UnitListCreateView(GenericListCreateViewAPI):
    selector = selectors.units_for
    filterset_class = filters.UnitFilter
    search_fields = ("code", "name")
    ordering_fields = ("code",)
    ordering = ("code",)
    input_serializer_class = serializers.UnitCreateInput
    output_serializer_class = serializers.UnitOutput
    create_service = units.create_unit
    success_messages = {"POST": "Unit created successfully."}

class UnitDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.units_for
    input_serializer_class = serializers.UnitUpdateInput
    output_serializer_class = serializers.UnitOutput
    update_service = units.update_unit
    success_messages = {"PATCH": "Unit updated successfully."}

class CategoryListCreateView(GenericListCreateViewAPI):
    selector = selectors.categories_for
    filterset_class = filters.CategoryFilter
    search_fields = ("name",)
    ordering_fields = ("name",)
    ordering = ("name", "warehouse_type")
    input_serializer_class = serializers.CategoryCreateInput
    output_serializer_class = serializers.CategoryOutput
    create_service = categories.create_category
    success_messages = {"POST": "Category created successfully."}

class CategoryDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.categories_for
    input_serializer_class = serializers.CategoryUpdateInput
    output_serializer_class = serializers.CategoryOutput
    update_service = categories.update_category
    success_messages = {"PATCH": "Category updated successfully."}

class ItemListCreateView(GenericListCreateViewAPI):
    selector = selectors.items_for
    filterset_class = filters.ItemFilter
    search_fields = ("code", "name", "brand", "model")
    ordering_fields = ("code", "name")
    ordering = ("code",)
    input_serializer_class = serializers.ItemInput
    output_serializer_class = serializers.ItemOutput
    create_service = items.create_item
    success_messages = {"POST": "Item created successfully."}

class ItemDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.items_for
    input_serializer_class = serializers.ItemUpdateInput
    output_serializer_class = serializers.ItemOutput
    update_service = items.update_item
    success_messages = {"PATCH": "Item updated successfully."}

class SpecificationTemplateListCreateView(GenericListCreateViewAPI):
    selector = selectors.templates_for
    filterset_class = filters.SpecificationTemplateFilter
    search_fields = ("code", "name")
    ordering_fields = ("code", "name")
    ordering = ("code",)
    input_serializer_class = serializers.SpecificationTemplateCreateInput
    output_serializer_class = serializers.SpecificationTemplateOutput
    create_service = specifications.create_template
    success_messages = {"POST": "Specification template created successfully."}

class SpecificationTemplateDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.templates_for
    input_serializer_class = serializers.SpecificationTemplateUpdateInput
    output_serializer_class = serializers.SpecificationTemplateOutput
    update_service = specifications.update_template
    success_messages = {"PATCH": "Specification template updated successfully."}

class _TemplateScoped:
    def get_template(self):
        templates = selectors.templates_for(self.request.user)
        return get_object_or_404(templates, pk=self.kwargs["pk"])

class SpecificationFieldListCreateView(_TemplateScoped, GenericListCreateViewAPI):
    ordering_fields = ("sort_order", "key")
    ordering = ("sort_order", "key")
    input_serializer_class = serializers.SpecificationFieldCreateInput
    output_serializer_class = serializers.SpecificationFieldOutput
    create_service = specifications.create_field
    success_messages = {"POST": "Specification field created successfully."}

    def get_queryset(self):
        return selectors.fields_of(self.get_template())

    def get_service_kwargs(self):
        return {"template": self.get_template()}

class SpecificationFieldDetailView(_TemplateScoped, GenericRetrieveUpdateViewAPI):
    lookup_url_kwarg = "field_id"
    input_serializer_class = serializers.SpecificationFieldUpdateInput
    output_serializer_class = serializers.SpecificationFieldOutput
    update_service = specifications.update_field
    success_messages = {"PATCH": "Specification field updated successfully."}

    def get_queryset(self):
        return selectors.fields_of(self.get_template())
