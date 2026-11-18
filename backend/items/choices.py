from django.db import models

class Tracking(models.TextChoices):
    QUANTITY = "QUANTITY", "Quantity"
    SERIALIZED = "SERIALIZED", "Serialized"

class AssetClass(models.TextChoices):
    COMPUTER = "COMPUTER", "Computer"
    PRINTER = "PRINTER", "Printer"
    MONITOR = "MONITOR", "Monitor"
    UPS = "UPS", "UPS"
    KEYBOARD = "KEYBOARD", "Keyboard"
    MOUSE = "MOUSE", "Mouse"
    OTHER = "OTHER", "Other"

class SpecDataType(models.TextChoices):
    TEXT = "TEXT", "Text"
    INTEGER = "INTEGER", "Whole number"
    DECIMAL = "DECIMAL", "Decimal number"
    BOOLEAN = "BOOLEAN", "Yes / no"
    CHOICE = "CHOICE", "One of a list"
    MULTI_CHOICE = "MULTI_CHOICE", "Several of a list"
    MEASURE = "MEASURE", "Measure"
