from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from core.models import UUIDModel

from .choices import DepartmentKind, OfficeKind

REGION_CODE_UNIQUE = "organization_region_code_unique"
REGION_NAME_UNIQUE = "organization_region_name_ci_unique"
OFFICE_CODE_UNIQUE = "organization_office_code_unique"
DEPARTMENT_CODE_UNIQUE = "organization_department_code_unique"
DEPARTMENT_ONE_REGIONAL_IT = "organization_department_one_regional_it"
LOCATION_NAME_UNIQUE = "organization_location_office_name_ci_unique"
LOCATION_ONE_DEFAULT = "organization_location_one_default"

class Region(UUIDModel):
    code = models.CharField(max_length=8)
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        default_permissions = ()
        permissions = [("org_structure_manage", "Manage regions, offices and departments")]
        constraints = [
            models.UniqueConstraint(fields=["code"], name=REGION_CODE_UNIQUE),
            models.UniqueConstraint(Lower("name"), name=REGION_NAME_UNIQUE),
        ]
    def __str__(self):
        return f"{self.code} {self.name}"

class Office(UUIDModel):
    """A regional office or a commercial center"""
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="offices")
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="children"
    )
    kind = models.CharField(max_length=20, choices=OfficeKind.choices)
    code = models.CharField(max_length=16)
    name = models.CharField(max_length=150)
    town = models.CharField(max_length=100)
    path = models.CharField(max_length=255, editable=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(fields=["code"], name=OFFICE_CODE_UNIQUE),
            models.CheckConstraint(
                condition=Q(kind__in=OfficeKind.values), name="organization_office_kind_valid"
            ),
        ]
        indexes = [
            models.Index(
                fields=["path"],
                name="organization_office_path_like",
                opclasses=["varchar_pattern_ops"],
            ),
        ]

    def __str__(self):
        return f"{self.code} {self.name}"


class Department(UUIDModel):
    office = models.ForeignKey(Office, on_delete=models.PROTECT, related_name="departments")
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="departments")
    kind = models.CharField(max_length=20, choices=DepartmentKind.choices)
    code = models.CharField(max_length=16)
    name = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(fields=["code"], name=DEPARTMENT_CODE_UNIQUE),
            models.UniqueConstraint(
                fields=["region"],
                condition=Q(kind=DepartmentKind.REGIONAL_IT, is_active=True),
                name=DEPARTMENT_ONE_REGIONAL_IT,
            ),
            models.CheckConstraint(
                condition=Q(kind__in=DepartmentKind.values),
                name="organization_department_kind_valid",
            ),
        ]

    def __str__(self):
        return f"{self.code} {self.name}"

class Location(UUIDModel):
    """An approved physical place."""
    office = models.ForeignKey(Office, on_delete=models.PROTECT, related_name="locations")
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="locations")
    department = models.ForeignKey(
        Department, null=True, blank=True, on_delete=models.PROTECT, related_name="locations"
    )
    name = models.CharField(max_length=150)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        default_permissions = ()
        permissions = [("location_manage", "Manage approved locations")]
        constraints = [
            models.UniqueConstraint("office", Lower("name"), name=LOCATION_NAME_UNIQUE),
            models.UniqueConstraint(
                fields=["office"], condition=Q(is_default=True), name=LOCATION_ONE_DEFAULT
            ),
        ]
        indexes = [
            models.Index(fields=["region", "is_active"], name="organization_location_region"),
        ]

    def __str__(self):
        return self.name