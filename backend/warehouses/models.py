from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from core.models import UUIDModel

from .choices import WarehouseType

WAREHOUSE_CODE_UNIQUE = "warehouses_warehouse_code_unique"
WAREHOUSE_ONE_IT_PER_REGION = "warehouses_warehouse_one_it_per_region"
WAREHOUSE_ONE_REGIONAL_STORE_PER_REGION = "warehouses_warehouse_one_regional_store_per_region"
ONE_STORE_KEEPER = "warehouses_warehouseassignment_one_active"

class Warehouse(UUIDModel):
    """GENERAL warehouses hold quantity-tracked stock and are run by one Store Keeper."""
    code = models.CharField(max_length=12)
    name = models.CharField(max_length=150)
    type = models.CharField(max_length=8, choices=WarehouseType.choices)
    region = models.ForeignKey(
        "organization.Region", on_delete=models.PROTECT, related_name="warehouses"
    )
    office = models.ForeignKey(
        "organization.Office", on_delete=models.PROTECT, related_name="warehouses"
    )
    department = models.ForeignKey(
        "organization.Department",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="warehouses",
    )
    is_active = models.BooleanField(default=True)
    is_regional_store = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        permissions = [("warehouse_manage", "Create and manage warehouses")]
        constraints = [
            models.UniqueConstraint(fields=["code"], name=WAREHOUSE_CODE_UNIQUE),
            models.UniqueConstraint(
                fields=["region"],
                condition=Q(type=WarehouseType.IT, is_active=True),
                name=WAREHOUSE_ONE_IT_PER_REGION,
            ),
            models.UniqueConstraint(
                fields=["region"],
                condition=Q(is_regional_store=True, is_active=True),
                name=WAREHOUSE_ONE_REGIONAL_STORE_PER_REGION,
            ),
            models.CheckConstraint(
                condition=Q(is_regional_store=False) | Q(type=WarehouseType.GENERAL),
                name="warehouses_warehouse_regional_store_is_general",
            ),
            models.CheckConstraint(
                condition=Q(type__in=WarehouseType.values), name="warehouses_warehouse_type_valid"
            ),
        ]
        indexes = [
            models.Index(fields=["region", "type"], name="warehouses_warehouse_region"),
        ]

    def __str__(self):
        return f"{self.code} {self.name}"

class WarehouseAssignment(UUIDModel):
    """Who is, or was, the Store Keeper of a warehouse. Rows are ended, never deleted."""
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="assignments")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="warehouse_assignments"
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    assigned_at = models.DateTimeField(default=timezone.now)
    ended_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    ended_at = models.DateTimeField(null=True, blank=True)
    end_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        default_permissions = ()
        permissions = [("store_keeper_assign", "Assign and remove Store Keepers")]
        constraints = [
            models.UniqueConstraint(
                fields=["warehouse"], condition=Q(ended_at__isnull=True), name=ONE_STORE_KEEPER
            ),
        ]
        indexes = [
            models.Index(
                fields=["user"],
                condition=Q(ended_at__isnull=True),
                name="warehouses_assignment_user",
            ),
        ]

    def __str__(self):
        return f"{self.user} keeps {self.warehouse_id}"
