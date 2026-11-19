from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from core.models import UUIDModel
from core.quantities import DECIMAL_PLACES, MAX_DIGITS

from .choices import (
    AdjustmentKind,
    ReturnCondition,
    StockTakeStatus,
    StockUnitStatus,
    TransactionType,
)

IDEMPOTENCY_SUFFIX = "_client_request_unique"
ONE_DRAFT_STOCK_TAKE = "inventory_stocktake_one_draft"
UNIT_SERIAL_UNIQUE = "inventory_stockunit_item_serial_unique"
IN_STOCK_STATUSES = (StockUnitStatus.IN_STOCK, StockUnitStatus.UNAVAILABLE)


def quantity_field(**kwargs):
    return models.DecimalField(max_digits=MAX_DIGITS, decimal_places=DECIMAL_PLACES, **kwargs)

def user_fk(**kwargs):
    return models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+", **kwargs
    )

def idempotency_constraint(table):
    """One document per (author, client_request_id): a repeated submission is a replay."""
    return models.UniqueConstraint(
        fields=["created_by", "client_request_id"],
        condition=Q(client_request_id__isnull=False),
        name=f"inventory_{table}{IDEMPOTENCY_SUFFIX}",
    )

class InventoryBalance(UUIDModel):
    """How much of an item a warehouse holds. A cache of the ledger, changed only by
    `services.ledger` in the same transaction as the ledger row."""

    warehouse = models.ForeignKey(
        "warehouses.Warehouse", on_delete=models.PROTECT, related_name="balances"
    )
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="balances")
    quantity_on_hand = quantity_field(default=0)
    quantity_unavailable = quantity_field(default=0)
    low_stock_threshold = quantity_field(null=True, blank=True)
    low_stock_alerted = models.BooleanField(default=False)
    last_movement_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        default_permissions = ()
        permissions = [
            ("inventory_view", "View stock balances and movements"),
            ("inventory_threshold_set", "Set low-stock thresholds"),
            ("report_view_inventory", "View inventory reports"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["warehouse", "item"], name="inventory_balance_warehouse_item_unique"
            ),
            models.CheckConstraint(
                condition=Q(quantity_on_hand__gte=0), name="inventory_balance_on_hand_not_negative"
            ),
            models.CheckConstraint(
                condition=Q(quantity_unavailable__gte=0)
                & Q(quantity_unavailable__lte=F("quantity_on_hand")),
                name="inventory_balance_unavailable_within_on_hand",
            ),
            models.CheckConstraint(
                condition=Q(low_stock_threshold__isnull=True) | Q(low_stock_threshold__gte=0),
                name="inventory_balance_threshold_not_negative",
            ),
        ]

    def __str__(self):
        return f"{self.warehouse_id}/{self.item_id}: {self.quantity_on_hand}"

    @property
    def quantity_available(self):
        return self.quantity_on_hand - self.quantity_unavailable

class InventoryTransaction(UUIDModel):
    """The ledger. Append-only: a database trigger rejects UPDATE and DELETE."""

    warehouse = models.ForeignKey(
        "warehouses.Warehouse", on_delete=models.PROTECT, related_name="transactions"
    )
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="transactions")
    type = models.CharField(max_length=16, choices=TransactionType.choices)
    quantity_delta = quantity_field()
    unavailable_delta = quantity_field(default=0)
    on_hand_after = quantity_field()
    unavailable_after = quantity_field()
    source_type = models.CharField(max_length=16)
    source_id = models.UUIDField()
    reference = models.CharField(max_length=40)
    actor = user_fk()
    occurred_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        constraints = [
            models.CheckConstraint(
                condition=~Q(quantity_delta=0) | ~Q(unavailable_delta=0),
                name="inventory_transaction_moves_something",
            ),
            models.CheckConstraint(
                condition=Q(type__in=TransactionType.values),
                name="inventory_transaction_type_valid",
            ),
        ]
        indexes = [
            models.Index(
                fields=["warehouse", "item", "occurred_at"], name="inventory_txn_balance_time"
            ),
            models.Index(fields=["source_type", "source_id"], name="inventory_txn_source"),
            models.Index(fields=["occurred_at"], name="inventory_txn_time"),
        ]

    def __str__(self):
        return f"{self.type} {self.quantity_delta} ({self.reference})"

class StockReceipt(UUIDModel):
    reference = models.CharField(max_length=40, unique=True)
    warehouse = models.ForeignKey(
        "warehouses.Warehouse", on_delete=models.PROTECT, related_name="receipts"
    )
    receipt_date = models.DateField()
    source = models.CharField(max_length=255)
    notes = models.TextField(blank=True)
    client_request_id = models.UUIDField(null=True, blank=True)
    created_by = user_fk()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        permissions = [
            ("inventory_receive", "Receive stock into an assigned general warehouse"),
            ("it_stock_receive", "Receive stock into the regional IT warehouse"),
        ]
        constraints = [idempotency_constraint("stockreceipt")]
        indexes = [
            models.Index(fields=["warehouse", "receipt_date"], name="inventory_receipt_wh_date"),
        ]

    def __str__(self):
        return self.reference

class ReceiptLine(UUIDModel):
    receipt = models.ForeignKey(StockReceipt, on_delete=models.PROTECT, related_name="lines")
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="+")
    quantity = quantity_field()
    registered_quantity = quantity_field(default=0)

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(
                fields=["receipt", "item"], name="inventory_receiptline_item_unique"
            ),
            models.CheckConstraint(
                condition=Q(quantity__gt=0), name="inventory_receiptline_quantity_positive"
            ),
            models.CheckConstraint(
                condition=Q(registered_quantity__gte=0) & Q(registered_quantity__lte=F("quantity")),
                name="inventory_receiptline_registered_within_quantity",
            ),
        ]
        indexes = [
            models.Index(
                fields=["item"],
                condition=Q(registered_quantity__lt=F("quantity")),
                name="inventory_receiptline_pending",
            ),
        ]

    def __str__(self):
        return f"{self.receipt_id}: {self.quantity} x {self.item_id}"

class StockIssue(UUIDModel):
    reference = models.CharField(max_length=40, unique=True)
    warehouse = models.ForeignKey(
        "warehouses.Warehouse", on_delete=models.PROTECT, related_name="issues"
    )
    issue_date = models.DateField()
    employee = models.ForeignKey(
        "employees.Employee", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    recipient_store = models.ForeignKey(
        "warehouses.Warehouse",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="issues_received",
    )
    notes = models.TextField(blank=True)
    client_request_id = models.UUIDField(null=True, blank=True)
    created_by = user_fk()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        permissions = [("inventory_issue", "Issue stock from an assigned general warehouse")]
        constraints = [
            idempotency_constraint("stockissue"),
            models.CheckConstraint(
                condition=(
                    Q(employee__isnull=False, recipient_store__isnull=True)
                    | Q(employee__isnull=True, recipient_store__isnull=False)
                ),
                name="inventory_stockissue_one_recipient",
            ),
            models.CheckConstraint(
                condition=~Q(recipient_store=F("warehouse")),
                name="inventory_stockissue_not_to_itself",
            ),
        ]
        indexes = [
            models.Index(fields=["warehouse", "issue_date"], name="inventory_issue_wh_date"),
        ]

    def __str__(self):
        return self.reference

class IssueLine(UUIDModel):
    issue = models.ForeignKey(StockIssue, on_delete=models.PROTECT, related_name="lines")
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="+")
    quantity = quantity_field()
    returned_quantity = quantity_field(default=0)

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "item"], name="inventory_issueline_item_unique"
            ),
            models.CheckConstraint(
                condition=Q(quantity__gt=0), name="inventory_issueline_quantity_positive"
            ),
            models.CheckConstraint(
                condition=Q(returned_quantity__gte=0) & Q(returned_quantity__lte=F("quantity")),
                name="inventory_issueline_returned_within_quantity",
            ),
        ]

    def __str__(self):
        return f"{self.issue_id}: {self.quantity} x {self.item_id}"

class StockReturn(UUIDModel):
    reference = models.CharField(max_length=40, unique=True)
    warehouse = models.ForeignKey(
        "warehouses.Warehouse", on_delete=models.PROTECT, related_name="returns"
    )
    return_date = models.DateField()
    employee = models.ForeignKey("employees.Employee", on_delete=models.PROTECT, related_name="+")
    issue = models.ForeignKey(
        StockIssue, null=True, blank=True, on_delete=models.PROTECT, related_name="returns"
    )
    notes = models.TextField(blank=True)
    client_request_id = models.UUIDField(null=True, blank=True)
    created_by = user_fk()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        permissions = [("inventory_return", "Record returns into an assigned general warehouse")]
        constraints = [
            idempotency_constraint("stockreturn"),
            models.CheckConstraint(
                condition=Q(issue__isnull=False) | ~Q(notes=""),
                name="inventory_stockreturn_issue_or_note",
            ),
        ]

    def __str__(self):
        return self.reference

class ReturnLine(UUIDModel):
    stock_return = models.ForeignKey(StockReturn, on_delete=models.PROTECT, related_name="lines")
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="+")
    quantity = quantity_field()
    condition = models.CharField(max_length=8, choices=ReturnCondition.choices)
    issue_line = models.ForeignKey(
        IssueLine, null=True, blank=True, on_delete=models.PROTECT, related_name="return_lines"
    )

    class Meta:
        default_permissions = ()
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0), name="inventory_returnline_quantity_positive"
            ),
            models.CheckConstraint(
                condition=Q(condition__in=ReturnCondition.values),
                name="inventory_returnline_condition_valid",
            ),
        ]

    def __str__(self):
        return f"{self.stock_return_id}: {self.quantity} x {self.item_id} ({self.condition})"

class StockTake(UUIDModel):
    reference = models.CharField(max_length=40, unique=True)
    warehouse = models.ForeignKey(
        "warehouses.Warehouse", on_delete=models.PROTECT, related_name="stock_takes"
    )
    status = models.CharField(
        max_length=10, choices=StockTakeStatus.choices, default=StockTakeStatus.DRAFT
    )
    started_by = user_fk()
    started_at = models.DateTimeField(default=timezone.now)
    completed_by = user_fk(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        default_permissions = ()
        permissions = [("inventory_stock_take", "Count stock in an assigned general warehouse")]
        constraints = [
            models.UniqueConstraint(
                fields=["warehouse"],
                condition=Q(status=StockTakeStatus.DRAFT),
                name=ONE_DRAFT_STOCK_TAKE,
            ),
            models.CheckConstraint(
                condition=Q(status__in=StockTakeStatus.values),
                name="inventory_stocktake_status_valid",
            ),
        ]

    def __str__(self):
        return self.reference

class StockTakeLine(UUIDModel):
    stock_take = models.ForeignKey(StockTake, on_delete=models.PROTECT, related_name="lines")
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="+")
    counted_quantity = quantity_field()
    system_quantity_at_count = quantity_field()
    counted_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(
                fields=["stock_take", "item"], name="inventory_stocktakeline_item_unique"
            ),
            models.CheckConstraint(
                condition=Q(counted_quantity__gte=0),
                name="inventory_stocktakeline_counted_not_negative",
            ),
        ]

    def __str__(self):
        return f"{self.stock_take_id}: {self.item_id} counted {self.counted_quantity}"

class StockTakeSerial(UUIDModel):
    line = models.ForeignKey(StockTakeLine, on_delete=models.PROTECT, related_name="serials")
    serial_number = models.CharField(max_length=100)
    serial_normalized = models.CharField(max_length=100)
    unit = models.ForeignKey(
        "inventory.StockUnit", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    unit_status = models.CharField(  # noqa: DJ001 - NULL: no unit had this serial
        max_length=12, choices=StockUnitStatus.choices, null=True, blank=True
    )
    scanned_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(
                fields=["line", "serial_normalized"], name="inventory_stocktakeserial_once"
            ),
        ]

    def __str__(self):
        return f"{self.line_id}: {self.serial_number}"

class StockAdjustment(UUIDModel):
    reference = models.CharField(max_length=40, unique=True)
    warehouse = models.ForeignKey(
        "warehouses.Warehouse", on_delete=models.PROTECT, related_name="adjustments"
    )
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=24, choices=AdjustmentKind.choices)
    quantity_delta = quantity_field()
    unavailable_delta = quantity_field(default=0)
    previous_on_hand = quantity_field()
    resulting_on_hand = quantity_field()
    reason = models.TextField()
    stock_take_line = models.ForeignKey(
        StockTakeLine, null=True, blank=True, on_delete=models.PROTECT, related_name="adjustments"
    )
    client_request_id = models.UUIDField(null=True, blank=True)
    created_by = user_fk()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        permissions = [("inventory_adjust", "Adjust stock in an assigned general warehouse")]
        constraints = [
            idempotency_constraint("stockadjustment"),
            models.CheckConstraint(
                condition=~Q(reason__regex=r"^\s*$"), name="inventory_stockadjustment_has_reason"
            ),
            models.CheckConstraint(
                condition=~Q(quantity_delta=0) | ~Q(unavailable_delta=0),
                name="inventory_stockadjustment_changes_something",
            ),
            models.CheckConstraint(
                condition=Q(kind__in=AdjustmentKind.values),
                name="inventory_stockadjustment_kind_valid",
            ),
        ]

    def __str__(self):
        return self.reference


class StockUnit(UUIDModel):
    """One physical unit of a serialized general item, identified by its serial number
    for its whole life (implementation-notes §7)."""

    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="stock_units")
    serial_number = models.CharField(max_length=100)
    serial_normalized = models.CharField(max_length=100)
    status = models.CharField(max_length=12, choices=StockUnitStatus.choices)
    warehouse = models.ForeignKey(
        "warehouses.Warehouse", on_delete=models.PROTECT, related_name="stock_units"
    )
    current_issue_line = models.ForeignKey(
        IssueLine, null=True, blank=True, on_delete=models.PROTECT, related_name="units_out"
    )
    issued_to_employee = models.ForeignKey(
        "employees.Employee", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    issued_to_store = models.ForeignKey(
        "warehouses.Warehouse", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    created_by = user_fk()
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(fields=["item", "serial_normalized"], name=UNIT_SERIAL_UNIQUE),
            models.CheckConstraint(
                condition=~Q(serial_normalized=""), name="inventory_stockunit_has_serial"
            ),
            models.CheckConstraint(
                condition=Q(status__in=StockUnitStatus.values),
                name="inventory_stockunit_status_valid",
            ),
            models.CheckConstraint(
                condition=(
                    Q(status=StockUnitStatus.ISSUED, current_issue_line__isnull=False)
                    & (
                        Q(issued_to_employee__isnull=False, issued_to_store__isnull=True)
                        | Q(issued_to_employee__isnull=True, issued_to_store__isnull=False)
                    )
                )
                | (
                    ~Q(status=StockUnitStatus.ISSUED)
                    & Q(
                        current_issue_line__isnull=True,
                        issued_to_employee__isnull=True,
                        issued_to_store__isnull=True,
                    )
                ),
                name="inventory_stockunit_issued_has_one_holder",
            ),
        ]
        indexes = [
            models.Index(fields=["warehouse", "item", "status"], name="inventory_unit_stock"),
            models.Index(fields=["serial_normalized"], name="inventory_unit_serial"),
        ]

    def __str__(self):
        return f"{self.item_id}/{self.serial_number}"

class StockUnitMovement(UUIDModel):
    """One change of one unit, tied to the ledger row that counted it. Append-only: a
    database trigger rejects UPDATE and DELETE."""

    unit = models.ForeignKey(StockUnit, on_delete=models.PROTECT, related_name="movements")
    ledger_entry = models.ForeignKey(
        InventoryTransaction, on_delete=models.PROTECT, related_name="unit_movements"
    )
    line_id = models.UUIDField()
    from_status = models.CharField(
        max_length=12, choices=StockUnitStatus.choices, null=True, blank=True
    )
    to_status = models.CharField(max_length=12, choices=StockUnitStatus.choices)
    occurred_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(
                fields=["unit", "ledger_entry"], name="inventory_unitmovement_once_per_entry"
            ),
            models.CheckConstraint(
                condition=Q(to_status__in=StockUnitStatus.values),
                name="inventory_unitmovement_status_valid",
            ),
        ]
        indexes = [
            models.Index(fields=["unit", "occurred_at"], name="inventory_unitmove_unit_time"),
            models.Index(fields=["line_id"], name="inventory_unitmove_line"),
        ]

    def __str__(self):
        return f"{self.unit_id}: {self.from_status} -> {self.to_status}"
