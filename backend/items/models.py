from django.conf import settings
from django.db import models
from django.db.models import F, Func, Q, Value
from django.db.models.functions import Lower
from django.db.models.lookups import Exact
from django.utils import timezone

from core.models import UUIDModel
from warehouses.choices import WarehouseType

from .choices import AssetClass, SpecDataType, Tracking

UNIT_CODE_UNIQUE = "items_unitofmeasure_code_unique"
CATEGORY_NAME_UNIQUE = "items_category_name_type_ci_unique"
ITEM_CODE_UNIQUE = "items_item_code_unique"
TEMPLATE_CODE_UNIQUE = "items_specificationtemplate_code_unique"
FIELD_KEY_UNIQUE = "items_specificationfield_template_key_unique"

SPEC_KEY = r"^[a-z][a-z0-9_]{0,49}$"

class UnitOfMeasure(UUIDModel):
    code = models.CharField(max_length=16)
    name = models.CharField(max_length=100)
    decimal_places = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        default_permissions = ()
        permissions = [("uom_manage", "Manage units of measure")]
        constraints = [
            models.UniqueConstraint(fields=["code"], name=UNIT_CODE_UNIQUE),
            models.CheckConstraint(
                condition=Q(decimal_places__gte=0, decimal_places__lte=3),
                name="items_unitofmeasure_decimal_places_range",
            ),
        ]

    def __str__(self):
        return self.code

class SpecificationTemplate(UUIDModel):
    """The technical specifications an item of a category describes, e.g. "Network
    device" or "Fiber jumper"."""
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        permissions = [("spec_template_manage", "Manage specification templates")]
        constraints = [models.UniqueConstraint(fields=["code"], name=TEMPLATE_CODE_UNIQUE)]

    def __str__(self):
        return self.code

class SpecificationField(UUIDModel):
    template = models.ForeignKey(
        SpecificationTemplate, on_delete=models.PROTECT, related_name="fields"
    )
    key = models.CharField(max_length=50)
    label = models.CharField(max_length=100)
    data_type = models.CharField(max_length=12, choices=SpecDataType.choices)
    required = models.BooleanField(default=False)
    choices = models.JSONField(default=list, blank=True)
    min_value = models.DecimalField(max_digits=20, decimal_places=6, null=True, blank=True)
    max_value = models.DecimalField(max_digits=20, decimal_places=6, null=True, blank=True)
    decimal_places = models.PositiveSmallIntegerField(default=0)
    unit_label = models.CharField(max_length=20, blank=True)
    help_text = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(fields=["template", "key"], name=FIELD_KEY_UNIQUE),
            models.CheckConstraint(
                condition=Q(key__regex=SPEC_KEY), name="items_specificationfield_key_slug"
            ),
            models.CheckConstraint(
                condition=Q(data_type__in=SpecDataType.values),
                name="items_specificationfield_data_type_valid",
            ),
            models.CheckConstraint(
                condition=Q(min_value__isnull=True)
                | Q(max_value__isnull=True)
                | Q(min_value__lte=F("max_value")),
                name="items_specificationfield_min_not_above_max",
            ),
            models.CheckConstraint(
                condition=Q(decimal_places__lte=6),
                name="items_specificationfield_decimal_places_range",
            ),
        ]
        indexes = [
            models.Index(fields=["template", "sort_order"], name="items_specfield_order"),
        ]

    def __str__(self):
        return f"{self.template_id}.{self.key}"

class Category(UUIDModel):
    name = models.CharField(max_length=100)
    warehouse_type = models.CharField(max_length=8, choices=WarehouseType.choices)
    is_predefined = models.BooleanField(default=False)
    specification_template = models.ForeignKey(
        SpecificationTemplate,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="categories",
    )
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        default_permissions = ()
        permissions = [("category_manage", "Manage item categories")]
        verbose_name_plural = "categories"
        constraints = [
            models.UniqueConstraint(Lower("name"), "warehouse_type", name=CATEGORY_NAME_UNIQUE),
            models.CheckConstraint(
                condition=Q(warehouse_type__in=WarehouseType.values),
                name="items_category_warehouse_type_valid",
            ),
        ]

    def __str__(self):
        return self.name

class Item(UUIDModel):
    """One entry of the organization-wide catalogue. A serialized item is a specific make
    and model: brand and model live here, not on each asset or unit.

    An IT item is serialized and its units become assets. A general item is tracked by
    quantity, or serialized
    """
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="items")
    unit = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="items")
    warehouse_type = models.CharField(max_length=8, choices=WarehouseType.choices)
    tracking = models.CharField(max_length=10, choices=Tracking.choices)
    asset_class = models.CharField(
        max_length=10, choices=AssetClass.choices, null=True, blank=True
    )
    brand = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    specifications = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        default_permissions = ()
        permissions = [("item_manage", "Manage catalogue items")]
        constraints = [
            models.UniqueConstraint(fields=["code"], name=ITEM_CODE_UNIQUE),
            models.CheckConstraint(
                condition=(
                    Q(warehouse_type=WarehouseType.IT, tracking=Tracking.SERIALIZED)
                    | Q(warehouse_type=WarehouseType.GENERAL, tracking__in=Tracking.values)
                ),
                name="items_item_it_is_serialized",
            ),
            models.CheckConstraint(
                condition=(
                    Q(
                        warehouse_type=WarehouseType.IT,
                        asset_class__isnull=False,
                        asset_class__in=AssetClass.values,
                    )
                    | Q(warehouse_type=WarehouseType.GENERAL, asset_class__isnull=True)
                ),
                name="items_item_asset_class_for_it_only",
            ),
            models.CheckConstraint(
                condition=Exact(
                    Func(
                        F("specifications"),
                        function="jsonb_typeof",
                        output_field=models.TextField(),
                    ),
                    Value("object"),
                ),
                name="items_item_specifications_is_object",
            ),
        ]
        indexes = [
            models.Index(
                fields=["warehouse_type", "is_active"],
                name="items_item_type_active",
            ),
            models.Index(
                fields=["specifications"],
                name="items_item_specifications",
            ),
        ]

    def __str__(self):
        return f"{self.code} {self.name}"

    @property
    def tracks_units(self):
        """A serialized general item: its stock is made of units with serial numbers. IT
        items are serialized too, but their units are assets."""
        return self.tracking == Tracking.SERIALIZED and self.warehouse_type == WarehouseType.GENERAL
