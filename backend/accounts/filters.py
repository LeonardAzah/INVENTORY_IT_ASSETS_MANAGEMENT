import django_filters
from django.contrib.auth import get_user_model

from core.api.filters import StrictBooleanFilter, StrictFilterSet

from .choices import ProfileStatus, ResponsibilityCode, Role
from .models import UserJurisdiction

class AccountFilter(StrictFilterSet):
    role = django_filters.ChoiceFilter(field_name="profile__role", choices=Role.choices)
    status = django_filters.ChoiceFilter(
        field_name="profile__status", choices=ProfileStatus.choices
    )
    region = django_filters.UUIDFilter(field_name="profile__employee__region_id")
    responsibility = django_filters.ChoiceFilter(
        choices=ResponsibilityCode.choices, method="filter_responsibility"
    )

    class Meta:
        model = get_user_model()
        fields = ["role", "status", "region", "responsibility"]

    def filter_responsibility(self, queryset, name, value):
        return queryset.filter(
            responsibilities__responsibility=value, responsibilities__ended_at__isnull=True
        )

class CandidateFilter(StrictFilterSet):
    region = django_filters.UUIDFilter(field_name="profile__employee__region_id", required=True)

    class Meta:
        model = get_user_model()
        fields = ["region"]

class JurisdictionFilter(StrictFilterSet):
    active = StrictBooleanFilter(field_name="ended_at", method="filter_active")

    class Meta:
        model = UserJurisdiction
        fields = ["active"]

    def filter_active(self, queryset, name, value):
        return queryset.filter(ended_at__isnull=value)