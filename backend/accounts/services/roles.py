from django.core.exceptions import PermissionDenied
from django.db import transaction

from audit import services as audit
from core.exceptions import DomainError

from .. import policy
from ..choices import ProfileStatus, Role
from ..models import UserProfile, UserResponsibility
from ..policy import Code

AUDITED = ("role", "role_region")

_GRANTED_BY = {
    Code.ROLE_GRANT_PRIVILEGED: (Role.ADMIN, Role.VIEWER),
    Code.ROLE_GRANT_REGIONAL: (Role.REGIONAL_REPRESENTATIVE,),
    Code.ROLE_GRANT: (Role.MANAGER, Role.CHIEF_OF_SERVICE, Role.EMPLOYEE),
}

def grantable_roles(actor):
    """The roles the actor may give: the union of what each held grant code allows."""
    codes = policy.codes_for(actor)
    roles = set()
    for code, granted in _GRANTED_BY.items():
        if code in codes:
            roles.update(role.value for role in granted)
    return frozenset(roles)

def require_grantable(actor, role):
    if role not in grantable_roles(actor):
        raise PermissionDenied

def region_for(role, scope):
    """The `role_region` a role starts with: a Regional Representative's is the region of
    their jurisdiction; a Chief of Service gets theirs from the computing department
    jurisdiction (`posts.sync_computing_chief`); no other role has one."""
    if role == Role.REGIONAL_REPRESENTATIVE:
        region, _, _ = scope
        return region.pk
    return None

def require_may_hold_responsibility(profile):
    """Refuses a responsibility to a Viewer, who is strictly read-only [REQ 1.6]. Called
    wherever a responsibility is given: IT Asset Manager appointment, Store Keeper
    assignment."""
    if profile.role == Role.VIEWER:
        raise DomainError(
            "VIEWER_CANNOT_HOLD_RESPONSIBILITY",
            "A Viewer is read-only and cannot hold a responsibility.",
        )

def require_no_responsibility_for_viewer(user, role):
    """A Viewer is strictly read-only and holds no responsibility [REQ 1.6]."""
    if role != Role.VIEWER:
        return
    if UserResponsibility.objects.filter(user=user, ended_at__isnull=True).exists():
        raise DomainError(
            "VIEWER_CANNOT_HOLD_RESPONSIBILITY",
            "A Viewer holds no responsibility: end this person's responsibilities first.",
        )

@transaction.atomic
def set_role(actor, user, *, role, reason, jurisdiction=None):
    """Changes an account's role. `jurisdiction` ({region, office, department}) is the one
    the new role requires (role_scope); it replaces the account's jurisdictions."""
    from . import groups, management, posts, role_scope

    # First: nobody changes their own role, whatever they may grant. Checked before the
    # grant rules so the answer says why; the account is the caller's own, so this
    # reveals nothing.
    if user.pk == actor.pk:
        raise DomainError("CANNOT_CHANGE_OWN_ROLE", "You cannot change your own role.")
    management.require_manageable(actor, user)  # scope, and the role the account has now
    require_grantable(actor, role)  # the role it would get

    profile = UserProfile.objects.select_for_update().select_related("employee").get(user=user)
    if profile.status == ProfileStatus.DEACTIVATED:
        raise DomainError(
            "ACCOUNT_DEACTIVATED", "The role of a deactivated account cannot be changed."
        )
    scope = role_scope.resolve(actor, role, jurisdiction)
    require_no_responsibility_for_viewer(user, role)

    before = audit.snapshot(profile, AUDITED)
    profile.role = role
    profile.role_region_id = region_for(role, scope)
    unchanged = audit.snapshot(profile, AUDITED) == before
    if unchanged and role_scope.current(user) == role_scope.as_ids(scope):
        return user
    profile.save(update_fields=["role", "role_region"])
    role_scope.replace(actor, user, scope)
    posts.sync_computing_chief(actor, user)
    groups.sync(user)
    profile.refresh_from_db(fields=["role", "role_region"])
    audit.record(
        actor,
        "accounts.user.role_changed",
        user,
        before=before,
        after={**audit.snapshot(profile, AUDITED), "reason": reason},
    )
    return user
