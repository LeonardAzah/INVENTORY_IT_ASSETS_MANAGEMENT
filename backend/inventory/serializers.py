from drf_spectacular.utils import extend_schema_field, extend_schema_serializer
from rest_framework import serializers

from core.api.serializers import RefSerializer, StrictSerializer, id_field
from core.quantities import DECIMAL_PLACES, MAX_DIGITS
from employees.models import Employee
from items.models import Item
from items.serializers import ItemRef
from warehouses.models import Warehouse

from .choices import AdjustmentKind, ReturnCondition, StockTakeStatus
from .models import (
    InventoryBalance,
    InventoryTransaction,
    StockAdjustment,
    StockIssue,
    StockReceipt,
    StockReturn,
    StockTake,
    StockUnit,
    StockUnitMovement,
)
from .services import stocktakes, thresholds, units

MAX_UNITS_PER_LINE = 1000

def quantity_field(**kwargs):
    return serializers.DecimalField(max_digits=MAX_DIGITS, decimal_places=DECIMAL_PLACES, **kwargs)

class EmployeeRef(serializers.Serializer):
    id = serializers.UUIDField()
    matricule = serializers.CharField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()

def _no_duplicates(lines, key, what):
    seen = set()
    for line in lines:
        identity = key(line)
        if identity in seen:
            raise serializers.ValidationError(f"{what} appears on more than one line.")
        seen.add(identity)
    return lines

def serials_field():
    """Serial numbers of the units a line brings in (serialized general items only)."""
    return serializers.ListField(
        child=serializers.CharField(max_length=100, trim_whitespace=True),
        max_length=MAX_UNITS_PER_LINE,
        required=False,
    )

def unit_ids_field():
    """Units a line takes out or changes (serialized general items only)."""
    return serializers.ListField(
        child=serializers.UUIDField(), max_length=MAX_UNITS_PER_LINE, required=False
    )

def reason_field():
    """Why a serial already recorded under another item is a different unit."""
    return serializers.CharField(required=False, allow_blank=True, max_length=500)

@extend_schema_serializer(component_name="StockUnitRef")
class UnitRef(serializers.Serializer):
    id = serializers.UUIDField()
    serial_number = serializers.CharField()

def units_of_line(line_id, item):
    """The units a document line moved, by serial number. Empty for other items."""
    if not units.tracks_units(item):
        return []
    movements = (
        StockUnitMovement.objects.filter(line_id=line_id)
        .select_related("unit")
        .order_by("unit__serial_normalized")
    )
    return UnitRef([movement.unit for movement in movements], many=True).data

# Balances and ledger
class BalanceOutput(serializers.ModelSerializer):
    warehouse = RefSerializer()
    item = ItemRef()
    on_hand = quantity_field(source="quantity_on_hand")
    unavailable = quantity_field(source="quantity_unavailable")
    available = serializers.SerializerMethodField()
    threshold = quantity_field(source="low_stock_threshold")
    below_threshold = serializers.BooleanField(source="low_stock_alerted")

    class Meta:
        model = InventoryBalance
        fields = [
            "id",
            "warehouse",
            "item",
            "on_hand",
            "unavailable",
            "available",
            "threshold",
            "below_threshold",
            "last_movement_at",
        ]

    @extend_schema_field(quantity_field())
    def get_available(self, balance):
        return str(quantity_field().to_representation(thresholds.available(balance)))

class TransactionOutput(serializers.ModelSerializer):
    warehouse = RefSerializer()
    item = ItemRef()
    actor = serializers.EmailField(source="actor.email")

    class Meta:
        model = InventoryTransaction
        fields = [
            "id",
            "warehouse",
            "item",
            "type",
            "quantity_delta",
            "unavailable_delta",
            "on_hand_after",
            "unavailable_after",
            "source_type",
            "source_id",
            "reference",
            "actor",
            "occurred_at",
        ]

class ThresholdInput(StrictSerializer):
    warehouse_id = id_field(Warehouse, "warehouse")
    item_id = id_field(Item, "item")
    threshold = quantity_field(allow_null=True, min_value=0)

# Receipts
class LineInput(StrictSerializer):
    item_id = id_field(Item, "item")
    quantity = quantity_field()

class ReceiptLineInput(LineInput):
    serials = serials_field()
    cross_item_serial_reason = reason_field()

class IssueLineInput(LineInput):
    unit_ids = unit_ids_field()

class _DocumentInput(StrictSerializer):
    warehouse_id = id_field(Warehouse, "warehouse")
    notes = serializers.CharField(required=False, allow_blank=True)
    client_request_id = serializers.UUIDField(required=False, allow_null=True)

class ReceiptInput(_DocumentInput):
    receipt_date = serializers.DateField()
    source = serializers.CharField(max_length=255)
    lines = ReceiptLineInput(many=True, allow_empty=False)

    def validate_lines(self, lines):
        return _no_duplicates(lines, lambda line: line["item"].pk, "An item")

class ReceiptLineOutput(serializers.Serializer):
    id = serializers.UUIDField()
    item = ItemRef()
    quantity = quantity_field()
    registered_quantity = quantity_field()
    units = serializers.SerializerMethodField()

    @extend_schema_field(UnitRef(many=True))
    def get_units(self, line):
        return units_of_line(line.pk, line.item)

class ReceiptOutput(serializers.ModelSerializer):
    warehouse = RefSerializer()
    lines = ReceiptLineOutput(many=True)
    created_by = serializers.EmailField(source="created_by.email")

    class Meta:
        model = StockReceipt
        fields = [
            "id",
            "reference",
            "warehouse",
            "receipt_date",
            "source",
            "notes",
            "lines",
            "created_by",
            "created_at",
        ]

# Issues
class IssueInput(_DocumentInput):
    issue_date = serializers.DateField()
    employee_id = id_field(Employee, "employee", required=False)
    recipient_store_id = id_field(Warehouse, "recipient_store", required=False)
    lines = IssueLineInput(many=True, allow_empty=False)

    def validate_lines(self, lines):
        return _no_duplicates(lines, lambda line: line["item"].pk, "An item")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if ("employee" in attrs) == ("recipient_store" in attrs):
            message = "Give either employee_id or recipient_store_id."
            raise serializers.ValidationError(
                {"employee_id": [message], "recipient_store_id": [message]}
            )
        return attrs

class RecipientStoresQuery(StrictSerializer):
    warehouse = serializers.UUIDField()

class IssueLineOutput(serializers.Serializer):
    id = serializers.UUIDField()
    item = ItemRef()
    quantity = quantity_field()
    returned_quantity = quantity_field()
    units = serializers.SerializerMethodField()

    @extend_schema_field(UnitRef(many=True))
    def get_units(self, line):
        return units_of_line(line.pk, line.item)

class IssueOutput(serializers.ModelSerializer):
    warehouse = RefSerializer()
    employee = EmployeeRef(allow_null=True)
    recipient_store = RefSerializer(allow_null=True)
    lines = IssueLineOutput(many=True)
    created_by = serializers.EmailField(source="created_by.email")

    class Meta:
        model = StockIssue
        fields = [
            "id",
            "reference",
            "warehouse",
            "issue_date",
            "employee",
            "recipient_store",
            "notes",
            "lines",
            "created_by",
            "created_at",
        ]

# Returns
class ReturnLineInput(LineInput):
    condition = serializers.ChoiceField(choices=ReturnCondition.choices)
    unit_ids = unit_ids_field()
    serials = serials_field()
    cross_item_serial_reason = reason_field()

class ReturnInput(_DocumentInput):
    return_date = serializers.DateField()
    employee_id = id_field(Employee, "employee")
    issue_id = id_field(StockIssue, "issue", required=False, allow_null=True)
    lines = ReturnLineInput(many=True, allow_empty=False)

    def validate_lines(self, lines):
        return _no_duplicates(
            lines, lambda line: (line["item"].pk, line["condition"]), "An item and condition"
        )

class ReturnLineOutput(serializers.Serializer):
    id = serializers.UUIDField()
    item = ItemRef()
    quantity = quantity_field()
    condition = serializers.CharField()
    units = serializers.SerializerMethodField()

    @extend_schema_field(UnitRef(many=True))
    def get_units(self, line):
        return units_of_line(line.pk, line.item)

class IssueRef(serializers.Serializer):
    id = serializers.UUIDField()
    reference = serializers.CharField()

class ReturnOutput(serializers.ModelSerializer):
    warehouse = RefSerializer()
    employee = EmployeeRef()
    issue = IssueRef(allow_null=True)
    lines = ReturnLineOutput(many=True)
    created_by = serializers.EmailField(source="created_by.email")

    class Meta:
        model = StockReturn
        fields = [
            "id",
            "reference",
            "warehouse",
            "return_date",
            "employee",
            "issue",
            "notes",
            "lines",
            "created_by",
            "created_at",
        ]

# Adjustments
class AdjustmentInput(StrictSerializer):
    warehouse_id = id_field(Warehouse, "warehouse")
    item_id = id_field(Item, "item")
    kind = serializers.ChoiceField(choices=AdjustmentKind.choices)
    quantity = quantity_field()
    reason = serializers.CharField()
    serials = serials_field()
    unit_ids = unit_ids_field()
    cross_item_serial_reason = reason_field()
    client_request_id = serializers.UUIDField(required=False, allow_null=True)

class AdjustmentOutput(serializers.ModelSerializer):
    warehouse = RefSerializer()
    item = ItemRef()
    units = serializers.SerializerMethodField()
    created_by = serializers.EmailField(source="created_by.email")

    @extend_schema_field(UnitRef(many=True))
    def get_units(self, adjustment):
        return units_of_line(adjustment.pk, adjustment.item)

    class Meta:
        model = StockAdjustment
        fields = [
            "id",
            "reference",
            "warehouse",
            "item",
            "kind",
            "quantity_delta",
            "unavailable_delta",
            "previous_on_hand",
            "resulting_on_hand",
            "reason",
            "stock_take_line",
            "units",
            "created_by",
            "created_at",
        ]

# Stock-takes
class StockTakeInput(StrictSerializer):
    warehouse_id = id_field(Warehouse, "warehouse")

class CountInput(StrictSerializer):

    item_id = id_field(Item, "item")
    counted_quantity = quantity_field(required=False)
    serials = serials_field()

class CountsInput(StrictSerializer):
    lines = CountInput(many=True, allow_empty=False)

    def validate_lines(self, lines):
        return _no_duplicates(lines, lambda line: line["item"].pk, "An item")

class CompleteInput(StrictSerializer):
    reasons = serializers.DictField(child=serializers.CharField(), required=False)

class AdjustmentRef(serializers.Serializer):
    id = serializers.UUIDField()
    reference = serializers.CharField()

class ScannedSerial(serializers.Serializer):
    serial_number = serializers.CharField()
    unit_id = serializers.UUIDField(allow_null=True)

class StockTakeLineOutput(serializers.Serializer):
    id = serializers.UUIDField()
    item = ItemRef()
    counted_quantity = quantity_field()
    system_quantity_at_count = quantity_field()
    difference = serializers.SerializerMethodField()
    counted_at = serializers.DateTimeField()
    adjustment = serializers.SerializerMethodField()
    adjustments = serializers.SerializerMethodField()
    differs = serializers.SerializerMethodField()
    serials = serializers.SerializerMethodField()
    missing = serializers.SerializerMethodField()
    found = serializers.SerializerMethodField()

    def _outcome(self, line):
        if not units.tracks_units(line.item) or line.stock_take.status != StockTakeStatus.DRAFT:
            return None
        if not hasattr(line, "_outcome"):
            line._outcome = stocktakes.serial_outcome(line, line.stock_take.warehouse)
        return line._outcome

    @extend_schema_field(AdjustmentRef(many=True))
    def get_adjustments(self, line):
        return [
            {"id": str(adjustment.pk), "reference": adjustment.reference}
            for adjustment in sorted(line.adjustments.all(), key=lambda made: made.reference)
        ]

    def get_differs(self, line) -> bool:
        outcome = self._outcome(line)
        if outcome is not None:
            return bool(outcome[0] or outcome[1])
        if units.tracks_units(line.item):
            return bool(self.get_adjustments(line))
        return stocktakes.differs(line)

    @extend_schema_field(ScannedSerial(many=True))
    def get_serials(self, line):
        if not units.tracks_units(line.item):
            return []
        return [
            {
                "serial_number": scan.serial_number,
                "unit_id": str(scan.unit_id) if scan.unit_id else None,
            }
            for scan in sorted(line.serials.all(), key=lambda scan: scan.serial_normalized)
        ]

    @extend_schema_field(UnitRef(many=True))
    def get_missing(self, line):
        outcome = self._outcome(line)
        return UnitRef(outcome[0], many=True).data if outcome else []

    def get_found(self, line) -> list[str]:
        outcome = self._outcome(line)
        return [scan.serial_number for scan in outcome[1]] if outcome else []

    @extend_schema_field(quantity_field())
    def get_difference(self, line):
        return str(
            quantity_field().to_representation(
                line.counted_quantity - line.system_quantity_at_count
            )
        )

    @extend_schema_field(AdjustmentRef(allow_null=True))
    def get_adjustment(self, line):
        made = self.get_adjustments(line)
        return made[0] if made else None

class StockTakeOutput(serializers.ModelSerializer):
    warehouse = RefSerializer()
    lines = StockTakeLineOutput(many=True)
    started_by = serializers.EmailField(source="started_by.email")
    completed_by = serializers.SerializerMethodField()

    class Meta:
        model = StockTake
        fields = [
            "id",
            "reference",
            "warehouse",
            "status",
            "lines",
            "started_by",
            "started_at",
            "completed_by",
            "completed_at",
        ]

    def get_completed_by(self, stock_take) -> str | None:
        return stock_take.completed_by.email if stock_take.completed_by_id else None

# Units of serialized general items
class IssueOfUnit(serializers.Serializer):
    id = serializers.UUIDField(source="issue_id")
    reference = serializers.CharField(source="issue.reference")

@extend_schema_serializer(component_name="StockUnitOutput")
class UnitOutput(serializers.ModelSerializer):
    item = ItemRef()
    warehouse = RefSerializer()
    issued_to_employee = EmployeeRef(allow_null=True)
    issued_to_store = RefSerializer(allow_null=True)
    issue = IssueOfUnit(source="current_issue_line", allow_null=True)

    class Meta:
        model = StockUnit
        fields = [
            "id",
            "item",
            "serial_number",
            "status",
            "warehouse",
            "issued_to_employee",
            "issued_to_store",
            "issue",
            "created_at",
            "updated_at",
        ]

class UnitMovementOutput(serializers.ModelSerializer):
    type = serializers.CharField(source="ledger_entry.type")
    reference = serializers.CharField(source="ledger_entry.reference")
    source_type = serializers.CharField(source="ledger_entry.source_type")
    source_id = serializers.UUIDField(source="ledger_entry.source_id")
    warehouse = RefSerializer(source="ledger_entry.warehouse")
    actor = serializers.EmailField(source="ledger_entry.actor.email")

    class Meta:
        model = StockUnitMovement
        fields = [
            "id",
            "occurred_at",
            "type",
            "reference",
            "source_type",
            "source_id",
            "warehouse",
            "from_status",
            "to_status",
            "actor",
        ]

@extend_schema_serializer(component_name="StockUnitDetailOutput")
class UnitDetailOutput(UnitOutput):
    """A unit with its whole history, oldest first."""

    history = serializers.SerializerMethodField()

    class Meta(UnitOutput.Meta):
        fields = [*UnitOutput.Meta.fields, "history"]

    @extend_schema_field(UnitMovementOutput(many=True))
    def get_history(self, unit):
        movements = unit.movements.select_related(
            "ledger_entry__warehouse", "ledger_entry__actor"
        ).order_by("occurred_at", "pk")
        return UnitMovementOutput(movements, many=True).data
