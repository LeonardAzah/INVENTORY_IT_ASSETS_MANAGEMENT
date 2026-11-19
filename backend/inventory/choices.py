from django.db import models

class TransactionType(models.TextChoices):
    RECEIPT = "RECEIPT", "Receipt"
    ISSUE = "ISSUE", "Issue"
    RETURN = "RETURN", "Return"
    ADJUSTMENT = "ADJUSTMENT", "Adjustment"
    OPENING_BALANCE = "OPENING_BALANCE", "Opening balance"
    ASSET_OUT = "ASSET_OUT", "Asset left the warehouse"
    ASSET_IN = "ASSET_IN", "Asset entered the warehouse"
    ASSET_WRITE_OFF = "ASSET_WRITE_OFF", "Asset written off"

class ReturnCondition(models.TextChoices):
    GOOD = "GOOD", "Good"
    DAMAGED = "DAMAGED", "Damaged"

class StockTakeStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"

class AdjustmentKind(models.TextChoices):
    QUANTITY = "QUANTITY", "Quantity correction"
    WRITE_OFF_UNAVAILABLE = "WRITE_OFF_UNAVAILABLE", "Write off unavailable stock"
    RESTORE_UNAVAILABLE = "RESTORE_UNAVAILABLE", "Restore unavailable stock"
    OPENING_BALANCE = "OPENING_BALANCE", "Opening balance"

class StockUnitStatus(models.TextChoices):
    """Where one unit of a serialized general item stands. IN_STOCK and UNAVAILABLE units
    are on hand in their warehouse; UNAVAILABLE ones (damaged returns) cannot be issued."""
    IN_STOCK = "IN_STOCK", "In stock"
    UNAVAILABLE = "UNAVAILABLE", "Unavailable"
    ISSUED = "ISSUED", "Issued"
    WRITTEN_OFF = "WRITTEN_OFF", "Written off"
