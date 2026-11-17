from django.db import models

class OfficeKind(models.TextChoices):
    REGIONAL_OFFICE = "REGIONAL_OFFICE", "Regional office"
    COMMERCIAL_CENTER = "COMMERCIAL_CENTER", "Commercial center"

class DepartmentKind(models.TextChoices):
    DEPARTMENT = "DEPARTMENT", "Department"
    REGIONAL_IT = "REGIONAL_IT", "Regional IT department"
    CENTER_UNIT = "CENTER_UNIT", "Commercial center unit"
