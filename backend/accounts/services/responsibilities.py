from django.db import transaction
from django.http import Http404
from django.utils import timezone

from audit import services as audit
from core.exceptions import DomainError
from notifications.choices import Kind

from .. import emails, policy
from ..choices import ProfileStatus, ResponsibilityCode
from ..models import COMPUTING_CHIEF, UserProfile, UserResponsibility
from ..policy import Code
from . import groups, roles

IT_ASSET_MANAGER = ResponsibilityCode.IT_ASSET_MANAGER
AUDITED = ("user", "responsibility", "region", "ended_at", "end_reason")

revokers = {}

def _active_it_managers():
    return UserResponsibility.objects.filter(responsibility=IT_ASSET_MANAGER, ended_at__isnull=True)


def _computing_chief_of(region):
    profile = (
        UserProfile.objects.filter(COMPUTING_CHIEF, role_region=region, status=ProfileStatus.ACTIVE)
        .select_related("user", "employee")
        .first()
    )
    return profile.user if profile is not None else None


def _require_reason_from_admin(actor, reason):
    """An Administrator acting in the place of the Chief of Service of Computing must say
    why."""
    if policy.context_for(actor).administers_organization and not reason.strip():
        raise DomainError(
            "REASON_REQUIRED",
            "An administrator must give a reason for this action.",
            status_code=400,
        )

def _notify(kind, actor, appointee, region, reason, also=()):
    """Tells the region's Chief of Service of Computing (unless they did it) and anyone in
    `also`."""
    recipients = {user.pk: user for user in also}
    chief = _computing_chief_of(region)
    if chief is not None and chief.pk != actor.pk:
        recipients[chief.pk] = chief
    for recipient in recipients.values():
        emails.send_it_manager_notice(kind, recipient, appointee, region, actor, reason)

def _end(actor, held, reason, now):
    held.ended_at = now
    held.ended_by = actor
    held.end_reason = reason[:255]
    held.save(update_fields=["ended_at", "ended_by", "end_reason"])
    groups.sync(held.user)

@transaction.atomic
def appoint_it_asset_manager(actor, user, *, region, reason="", replace=False):
    """Makes `user` the IT Asset Manager of `region`. A region has at most one: pass
    `replace=True` to end the current appointment in the same step."""
    policy.require(actor, Code.IT_ASSET_MANAGER_APPOINT, region)
    _require_reason_from_admin(actor, reason)
    region = type(region).objects.select_for_update().get(pk=region.pk)
    if not region.is_active:
        raise DomainError(
            "INACTIVE_TARGET", f"The region {region.code} is inactive.", status_code=400
        )

    profile = UserProfile.objects.select_related("employee").get(user=user)
    if profile.employee.region_id != region.pk:
        # A Chief of Service of Computing cannot learn about other regions' accounts here.
        if not policy.context_for(actor).administers_organization:
            raise Http404
        raise DomainError(
            "APPOINTEE_NOT_IN_REGION",
            "The appointee must be an employee of that region.",
            status_code=400,
        )
    if profile.status == ProfileStatus.DEACTIVATED:
        raise DomainError("ACCOUNT_DEACTIVATED", "A deactivated account cannot be appointed.")
    roles.require_may_hold_responsibility(profile)
    if profile.is_computing_chief:
        raise DomainError(
            "COMPUTING_CHIEF_CANNOT_BE_IT_ASSET_MANAGER",
            "The Chief of Service of Computing already has every IT Asset Manager permission.",
        )

    now = timezone.now()
    current = _active_it_managers().select_related("user").filter(region=region).first()
    if current is not None:
        if current.user_id == user.pk:
            raise DomainError(
                "ALREADY_IT_ASSET_MANAGER", "This person already holds the appointment."
            )
        if not replace:
            raise DomainError(
                "REGION_HAS_IT_ASSET_MANAGER",
                "This region already has an IT Asset Manager. Repeat with ?replace=true "
                "to replace them.",
                context={"current_account_id": str(current.user_id)},
            )
        before = audit.snapshot(current, AUDITED)
        _end(actor, current, "Replaced", now)
        audit.record(
            actor,
            "accounts.responsibility.ended",
            current,
            before=before,
            after=audit.snapshot(current, AUDITED),
        )

    held = UserResponsibility.objects.create(
        user=user,
        responsibility_id=IT_ASSET_MANAGER,
        region=region,
        granted_by=actor,
        granted_at=now,
    )
    groups.sync(user)
    audit.record(
        actor,
        "accounts.responsibility.granted",
        held,
        after={**audit.snapshot(held, AUDITED), "reason": reason},
    )
    _notify(Kind.IT_MANAGER_APPOINTED, actor, user, region, reason, also=[user])
    return held

@transaction.atomic
def revoke_it_asset_manager(actor, user, *, reason):
    """Ends the user's IT Asset Manager appointment. The region is then vacant and its
    Chief of Service of Computing covers the duties."""
    policy.require_code(actor, Code.IT_ASSET_MANAGER_APPOINT)
    held = (
        _active_it_managers()
        .select_for_update(of=("self",))
        .select_related("region")
        .filter(user=user)
        .first()
    )
    if held is None:
        raise Http404
    policy.require(actor, Code.IT_ASSET_MANAGER_APPOINT, held.region)
    before = audit.snapshot(held, AUDITED)
    _end(actor, held, reason, timezone.now())
    audit.record(
        actor,
        "accounts.responsibility.ended",
        held,
        before=before,
        after=audit.snapshot(held, AUDITED),
    )
    _notify(Kind.IT_MANAGER_REVOKED, actor, user, held.region, reason)
    return held

STORE_KEEPER = ResponsibilityCode.STORE_KEEPER

@transaction.atomic
def grant_store_keeper(actor, user, *, reason=""):
    policy.require(actor, Code.STORE_KEEPER_GRANT, user)
    profile = UserProfile.objects.select_for_update().get(user=user)
    if profile.status == ProfileStatus.DEACTIVATED:
        raise DomainError("ACCOUNT_DEACTIVATED", "A deactivated account cannot be a Store Keeper.")
    roles.require_may_hold_responsibility(profile)
    if UserResponsibility.objects.filter(
        user=user, responsibility=STORE_KEEPER, ended_at__isnull=True
    ).exists():
        raise DomainError("RESPONSIBILITY_ALREADY_HELD", "This person is already a Store Keeper.")
    held = UserResponsibility.objects.create(
        user=user, responsibility_id=STORE_KEEPER, granted_by=actor, granted_at=timezone.now()
    )
    groups.sync(user)
    audit.record(
        actor,
        "accounts.responsibility.granted",
        held,
        after={**audit.snapshot(held, AUDITED), "reason": reason},
    )
    return held


@transaction.atomic
def revoke_store_keeper(actor, user, *, reason):
    """Ends the Store Keeper responsibility, and with it every warehouse the person keeps,
    which become vacant. The warehouses must each be within the actor's reach."""
    policy.require(actor, Code.STORE_KEEPER_GRANT, user)
    held = (
        UserResponsibility.objects.select_for_update()
        .filter(user=user, responsibility=STORE_KEEPER, ended_at__isnull=True)
        .first()
    )
    if held is None:
        raise Http404
    # The warehouses app ends the assignments (it sits above this one: a registered hook).
    revokers[STORE_KEEPER](actor, user, reason=reason)
    before = audit.snapshot(held, AUDITED)
    _end(actor, held, reason, timezone.now())
    audit.record(
        actor,
        "accounts.responsibility.ended",
        held,
        before=before,
        after=audit.snapshot(held, AUDITED),
    )
    return held
