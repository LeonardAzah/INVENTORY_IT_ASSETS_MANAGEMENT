from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from core.models import UUIDModel

MATRICULE_UNIQUE = "employees_employee_matricule_unique"
EMAIL_UNIQUE = "employees_employee_email_ci_unique"

class Employee(UUIDModel):
    """A person in the staff register. Separate from application users."""
    matricule = models.CharField(max_length=32)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(max_length=254, null=True, blank=True)
    telephone = models.CharField(max_length=32)
    region = models.ForeignKey("organization.Region", on_delete=models.PROTECT, related_name="+")
    office = models.ForeignKey("organization.Office", on_delete=models.PROTECT, related_name="+")
    department = models.ForeignKey(
        "organization.Department", on_delete=models.PROTECT, related_name="+"
    )
    work_location = models.ForeignKey(
        "organization.Location", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    is_active = models.BooleanField(default=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        default_permissions = ()
        permissions = [("employee_manage", "Manage the employee register")]
        constraints = [
            models.UniqueConstraint(fields=["matricule"], name=MATRICULE_UNIQUE),
            models.UniqueConstraint(
                Lower("email"), condition=Q(email__isnull=False), name=EMAIL_UNIQUE
            ),
        ]
        indexes = [
            models.Index(fields=["region", "is_active"], name="employees_employee_region"),
        ]

    def __str__(self):
        return f"{self.matricule} {self.first_name} {self.last_name}"
