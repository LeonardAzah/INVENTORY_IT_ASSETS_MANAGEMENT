from drf_spectacular.utils import extend_schema_field, extend_schema_serializer
from rest_framework import serializers

from core.api.serializers import RefSerializer, StrictSerializer, id_field
from employees.models import Employee
from inventory.models import ReceiptLine
from items.models import Item
from organization.models import Department, Location, Region

from .choices import AssetStatus, AssigneeType, RelationshipKind
from .models import (
    AcquisitionRecord,
    AssetEvent,
    AssetRelationship,
    ComputerDetails,
    ITAsset,
)

COMPUTER_FIELDS = [f.name for f in ComputerDetails._meta.fields if f.name != "asset"]

# Outputs
class NamedRef(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()

@extend_schema_serializer(component_name="AssetEmployeeRef")
class EmployeeRef(serializers.Serializer):
    id = serializers.UUIDField()
    matricule = serializers.CharField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()

class AssetItemRef(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    name = serializers.CharField()
    asset_class = serializers.CharField()
    brand = serializers.CharField()
    model = serializers.CharField()

class ComputerDetailsOutput(serializers.ModelSerializer):
    class Meta:
        model = ComputerDetails
        fields = COMPUTER_FIELDS

@extend_schema_serializer(component_name="AssetAssignmentOutput")
class AssignmentOutput(serializers.Serializer):
    id = serializers.UUIDField()
    assignee_type = serializers.CharField()
    employee = EmployeeRef(allow_null=True)
    department = RefSerializer(allow_null=True)
    location = NamedRef()
    assigned_at = serializers.DateTimeField()
    notes = serializers.CharField()

class AssetRef(serializers.Serializer):
    """An asset as shown inside another resource."""

    id = serializers.UUIDField()
    asset_tag = serializers.CharField()
    item = serializers.CharField(source="item.name")
    asset_class = serializers.CharField(source="item.asset_class")
    status = serializers.CharField()

class AssetOutput(serializers.ModelSerializer):
    item = AssetItemRef()
    region = RefSerializer()
    custody_warehouse = RefSerializer(allow_null=True)
    location = NamedRef(allow_null=True)
    assignment = AssignmentOutput(source="current_assignment", allow_null=True)
    computer_details = serializers.SerializerMethodField()

    class Meta:
        model = ITAsset
        fields = [
            "id",
            "asset_tag",
            "item",
            "region",
            "serial_number",
            "lot_number",
            "status",
            "source",
            "custody_warehouse",
            "location",
            "assignment",
            "critical_observations",
            "computer_details",
            "registered_at",
            "updated_at",
        ]

    @extend_schema_field(ComputerDetailsOutput(allow_null=True))
    def get_computer_details(self, asset):
        details = getattr(asset, "computer_details", None)
        return ComputerDetailsOutput(details).data if details is not None else None

class AcquisitionOutput(serializers.ModelSerializer):
    region = RefSerializer()
    item = AssetItemRef()
    remaining = serializers.SerializerMethodField()
    recorded_by = serializers.EmailField(source="recorded_by.email")

    class Meta:
        model = AcquisitionRecord
        fields = [
            "id",
            "reference",
            "region",
            "item",
            "quantity",
            "registered_quantity",
            "remaining",
            "acquisition_date",
            "source",
            "notes",
            "recorded_by",
            "recorded_at",
        ]

    def get_remaining(self, acquisition) -> int:
        return acquisition.quantity - acquisition.registered_quantity

class EventOutput(serializers.ModelSerializer):
    actor = serializers.EmailField(source="actor.email")

    class Meta:
        model = AssetEvent
        fields = [
            "id",
            "event_type",
            "from_status",
            "to_status",
            "reason",
            "details",
            "actor",
            "occurred_at",
        ]

class RelationshipOutput(serializers.ModelSerializer):
    asset = AssetRef()
    related_asset = AssetRef()

    class Meta:
        model = AssetRelationship
        fields = ["id", "kind", "asset", "related_asset", "created_at", "ended_at"]

class EmployeeAssetOutput(serializers.Serializer):
    """One active assignment of an employee."""

    assignment_id = serializers.UUIDField(source="pk")
    asset = AssetRef()
    location = NamedRef()
    assigned_at = serializers.DateTimeField()


# Inputs
class ComputerDetailsInput(StrictSerializer):
    operating_system = serializers.CharField(max_length=100, required=False, allow_blank=True)
    license_status = serializers.CharField(max_length=100, required=False, allow_blank=True)
    processor = serializers.CharField(max_length=100, required=False, allow_blank=True)
    ram = serializers.CharField(max_length=50, required=False, allow_blank=True)
    storage = serializers.CharField(max_length=100, required=False, allow_blank=True)
    dvd = serializers.CharField(max_length=50, required=False, allow_blank=True)
    domain_id = serializers.CharField(max_length=100, required=False, allow_blank=True)
    deployment_date = serializers.DateField(required=False, allow_null=True)
    anydesk_id = serializers.CharField(max_length=50, required=False, allow_blank=True)

class PlacementInput(StrictSerializer):
    """Who gets an asset and where it goes."""

    assignee_type = serializers.ChoiceField(choices=AssigneeType.choices)
    employee_id = id_field(Employee, "employee", required=False, allow_null=True)
    department_id = id_field(Department, "department", required=False, allow_null=True)
    location_id = id_field(Location, "location")

def request_id_field():
    """Optional. The same id sent again by the same user repeats nothing (N-11)."""
    return serializers.UUIDField(required=False, allow_null=True)

class AssignInput(PlacementInput):
    notes = serializers.CharField(required=False, allow_blank=True)
    client_request_id = request_id_field()

class _UnitInput(StrictSerializer):
    serial_number = serializers.CharField(max_length=100, required=False, allow_blank=True)
    lot_number = serializers.CharField(max_length=100, required=False, allow_blank=True)
    computer_details = ComputerDetailsInput(required=False)

class RegisterInput(_UnitInput):
    receipt_line_id = id_field(ReceiptLine, "receipt_line", required=False)
    acquisition_id = id_field(AcquisitionRecord, "acquisition", required=False)
    # Present when the unit is already in use rather than in the IT warehouse.
    deployed = PlacementInput(required=False)
    confirm_cross_item_serial = serializers.CharField(required=False, allow_blank=True)
    client_request_id = request_id_field()

class BulkRegisterInput(StrictSerializer):
    receipt_line_id = id_field(ReceiptLine, "receipt_line")
    units = _UnitInput(many=True, allow_empty=False, max_length=500)
    client_request_id = request_id_field()

class DiscoverInput(_UnitInput):
    item_id = id_field(Item, "item")
    found_at_location_id = id_field(Location, "found_at_location")
    into_custody = serializers.BooleanField()
    notes = serializers.CharField()
    candidate_receipt_line_id = id_field(ReceiptLine, "candidate_receipt_line", required=False)
    candidate_acquisition_id = id_field(AcquisitionRecord, "candidate_acquisition", required=False)
    client_request_id = request_id_field()

class AcquisitionInput(StrictSerializer):
    region_id = id_field(Region, "region")
    item_id = id_field(Item, "item")
    quantity = serializers.IntegerField(min_value=1, max_value=100000)
    acquisition_date = serializers.DateField()
    source = serializers.CharField(max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True)
    client_request_id = request_id_field()

class AssetUpdateInput(StrictSerializer):
    lot_number = serializers.CharField(max_length=100, allow_blank=True)
    critical_observations = serializers.CharField(allow_blank=True)
    computer_details = ComputerDetailsInput()

@extend_schema_serializer(component_name="AssetReturnInput")
class ReturnInput(StrictSerializer):
    condition_notes = serializers.CharField(max_length=255)
    client_request_id = request_id_field()

class RelocateInput(StrictSerializer):
    location_id = id_field(Location, "location")
    reason = serializers.CharField()
    client_request_id = request_id_field()

class StatusInput(StrictSerializer):
    to_status = serializers.ChoiceField(choices=AssetStatus.choices)
    reason = serializers.CharField()
    into_custody = serializers.BooleanField(required=False, allow_null=True)
    location_id = id_field(Location, "location", required=False, allow_null=True)
    client_request_id = request_id_field()

class FoundInput(StrictSerializer):
    found_at_location_id = id_field(Location, "found_at_location")
    into_custody = serializers.BooleanField()
    notes = serializers.CharField()
    client_request_id = request_id_field()

class RelationshipInput(StrictSerializer):
    related_asset_id = id_field(ITAsset, "related_asset")
    kind = serializers.ChoiceField(choices=RelationshipKind.choices)

# Documentation only: shapes of responses that the views build as plain data. They are
# used by the OpenAPI schema, not to render anything.
class AssignedAssetOutput(AssetOutput):
    """The asset after an assignment, with the peripherals linked to it: each one is to be
    dealt with by hand, none moves automatically."""

    linked_peripherals = AssetRef(many=True)

    class Meta(AssetOutput.Meta):
        fields = [*AssetOutput.Meta.fields, "linked_peripherals"]

class PendingRegistrationRow(serializers.Serializer):
    source_type = serializers.ChoiceField(choices=["RECEIPT", "ALTERNATIVE_ACQUISITION"])
    # One of the two, by `source_type`.
    receipt_line_id = serializers.UUIDField(allow_null=True)
    acquisition_id = serializers.UUIDField(allow_null=True)
    reference = serializers.CharField()
    date = serializers.DateField()
    region = RefSerializer()
    item = RefSerializer()
    quantity = serializers.IntegerField()
    registered = serializers.IntegerField()
    remaining = serializers.IntegerField()
