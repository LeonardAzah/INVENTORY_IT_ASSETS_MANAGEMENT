from djoser import serializers as djoser_serializers
from rest_framework import serializers

from core.api.serializers import RefSerializer, StrictSerializer, id_field

from . import policy
from .choices import PROFILE_ROLE_CHOICES, ResponsibilityCode, Role
from .models import UserJurisdiction

class EmployeeSummary(serializers.Serializer):
    id = serializers.UUIDField()
    matricule = serializers.CharField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    region = RefSerializer()
    office = RefSerializer()
    department = RefSerializer()

class JurisdictionOutput(serializers.ModelSerializer):
    region = RefSerializer()
    office = RefSerializer(allow_null=True)
    department = RefSerializer(allow_null=True)

    class Meta:
        model = UserJurisdiction
        fields = ["id", "region", "office", "department", "granted_at", "ended_at"]

class JurisdictionInput(StrictSerializer):
    region_id = id_field("organization.Region", "region", required=False)
    office_id = id_field("organization.Office", "office", required=False)
    department_id = id_field("organization.Department", "department", required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Give a region_id, an office_id or a department_id.")
        return attrs

class AccountOutput(serializers.Serializer):
    """An account in a list."""
    id = serializers.UUIDField()
    email = serializers.EmailField()
    role = serializers.CharField(source="profile.role")
    role_region = RefSerializer(source="profile.role_region", allow_null=True)
    is_computing_chief = serializers.BooleanField(source="profile.is_computing_chief")
    status = serializers.CharField(source="profile.status")
    employee = EmployeeSummary(source="profile.employee")
    created_at = serializers.DateTimeField(source="profile.created_at")

class AccountDetailOutput(AccountOutput):
    responsibilities = serializers.SerializerMethodField()
    jurisdictions = serializers.SerializerMethodField()

    def get_responsibilities(self, user):
        active = user.responsibilities.filter(ended_at__isnull=True).select_related("region")
        return [
            {
                "code": row.responsibility_id,
                "region": RefSerializer(row.region).data if row.region else None,
                "granted_at": serializers.DateTimeField().to_representation(row.granted_at),
            }
            for row in active.order_by("granted_at")
        ]

    def get_jurisdictions(self, user):
        active = (
            user.jurisdictions.filter(ended_at__isnull=True)
            .select_related("region", "office", "department")
            .order_by("granted_at")
        )
        return JurisdictionOutput(active, many=True).data

class ProvisionInput(StrictSerializer):
    employee_id = serializers.UUIDField()
    email = serializers.EmailField(max_length=254)
    role = serializers.ChoiceField(choices=PROFILE_ROLE_CHOICES, required=False)
    jurisdiction = JurisdictionInput(required=False)

class RoleInput(StrictSerializer):
    role = serializers.ChoiceField(choices=PROFILE_ROLE_CHOICES)
    jurisdiction = JurisdictionInput(required=False)
    reason = serializers.CharField(max_length=255)

class ReasonInput(StrictSerializer):
    reason = serializers.CharField(max_length=255)

class ResponsibilityInput(StrictSerializer):
    code = serializers.ChoiceField(choices=ResponsibilityCode.choices)
    region_id = id_field("organization.Region", "region", required=False)
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate(self, attrs):
        has_region = attrs.get("region") is not None
        if attrs["code"] == ResponsibilityCode.IT_ASSET_MANAGER and not has_region:
            raise serializers.ValidationError({"region_id": ["This field is required."]})
        if attrs["code"] == ResponsibilityCode.STORE_KEEPER and has_region:
            raise serializers.ValidationError(
                {"region_id": ["A Store Keeper is not appointed to a region."]}
            )
        return attrs

class ActivateInput(StrictSerializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(trim_whitespace=False)
    re_new_password = serializers.CharField(trim_whitespace=False)

    def validate(self, attrs):
        if attrs["new_password"] != attrs.pop("re_new_password"):
            raise serializers.ValidationError(
                {"re_new_password": ["The two password fields didn't match."]}
            )
        return attrs

class CurrentUserSerializer(AccountDetailOutput):
    role = serializers.SerializerMethodField()
    role_region = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    employee = serializers.SerializerMethodField()
    created_at = None
    name = serializers.SerializerMethodField()
    is_superuser = serializers.BooleanField()
    is_computing_chief = serializers.SerializerMethodField()
    it_regions = serializers.SerializerMethodField()
    represented_regions = serializers.SerializerMethodField()
    warehouse_ids = serializers.SerializerMethodField()
    read_only = serializers.SerializerMethodField()
    permission_codes = serializers.SerializerMethodField()

    def _profile(self, user):
        return getattr(user, "profile", None)

    def _auth(self, user):
        if getattr(self, "_auth_context", None) is None:
            self._auth_context = policy.context_for(user)
        return self._auth_context

    def get_role(self, user):
        profile = self._profile(user)
        if profile is not None:
            return profile.role
        return Role.SUPER_ADMIN.value if user.is_superuser else None

    def get_role_region(self, user):
        profile = self._profile(user)
        if profile is None or profile.role_region is None:
            return None
        return RefSerializer(profile.role_region).data

    def get_status(self, user):
        profile = self._profile(user)
        return profile.status if profile else None

    def get_employee(self, user):
        profile = self._profile(user)
        return EmployeeSummary(profile.employee).data if profile else None

    def get_name(self, user):
        profile = self._profile(user)
        if profile is None:
            return user.email
        return f"{profile.employee.first_name} {profile.employee.last_name}"

    def get_is_computing_chief(self, user):
        profile = self._profile(user)
        return bool(profile and profile.is_computing_chief)

    def get_it_regions(self, user):
        return sorted(str(region_id) for region_id in self._auth(user).it_regions)

    def get_represented_regions(self, user):
        return sorted(str(region_id) for region_id in self._auth(user).represented_regions)

    def get_read_only(self, user):
        return self._auth(user).read_only

    def get_warehouse_ids(self, user):
        return sorted(str(warehouse_id) for warehouse_id in self._auth(user).warehouse_ids)

    def get_permission_codes(self, user):
        return sorted(code.name for code in self._auth(user).codes)

class PasswordResetRequestSerializer(djoser_serializers.SendEmailResetSerializer):
    """Djoser looks the address up exactly as typed; emails are stored lower-case."""
    def validate_email(self, value):
        return value.strip().lower()

class AccountUpdateInput(StrictSerializer):
    email = serializers.EmailField(max_length=254)
    employee_id = id_field("employees.Employee", "employee")
