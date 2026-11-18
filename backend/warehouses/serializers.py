from rest_framework import serializers

from core.api.serializers import RefSerializer, StrictSerializer, id_field
from organization.models import Department, Office

from .choices import WarehouseType
from .models import Warehouse, WarehouseAssignment

WAREHOUSE_CODE = r"^[A-Za-z0-9]{2,12}$"
WAREHOUSE_CODE_ERROR = {"invalid": "Use 2 to 12 letters or digits."}

class PersonRef(serializers.Serializer):
    """A user account as shown inside another resource."""
    account_id = serializers.UUIDField(source="pk")
    email = serializers.EmailField()
    name = serializers.SerializerMethodField()
    matricule = serializers.SerializerMethodField()

    def _employee(self, user):
        profile = getattr(user, "profile", None)
        return profile.employee if profile is not None else None

    def get_name(self, user):
        employee = self._employee(user)
        return f"{employee.first_name} {employee.last_name}" if employee else user.email

    def get_matricule(self, user):
        employee = self._employee(user)
        return employee.matricule if employee else None

class WarehouseOutput(serializers.ModelSerializer):
    region = RefSerializer()
    office = RefSerializer()
    department = RefSerializer(allow_null=True)
    store_keeper = serializers.SerializerMethodField()

    class Meta:
        model = Warehouse
        fields = [
            "id",
            "code",
            "name",
            "type",
            "region",
            "office",
            "department",
            "is_active",
            "is_regional_store",
            "store_keeper",
            "created_at",
        ]

    def get_store_keeper(self, warehouse):
        active = getattr(warehouse, "active_assignments", None)
        if active is None:
            active = list(
                warehouse.assignments.filter(ended_at__isnull=True).select_related(
                    "user__profile__employee"
                )
            )
        if not active:
            return None
        return {**PersonRef(active[0].user).data, "assigned_at": active[0].assigned_at}

class WarehouseCreateInput(StrictSerializer):
    code = serializers.RegexField(WAREHOUSE_CODE, error_messages=WAREHOUSE_CODE_ERROR)
    name = serializers.CharField(max_length=150)
    type = serializers.ChoiceField(choices=WarehouseType.choices)
    office_id = id_field(Office, "office")
    department_id = id_field(Department, "department", required=False, allow_null=True)
    is_regional_store = serializers.BooleanField(required=False)

class WarehouseUpdateInput(StrictSerializer):
    name = serializers.CharField(max_length=150)
    is_active = serializers.BooleanField()
    is_regional_store = serializers.BooleanField()

class AssignmentOutput(serializers.ModelSerializer):
    user = PersonRef()
    assigned_by = PersonRef()
    ended_by = PersonRef(allow_null=True)

    class Meta:
        model = WarehouseAssignment
        fields = ["id", "user", "assigned_by", "assigned_at", "ended_by", "ended_at", "end_reason"]

class StoreKeeperInput(StrictSerializer):
    user_id = serializers.UUIDField()
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)

class ReasonInput(StrictSerializer):
    reason = serializers.CharField(max_length=255)

class ITStaffOutput(serializers.Serializer):
    computing_chief = PersonRef(allow_null=True)
    it_asset_manager = PersonRef(allow_null=True)
    it_warehouse = RefSerializer(allow_null=True)
    regional_representative = PersonRef(allow_null=True)
    vacancies = serializers.ListField(child=serializers.CharField())
