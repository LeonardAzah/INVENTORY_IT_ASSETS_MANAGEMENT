from rest_framework import serializers

from core.api.serializers import RefSerializer, StrictSerializer, id_field

from .choices import DepartmentKind, OfficeKind
from .models import Department, Location, Office, Region

REGION_CODE = r"^[A-Za-z0-9]{2,8}$"
CODE = r"^[A-Za-z0-9_-]{2,16}$"
REGION_CODE_ERROR = {"invalid": "Use 2 to 8 letters or digits."}
CODE_ERROR = {"invalid": "Use 2 to 16 letters, digits, hyphens or underscores."}

def code_field(**kwargs):
    return serializers.RegexField(CODE, error_messages=CODE_ERROR, **kwargs)

class RegionOutput(serializers.ModelSerializer):
    class Meta:
        model = Region
        fields = ["id", "code", "name", "is_active"]

class RegionCreateInput(StrictSerializer):
    code = serializers.RegexField(REGION_CODE, error_messages=REGION_CODE_ERROR)
    name = serializers.CharField(max_length=100)

class RegionUpdateInput(StrictSerializer):
    name = serializers.CharField(max_length=100)
    is_active = serializers.BooleanField()

class OfficeOutput(serializers.ModelSerializer):
    region = RefSerializer()
    parent = RefSerializer(allow_null=True)

    class Meta:
        model = Office
        fields = ["id", "code", "name", "town", "kind", "region", "parent", "is_active"]

class OfficeCreateInput(StrictSerializer):
    region_id = id_field(Region, "region")
    parent_id = id_field(Office, "parent", required=False, allow_null=True)
    kind = serializers.ChoiceField(choices=OfficeKind.choices)
    code = code_field()
    name = serializers.CharField(max_length=150)
    town = serializers.CharField(max_length=100)

class OfficeUpdateInput(StrictSerializer):
    parent_id = id_field(Office, "parent", allow_null=True)
    code = code_field()
    name = serializers.CharField(max_length=150)
    town = serializers.CharField(max_length=100)
    is_active = serializers.BooleanField()

class DepartmentOutput(serializers.ModelSerializer):
    region = RefSerializer()
    office = RefSerializer()

    class Meta:
        model = Department
        fields = ["id", "code", "name", "kind", "office", "region", "is_active"]

class DepartmentCreateInput(StrictSerializer):
    office_id = id_field(Office, "office")
    kind = serializers.ChoiceField(choices=DepartmentKind.choices)
    code = code_field()
    name = serializers.CharField(max_length=150)

class DepartmentUpdateInput(StrictSerializer):
    code = code_field()
    name = serializers.CharField(max_length=150)
    is_active = serializers.BooleanField()

class LocationOutput(serializers.ModelSerializer):
    region = RefSerializer()
    office = RefSerializer()
    department = RefSerializer(allow_null=True)

    class Meta:
        model = Location
        fields = ["id", "name", "office", "region", "department", "is_default", "is_active"]

class LocationCreateInput(StrictSerializer):
    office_id = id_field(Office, "office")
    department_id = id_field(Department, "department", required=False, allow_null=True)
    name = serializers.CharField(max_length=150)

class LocationUpdateInput(StrictSerializer):
    department_id = id_field(Department, "department", allow_null=True)
    name = serializers.CharField(max_length=150)
    is_default = serializers.BooleanField()
    is_active = serializers.BooleanField()
