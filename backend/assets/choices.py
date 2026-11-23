from django.db import models

class AssetStatus(models.TextChoices):
    UNKNOWN = "UNKNOWN", "Unknown (to be verified)"
    AVAILABLE = "AVAILABLE", "Available"
    ASSIGNED = "ASSIGNED", "Assigned"
    RETURNED = "RETURNED", "Returned (to be inspected)"
    MAINTENANCE = "MAINTENANCE", "Under maintenance"
    DAMAGED = "DAMAGED", "Damaged"
    LOST = "LOST", "Lost"
    RETIRED = "RETIRED", "Retired"

class AssetSource(models.TextChoices):
    RECEIPT = "RECEIPT", "IT warehouse receipt"
    ALTERNATIVE_ACQUISITION = "ALTERNATIVE_ACQUISITION", "Alternative acquisition"
    DISCOVERED = "DISCOVERED", "Discovered"

class AssigneeType(models.TextChoices):
    EMPLOYEE = "EMPLOYEE", "Employee"
    DEPARTMENT = "DEPARTMENT", "Department"
    LOCATION = "LOCATION", "Location"

class RelationshipKind(models.TextChoices):
    PERIPHERAL_OF = "PERIPHERAL_OF", "Peripheral of"
    SHARED_PRINTER_FOR = "SHARED_PRINTER_FOR", "Shared printer for"

class EventType(models.TextChoices):
    REGISTERED = "REGISTERED", "Registered"
    STATUS_CHANGED = "STATUS_CHANGED", "Status changed"
    SPEC_CHANGED = "SPEC_CHANGED", "Details changed"
    RELOCATED = "RELOCATED", "Relocated"
    ASSIGNED = "ASSIGNED", "Assigned"
    RETURNED = "RETURNED", "Returned"
    FOUND = "FOUND", "Found"
