from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from audit import services as audit
from core.exceptions import DomainError

from .. import policy
from ..choices import ProfileStatus
from ..models import AccountInvitation, UserJurisdiction, UserProfile, UserResponsibility
from ..policy import Code
from . import groups, posts, roles

def require_manageable(actor, user):
    """The actor may act on this account: it is in their scope (else 404), and its role
    is one they could grant (else 403). So a Manager manages only EMPLOYEE-role accounts
    inside their jurisdiction"""
    policy.require(actor, Code.USER_MANAGE, user)
    roles.require_grantable(actor, user.profile.role)


def blacklist_refresh_tokens(user):
    """Logs the user out everywhere: none of their refresh tokens works any more."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


@transaction.atomic
def deactivate(actor, user, *, reason):
    """Ends the account's access: responsibilities, jurisdictions, warehouse assignments,
    the live invitation and every session. History is kept."""
    if user.pk == actor.pk:
        raise DomainError("CANNOT_DEACTIVATE_SELF", "You cannot deactivate your own account.")
    require_manageable(actor, user)
    profile = UserProfile.objects.select_for_update().get(user=user)
    if profile.status == ProfileStatus.DEACTIVATED:
        raise DomainError("ALREADY_DEACTIVATED", "This account is already deactivated.")
    previous_status = profile.status
    now = timezone.now()

    ended = {
        "responsibilities": UserResponsibility.objects.filter(
            user=user, ended_at__isnull=True
        ).update(ended_at=now, ended_by=actor, end_reason="Account deactivated"),
        "jurisdictions": UserJurisdiction.objects.filter(user=user, ended_at__isnull=True).update(
            ended_at=now, ended_by=actor
        ),
    }
    ended["warehouse_assignments"] = (
        apps.get_model("warehouses", "WarehouseAssignment")
        .objects.filter(user=user, ended_at__isnull=True)
        .update(ended_at=now, ended_by=actor, end_reason="Account deactivated")
    )
    AccountInvitation.objects.filter(
        user=user, used_at__isnull=True, revoked_at__isnull=True
    ).update(revoked_at=now, revoked_by=actor)

    profile.status = ProfileStatus.DEACTIVATED
    profile.deactivated_at = now
    profile.deactivated_by = actor
    profile.save(update_fields=["status", "deactivated_at", "deactivated_by"])
    posts.sync_computing_chief(actor, user)
    user.is_active = False
    user.save(update_fields=["is_active"])
    blacklist_refresh_tokens(user)
    groups.sync(user)
    audit.record(
        actor,
        "accounts.user.deactivated",
        user,
        before={"status": previous_status},
        after={"status": profile.status, "reason": reason, "ended": ended},
    )
    return user

@transaction.atomic
def reactivate(actor, user, *, reason):
    """Restores access only. Responsibilities and jurisdictions that ended with the
    deactivation are not brought back; they must be granted again."""
    from . import invitations

    require_manageable(actor, user)
    profile = UserProfile.objects.select_for_update().select_related("employee").get(user=user)
    if profile.status != ProfileStatus.DEACTIVATED:
        raise DomainError("NOT_DEACTIVATED", "This account is not deactivated.")
    if not profile.employee.is_active:
        raise DomainError(
            "EMPLOYEE_INACTIVE", "The account of an inactive employee cannot be reactivated."
        )

    # Someone who never activated has no password yet: they are invited again.
    activated_before = user.has_usable_password()
    profile.status = ProfileStatus.ACTIVE if activated_before else ProfileStatus.INVITED
    profile.deactivated_at = None
    profile.deactivated_by = None
    profile.save(update_fields=["status", "deactivated_at", "deactivated_by"])
    user.is_active = activated_before
    user.save(update_fields=["is_active"])
    if not activated_before:
        invitations.issue(actor, user)
    audit.record(
        actor,
        "accounts.user.reactivated",
        user,
        before={"status": ProfileStatus.DEACTIVATED},
        after={"status": profile.status, "reason": reason},
    )
    return user

@transaction.atomic
def update_account(actor, user, **changes):
    """Changes the login email or the employee an account belongs to. For Administrators
    only. An account that is still INVITED gets a new invitation at a new email."""
    from . import invitations

    policy.require(actor, Code.USER_MANAGE, user)
    if not policy.context_for(actor).administers_organization:
        raise PermissionDenied
    profile = (
        UserProfile.objects.select_for_update(of=("self",))
        .select_related("employee")
        .get(user=user)
    )
    user_model = get_user_model()
    before = {"email": user.email, "employee": profile.employee_id}
    email = user_model.objects.normalize_email(changes.get("email", user.email))
    employee = changes.get("employee", profile.employee)

    if employee.pk != profile.employee_id:
        if not employee.is_active:
            raise DomainError(
                "EMPLOYEE_INACTIVE", "An inactive employee cannot be given an account."
            )
        if UserProfile.objects.filter(employee=employee).exists():
            raise DomainError(
                "EMPLOYEE_HAS_ACCOUNT", f"Employee {employee.matricule} already has an account."
            )
    if employee.email and employee.email.lower() != email:
        raise DomainError(
            "EMAIL_MISMATCH",
            "The login email must be the email on the employee's record.",
            status_code=400,
        )
    after = {"email": email, "employee": employee.pk}
    if after == before:
        return user

    user.email = email
    user.save(update_fields=["email"])
    profile.employee = employee
    profile.save(update_fields=["employee"])
    if email != before["email"] and profile.status == ProfileStatus.INVITED:
        invitations.issue(actor, user)
    audit.record(actor, "accounts.user.updated", user, before=before, after=after)
    return user_model.objects.get(pk=user.pk)
