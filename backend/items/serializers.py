from rest_framework import serializers

from core.api.serializers import StrictSerializer, id_field
from warehouses.choices import WarehouseType

from .choices import AssetClass, SpecDataType, Tracking
from .models import (
    SPEC_KEY,
    Category,
    Item,
    SpecificationField,
    SpecificationTemplate,
    UnitOfMeasure,
)

CODE = r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$"
CODE_ERROR = {"invalid": "Use up to 32 letters, digits, '-', '_' or '.'."}
UNIT_CODE = r"^[A-Za-z0-9]{1,16}$"
UNIT_CODE_ERROR = {"invalid": "Use 1 to 16 letters or digits."}
SPEC_KEY_ERROR = {
    "invalid": "Use up to 50 lower-case letters, digits or '_', starting with a letter."
}

# Units
class UnitOutput(serializers.ModelSerializer):
    class Meta:
        model = UnitOfMeasure
        fields = ["id", "code", "name", "decimal_places", "is_active"]

class UnitCreateInput(StrictSerializer):
    code = serializers.RegexField(UNIT_CODE, error_messages=UNIT_CODE_ERROR)
    name = serializers.CharField(max_length=100)
    decimal_places = serializers.IntegerField(min_value=0, max_value=3, required=False)

class UnitUpdateInput(StrictSerializer):
    name = serializers.CharField(max_length=100)
    decimal_places = serializers.IntegerField(min_value=0, max_value=3)
    is_active = serializers.BooleanField()


# Specification templates
class SpecificationFieldOutput(serializers.ModelSerializer):
    # Decimal strings, like quantities.
    min_value = serializers.DecimalField(max_digits=20, decimal_places=6, allow_null=True)
    max_value = serializers.DecimalField(max_digits=20, decimal_places=6, allow_null=True)

    class Meta:
        model = SpecificationField
        fields = [
            "id",
            "key",
            "label",
            "data_type",
            "required",
            "choices",
            "min_value",
            "max_value",
            "decimal_places",
            "unit_label",
            "help_text",
            "sort_order",
            "is_active",
        ]

class SpecificationTemplateOutput(serializers.ModelSerializer):
    """A template with all its fields, inactive ones included, in display order."""

    fields = serializers.SerializerMethodField(method_name="fields_in_order")

    class Meta:
        model = SpecificationTemplate
        fields = ["id", "code", "name", "description", "is_active", "fields"]

    def fields_in_order(self, template):
        ordered = sorted(template.fields.all(), key=lambda field: (field.sort_order, field.key))
        return SpecificationFieldOutput(ordered, many=True).data

class SpecificationTemplateCreateInput(StrictSerializer):
    code = serializers.RegexField(CODE, error_messages=CODE_ERROR)
    name = serializers.CharField(max_length=100)
    description = serializers.CharField(required=False, allow_blank=True)

class SpecificationTemplateUpdateInput(StrictSerializer):
    name = serializers.CharField(max_length=100)
    description = serializers.CharField(allow_blank=True)
    is_active = serializers.BooleanField()

def _limit_field():
    return serializers.DecimalField(
        max_digits=20, decimal_places=6, required=False, allow_null=True
    )

class SpecificationFieldUpdateInput(StrictSerializer):
    """The key and the kind of value are fixed once the field exists."""

    label = serializers.CharField(max_length=100)
    required = serializers.BooleanField()
    choices = serializers.ListField(child=serializers.CharField(max_length=100), max_length=200)
    min_value = _limit_field()
    max_value = _limit_field()
    decimal_places = serializers.IntegerField(min_value=0, max_value=6)
    unit_label = serializers.CharField(max_length=20, allow_blank=True)
    help_text = serializers.CharField(max_length=255, allow_blank=True)
    sort_order = serializers.IntegerField(min_value=0, max_value=32767)
    is_active = serializers.BooleanField()

class SpecificationFieldCreateInput(StrictSerializer):
    key = serializers.RegexField(SPEC_KEY, error_messages=SPEC_KEY_ERROR)
    label = serializers.CharField(max_length=100)
    data_type = serializers.ChoiceField(choices=SpecDataType.choices)
    required = serializers.BooleanField(required=False)
    choices = serializers.ListField(
        child=serializers.CharField(max_length=100), max_length=200, required=False
    )
    min_value = _limit_field()
    max_value = _limit_field()
    decimal_places = serializers.IntegerField(min_value=0, max_value=6, required=False)
    unit_label = serializers.CharField(max_length=20, required=False, allow_blank=True)
    help_text = serializers.CharField(max_length=255, required=False, allow_blank=True)
    sort_order = serializers.IntegerField(min_value=0, max_value=32767, required=False)


# Categories
class TemplateRef(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    name = serializers.CharField()

class CategoryOutput(serializers.ModelSerializer):
    specification_template = TemplateRef(allow_null=True)

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "warehouse_type",
            "is_predefined",
            "is_active",
            "specification_template",
        ]

class CategoryCreateInput(StrictSerializer):
    name = serializers.CharField(max_length=100)
    warehouse_type = serializers.ChoiceField(choices=WarehouseType.choices)
    is_predefined = serializers.BooleanField(required=False)
    specification_template_id = id_field(
        SpecificationTemplate, "specification_template", required=False, allow_null=True
    )

class CategoryUpdateInput(StrictSerializer):
    name = serializers.CharField(max_length=100)
    is_predefined = serializers.BooleanField()
    is_active = serializers.BooleanField()
    specification_template_id = id_field(
        SpecificationTemplate, "specification_template", allow_null=True
    )


# Items
class CategoryRef(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    specification_template_id = serializers.UUIDField(allow_null=True)

class UnitRef(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    name = serializers.CharField()
    decimal_places = serializers.IntegerField()

class ItemRef(serializers.Serializer):
    """An item as shown inside a stock document or an asset."""

    id = serializers.UUIDField()
    code = serializers.CharField()
    name = serializers.CharField()
    unit = serializers.CharField(source="unit.code")
    decimal_places = serializers.IntegerField(source="unit.decimal_places")
    tracks_units = serializers.BooleanField()

class ItemOutput(serializers.ModelSerializer):
    category = CategoryRef()
    unit = UnitRef()
    warnings = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            "id",
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
            "created_at",
            "updated_at",
            "warnings",
        ]

    def get_warnings(self, item):
        return getattr(item, "warnings", [])

class ItemInput(StrictSerializer):
    """Create input. For PATCH the base view passes `partial=True`."""

    code = serializers.RegexField(CODE, error_messages=CODE_ERROR)
    name = serializers.CharField(max_length=150)
    description = serializers.CharField(required=False, allow_blank=True)
    category_id = id_field(Category, "category")
    unit_id = id_field(UnitOfMeasure, "unit")
    warehouse_type = serializers.ChoiceField(choices=WarehouseType.choices)
    tracking = serializers.ChoiceField(choices=Tracking.choices)
    asset_class = serializers.ChoiceField(
        choices=AssetClass.choices, required=False, allow_null=True
    )
    brand = serializers.CharField(max_length=100, required=False, allow_blank=True)
    model = serializers.CharField(max_length=100, required=False, allow_blank=True)
    specifications = serializers.DictField(required=False)

class ItemUpdateInput(ItemInput):
    is_active = serializers.BooleanField()
