from django.contrib.auth import get_user_model
from django.db.models import Exists, OuterRef

from . import policy
from .choices import ProfileStatus, ResponsibilityCode, Role
from .models import UserJurisdiction, UserResponsibility
from .policy import Code

def application_accounts():
    """Every account that has a profile, unscoped. Views use `users_for`; this is for
    rendering an account a service has already authorized."""
    return (
        get_user_model()
        .objects.filter(profile__isnull=False)
        .select_related(
            "profile__role_region",
            "profile__employee__region",
            "profile__employee__office",
            "profile__employee__department",
        )
    )

def users_for(user):
    queryset = application_accounts()
    context = policy.context_for(user)
    if not ({Code.USER_MANAGE, Code.USER_VIEW} & context.codes):
        return queryset.none()
    if context.sees_organization:
        return queryset
    return queryset.filter(policy.jurisdiction_q(context, "profile__employee__"))

def it_asset_manager_candidates_for(user):
    """The accounts `user` could appoint as IT Asset Manager: for a Chief of Service of
    Computing, those of their region; for an administrator, of any region.
    """
    appointed = UserResponsibility.objects.filter(
        user=OuterRef("pk"),
        responsibility=ResponsibilityCode.IT_ASSET_MANAGER,
        ended_at__isnull=True,
    )
    queryset = (
        application_accounts()
        .filter(
            ~Exists(appointed),
            profile__status__in=[ProfileStatus.ACTIVE, ProfileStatus.INVITED],
        )
        .exclude(profile__role=Role.CHIEF_OF_SERVICE, profile__role_region__isnull=False)
    )
    context = policy.context_for(user)
    if Code.IT_ASSET_MANAGER_APPOINT not in context.codes:
        return queryset.none()
    if context.administers_organization:
        return queryset  # an Administrator may appoint in any region
    return queryset.filter(profile__employee__region_id__in=context.it_regions)

def jurisdictions_of(account):
    return UserJurisdiction.objects.filter(user=account).select_related(
        "region", "office", "department"
    )
