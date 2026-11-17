from rest_framework import serializers

from core.api.serializers import RefSerializer, StrictSerializer, id_field
from organization.models import Department, Location

from .models import Employee

MATRICULE = r"^[A-Za-z0-9][A-Za-z0-9/_.-]{0,31}$"
MATRICULE_ERROR = {"invalid": "Use up to 32 letters, digits, '/', '-', '_' or '.'."}
TELEPHONE = r"^\+?[0-9][0-9 ().-]{5,30}$"
TELEPHONE_ERROR = {"invalid": "Enter a valid telephone number."}

class LocationRef(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()

class EmployeeOutput(serializers.ModelSerializer):
    region = RefSerializer()
    office = RefSerializer()
    department = RefSerializer()
    work_location = LocationRef(allow_null=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            "matricule",
            "first_name",
            "last_name",
            "email",
            "telephone",
            "region",
            "office",
            "department",
            "work_location",
            "is_active",
        ]

class EmployeeInput(StrictSerializer):
    """Create input. For PATCH the base view passes `partial=True`."""
    matricule = serializers.RegexField(MATRICULE, error_messages=MATRICULE_ERROR)
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    email = serializers.EmailField(max_length=254, required=False, allow_null=True)
    telephone = serializers.RegexField(TELEPHONE, max_length=32, error_messages=TELEPHONE_ERROR)
    department_id = id_field(Department, "department")
    work_location_id = id_field(Location, "work_location", required=False, allow_null=True)

class ReasonInput(StrictSerializer):
    reason = serializers.CharField(max_length=255)
