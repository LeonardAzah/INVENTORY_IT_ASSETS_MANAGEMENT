from audit import services as audit
from core.exceptions import DomainError

from ..choices import ResponsibilityCode, Role
from ..models import UserJurisdiction, UserProfile, UserResponsibility
from . import groups

COMPUTING_DEPARTMENT_KIND = "REGIONAL_IT"

def computing_region_id(user):
    regions = set(
        UserJurisdiction.objects.filter(
            user=user, ended_at__isnull=True, department__kind=COMPUTING_DEPARTMENT_KIND
        ).values_list("region_id", flat=True)
    )
    if len(regions) > 1:
        raise DomainError(
            "ONE_COMPUTING_DEPARTMENT",
            "A person can head the computing department of one region only.",
            status_code=400,
        )
    return next(iter(regions), None)

def sync_computing_chief(actor, user):
    profile = UserProfile.objects.select_for_update().get(user=user)
    if profile.role != Role.CHIEF_OF_SERVICE:
        return
    region_id = computing_region_id(user)
    if region_id == profile.role_region_id:
        return
    if (
        region_id is not None
        and UserResponsibility.objects.filter(
            user=user, responsibility=ResponsibilityCode.IT_ASSET_MANAGER, ended_at__isnull=True
        ).exists()
    ):
        raise DomainError(
            "COMPUTING_CHIEF_CANNOT_BE_IT_ASSET_MANAGER",
            "End this person's IT Asset Manager appointment before giving them the "
            "computing department.",
        )
    before = {"role_region": profile.role_region_id}
    profile.role_region_id = region_id
    profile.save(update_fields=["role_region"])
    groups.sync(user)
    audit.record(
        actor,
        "accounts.user.computing_chief_changed",
        user,
        before=before,
        after={"role_region": region_id},
    )
