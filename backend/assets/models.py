from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from core.models import UUIDModel

from .choices import AssetSource, AssetStatus, AssigneeType, EventType, RelationshipKind

SERIAL_UNIQUE_PER_ITEM = "assets_itasset_item_serial_unique"
ONE_REQUEST_PER_CLIENT_ID = "assets_request_actor_client_request_unique"
ONE_ACTIVE_ASSIGNMENT = "assets_assetassignment_one_active"
ONE_ACTIVE_RELATIONSHIP = "assets_assetrelationship_active_unique"
ONE_PARENT_COMPUTER = "assets_assetrelationship_one_parent"
ONE_OPEN_MAINTENANCE = "assets_assetmaintenance_one_open"

IN_CUSTODY_STATUSES = (AssetStatus.AVAILABLE, AssetStatus.RETURNED)
OUT_OF_CUSTODY_STATUSES = (AssetStatus.ASSIGNED, AssetStatus.LOST, AssetStatus.RETIRED)

def user_fk(**kwargs):
    return models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+", **kwargs
    )

class AcquisitionRecord(UUIDModel):
    reference = models.CharField(max_length=40, unique=True)
    region = models.ForeignKey("organization.Region", on_delete=models.PROTECT, related_name="+")
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="+")
    quantity = models.PositiveIntegerField()
    registered_quantity = models.PositiveIntegerField(default=0)
    acquisition_date = models.DateField()
    source = models.CharField(max_length=255)
    notes = models.TextField(blank=True)
    recorded_by = user_fk()
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        permissions = [("it_acquisition_record", "Record alternative IT acquisitions")]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0), name="assets_acquisition_quantity_positive"
            ),
            models.CheckConstraint(
                condition=Q(registered_quantity__lte=F("quantity")),
                name="assets_acquisition_registered_within_quantity",
            ),
        ]

    def __str__(self):
        return self.reference

class ITAsset(UUIDModel):
    """One physical unit of a serialized item. It gives the unit identity and a
    lifecycle; warehouse quantities are kept by the inventory ledger, and move only when
    an asset crosses the IT warehouse boundary."""

    asset_tag = models.CharField(max_length=32, unique=True)
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="assets")
    region = models.ForeignKey("organization.Region", on_delete=models.PROTECT, related_name="+")
    serial_number = models.CharField(max_length=100, blank=True)
    serial_normalized = models.CharField(max_length=100, null=True, blank=True)  # noqa: DJ001
    lot_number = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=12, choices=AssetStatus.choices)
    source = models.CharField(max_length=24, choices=AssetSource.choices)
    receipt_line = models.ForeignKey(
        "inventory.ReceiptLine", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    acquisition = models.ForeignKey(
        AcquisitionRecord, null=True, blank=True, on_delete=models.PROTECT, related_name="assets"
    )
    custody_warehouse = models.ForeignKey(
        "warehouses.Warehouse", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    location = models.ForeignKey(
        "organization.Location", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    current_assignment = models.OneToOneField(
        "assets.AssetAssignment",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    critical_observations = models.TextField(blank=True)
    registered_by = user_fk()
    registered_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        default_permissions = ()
        permissions = [
            ("it_asset_view", "View IT assets"),
            ("it_asset_register", "Register IT assets"),
            ("it_asset_assign", "Assign IT assets"),
            ("it_asset_return", "Record IT asset returns"),
            ("it_asset_update", "Update IT asset details"),
            ("it_asset_maintain", "Change IT asset status (inspection, maintenance, damage)"),
            ("it_asset_relocate", "Relocate IT assets"),
            ("it_asset_dispose", "Mark IT assets lost or retired"),
            ("report_view_assets", "View IT asset reports"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["item", "serial_normalized"],
                condition=Q(serial_normalized__isnull=False),
                name=SERIAL_UNIQUE_PER_ITEM,
            ),
            models.CheckConstraint(
                condition=Q(status__in=AssetStatus.values), name="assets_itasset_status_valid"
            ),
            models.CheckConstraint(
                condition=(
                    Q(source=AssetSource.RECEIPT, receipt_line__isnull=False)
                    | (~Q(source=AssetSource.RECEIPT) & Q(receipt_line__isnull=True))
                )
                & (
                    Q(source=AssetSource.ALTERNATIVE_ACQUISITION, acquisition__isnull=False)
                    | (~Q(source=AssetSource.ALTERNATIVE_ACQUISITION) & Q(acquisition__isnull=True))
                ),
                name="assets_itasset_source_matches_link",
            ),
            # Custody follows status.
            models.CheckConstraint(
                condition=~Q(status__in=IN_CUSTODY_STATUSES) | Q(custody_warehouse__isnull=False),
                name="assets_itasset_in_warehouse_statuses_have_custody",
            ),
            models.CheckConstraint(
                condition=~Q(status__in=OUT_OF_CUSTODY_STATUSES)
                | Q(custody_warehouse__isnull=True),
                name="assets_itasset_gone_statuses_have_no_custody",
            ),
            models.CheckConstraint(
                condition=(
                    Q(status=AssetStatus.ASSIGNED, current_assignment__isnull=False)
                    | (~Q(status=AssetStatus.ASSIGNED) & Q(current_assignment__isnull=True))
                ),
                name="assets_itasset_assigned_has_assignment",
            ),
        ]
        indexes = [
            models.Index(fields=["region", "status"], name="assets_itasset_region_status"),
            models.Index(
                fields=["custody_warehouse", "item", "status"], name="assets_itasset_custody"
            ),
            models.Index(fields=["serial_normalized"], name="assets_itasset_serial"),
        ]

    def __str__(self):
        return self.asset_tag

class ComputerDetails(models.Model):
    asset = models.OneToOneField(
        ITAsset, primary_key=True, on_delete=models.PROTECT, related_name="computer_details"
    )
    operating_system = models.CharField(max_length=100, blank=True)
    license_status = models.CharField(max_length=100, blank=True)
    processor = models.CharField(max_length=100, blank=True)
    ram = models.CharField(max_length=50, blank=True)
    storage = models.CharField(max_length=100, blank=True)
    dvd = models.CharField(max_length=50, blank=True)
    domain_id = models.CharField(max_length=100, blank=True)
    deployment_date = models.DateField(null=True, blank=True)
    anydesk_id = models.CharField(max_length=50, blank=True)

    class Meta:
        default_permissions = ()
        verbose_name_plural = "computer details"

    def __str__(self):
        return f"Details of {self.asset_id}"

class AssetAssignment(UUIDModel):
    asset = models.ForeignKey(ITAsset, on_delete=models.PROTECT, related_name="assignments")
    assignee_type = models.CharField(max_length=10, choices=AssigneeType.choices)
    employee = models.ForeignKey(
        "employees.Employee", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    department = models.ForeignKey(
        "organization.Department", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    location = models.ForeignKey(
        "organization.Location", on_delete=models.PROTECT, related_name="+"
    )
    assigned_by = user_fk()
    assigned_at = models.DateTimeField(default=timezone.now)
    returned_by = user_fk(null=True, blank=True)
    returned_at = models.DateTimeField(null=True, blank=True)
    return_condition = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(
                fields=["asset"], condition=Q(returned_at__isnull=True), name=ONE_ACTIVE_ASSIGNMENT
            ),
            models.CheckConstraint(
                condition=(
                    Q(
                        assignee_type=AssigneeType.EMPLOYEE,
                        employee__isnull=False,
                        department__isnull=True,
                    )
                    | Q(
                        assignee_type=AssigneeType.DEPARTMENT,
                        employee__isnull=True,
                        department__isnull=False,
                    )
                    | Q(
                        assignee_type=AssigneeType.LOCATION,
                        employee__isnull=True,
                        department__isnull=True,
                    )
                ),
                name="assets_assetassignment_assignee_matches_type",
            ),
            models.CheckConstraint(
                condition=Q(returned_at__isnull=True) | Q(returned_at__gte=F("assigned_at")),
                name="assets_assetassignment_returned_after_assigned",
            ),
        ]
        indexes = [
            models.Index(
                fields=["employee"],
                condition=Q(returned_at__isnull=True),
                name="assets_assignment_employee",
            ),
        ]

    def __str__(self):
        return f"{self.asset_id} -> {self.assignee_type}"

class AssetRelationship(UUIDModel):
    asset = models.ForeignKey(ITAsset, on_delete=models.PROTECT, related_name="relationships")
    related_asset = models.ForeignKey(
        ITAsset, on_delete=models.PROTECT, related_name="incoming_relationships"
    )
    kind = models.CharField(max_length=20, choices=RelationshipKind.choices)
    created_by = user_fk()
    created_at = models.DateTimeField(default=timezone.now)
    ended_by = user_fk(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        default_permissions = ()
        constraints = [
            models.CheckConstraint(
                condition=~Q(asset=F("related_asset")), name="assets_assetrelationship_not_self"
            ),
            models.UniqueConstraint(
                fields=["asset", "related_asset", "kind"],
                condition=Q(ended_at__isnull=True),
                name=ONE_ACTIVE_RELATIONSHIP,
            ),
            models.UniqueConstraint(
                fields=["asset"],
                condition=Q(kind=RelationshipKind.PERIPHERAL_OF, ended_at__isnull=True),
                name=ONE_PARENT_COMPUTER,
            ),
        ]

    def __str__(self):
        return f"{self.asset_id} {self.kind} {self.related_asset_id}"

class AssetRequest(UUIDModel):
    actor = user_fk()
    client_request_id = models.UUIDField()
    operation = models.CharField(max_length=32)
    object_ids = models.JSONField(default=list)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(
                fields=["actor", "client_request_id"], name=ONE_REQUEST_PER_CLIENT_ID
            ),
        ]

    def __str__(self):
        return f"{self.operation} {self.client_request_id}"

class AssetEvent(UUIDModel):
    """The asset's timeline: one insert-only row per thing that happened to it."""
    asset = models.ForeignKey(ITAsset, on_delete=models.PROTECT, related_name="events")
    event_type = models.CharField(max_length=16, choices=EventType.choices)
    from_status = models.CharField(max_length=12, blank=True)
    to_status = models.CharField(max_length=12, blank=True)
    details = models.JSONField(default=dict, encoder=DjangoJSONEncoder)
    reason = models.TextField(blank=True)
    actor = user_fk()
    occurred_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        indexes = [
            models.Index(fields=["asset", "occurred_at"], name="assets_event_asset_time"),
        ]

    def __str__(self):
        return f"{self.asset_id} {self.event_type}"

class AssetLocationHistory(UUIDModel):
    asset = models.ForeignKey(ITAsset, on_delete=models.PROTECT, related_name="location_history")
    from_location = models.ForeignKey(
        "organization.Location", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    # NULL when the unit went into the IT warehouse.
    to_location = models.ForeignKey(
        "organization.Location", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    moved_by = user_fk()
    moved_at = models.DateTimeField(default=timezone.now)
    reason = models.TextField(blank=True)

    class Meta:
        default_permissions = ()
        verbose_name_plural = "asset location history"
        indexes = [
            models.Index(fields=["asset", "moved_at"], name="assets_location_asset_time"),
        ]

    def __str__(self):
        return f"{self.asset_id} moved"

class AssetMaintenance(UUIDModel):
    asset = models.ForeignKey(ITAsset, on_delete=models.PROTECT, related_name="maintenance")
    opened_by = user_fk()
    opened_at = models.DateTimeField(default=timezone.now)
    description = models.TextField()
    closed_by = user_fk(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    outcome = models.TextField(blank=True)

    class Meta:
        default_permissions = ()
        verbose_name_plural = "asset maintenance"
        constraints = [
            models.UniqueConstraint(
                fields=["asset"], condition=Q(closed_at__isnull=True), name=ONE_OPEN_MAINTENANCE
            ),
        ]

    def __str__(self):
        return f"Maintenance of {self.asset_id}"
