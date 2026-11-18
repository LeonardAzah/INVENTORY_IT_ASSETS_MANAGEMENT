from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from accounts import policy
from accounts.choices import ProfileStatus, ResponsibilityCode
from accounts.models import UserResponsibility
from accounts.policy import Code
from accounts.services import roles
from audit import services as audit
from core.exceptions import DomainError
from organization.services.common import lock

from ..choices import WarehouseType
from ..models import WarehouseAssignment

STORE_KEEPER = ResponsibilityCode.STORE_KEEPER
AUDITED = ("warehouse", "user", "assigned_at", "ended_at", "end_reason")

def _invalid(error_code, message):
    return DomainError(error_code, message, status_code=400)

def _held(user):
    return UserResponsibility.objects.filter(
        user=user, responsibility=STORE_KEEPER, ended_at__isnull=True
    )

def _find_assignee(actor, user_id):
    """The account to assign. For anyone but an Administrator it must be the actor or an
    account inside the actor's jurisdiction; one outside looks like one that is missing."""
    user = (
        get_user_model()
        .objects.filter(pk=user_id, profile__isnull=False)
        .select_related("profile__employee__office")
        .first()
    )
    visible = user is not None and (
        user.pk == actor.pk
        or policy.can(actor, Code.USER_VIEW, user)
        or policy.can(actor, Code.USER_MANAGE, user)
    )
    if not visible:
        raise _invalid("ASSIGNEE_NOT_FOUND", "No such user account.")
    if user.profile.status == ProfileStatus.DEACTIVATED:
        raise DomainError("ACCOUNT_DEACTIVATED", "A deactivated account cannot be a Store Keeper.")
    roles.require_may_hold_responsibility(user.profile)
    return user

def _end(actor, assignment, reason, now):
    before = audit.snapshot(assignment, AUDITED)
    assignment.ended_at = now
    assignment.ended_by = actor
    assignment.end_reason = reason[:255]
    assignment.save(update_fields=["ended_at", "ended_by", "end_reason"])
    audit.record(
        actor,
        "warehouses.store_keeper.removed",
        assignment,
        before=before,
        after=audit.snapshot(assignment, AUDITED),
    )

@transaction.atomic
def assign(actor, warehouse, *, user_id, reason=""):
    """Makes the account the Store Keeper of the warehouse, replacing the current one in
    the same transaction.
    """
    policy.require(actor, Code.STORE_KEEPER_ASSIGN, warehouse)
    if warehouse.type == WarehouseType.IT:
        raise _invalid(
            "IT_WAREHOUSE_HAS_NO_STORE_KEEPER",
            "An IT warehouse is operated by the region's IT staff, not by a Store Keeper.",
        )
    user = _find_assignee(actor, user_id)
    if not _held(user).exists():
        raise DomainError(
            "NOT_A_STORE_KEEPER",
            "This person does not hold the Store Keeper responsibility. Grant it first; "
            "assigning a warehouse does not grant it.",
        )
    warehouse = lock(warehouse)
    if not warehouse.is_active:
        raise DomainError(
            "WAREHOUSE_INACTIVE", "An inactive warehouse cannot be given a Store Keeper."
        )

    now = timezone.now()
    current = (
        WarehouseAssignment.objects.select_related("user")
        .filter(warehouse=warehouse, ended_at__isnull=True)
        .first()
    )
    if current is not None:
        if current.user_id == user.pk:
            raise DomainError(
                "ALREADY_STORE_KEEPER", "This person is already the Store Keeper here."
            )
        _end(actor, current, "Replaced", now)

    assignment = WarehouseAssignment.objects.create(
        warehouse=warehouse, user=user, assigned_by=actor, assigned_at=now
    )
    audit.record(
        actor,
        "warehouses.store_keeper.assigned",
        assignment,
        after={**audit.snapshot(assignment, AUDITED), "reason": reason},
    )
    return assignment

@transaction.atomic
def remove(actor, warehouse, *, reason):
    """Leaves the warehouse without a Store Keeper."""
    policy.require(actor, Code.STORE_KEEPER_ASSIGN, warehouse)
    lock(warehouse)
    current = (
        WarehouseAssignment.objects.select_related("user")
        .filter(warehouse=warehouse, ended_at__isnull=True)
        .first()
    )
    if current is None:
        raise DomainError("WAREHOUSE_VACANT", "This warehouse has no Store Keeper.")
    _end(actor, current, reason, timezone.now())
    return current

@transaction.atomic
def revoke_all(actor, user, *, reason):
    kept = list(
        WarehouseAssignment.objects.select_for_update(of=("self",))
        .select_related("warehouse__office", "user")
        .filter(user=user, ended_at__isnull=True)
    )
    for assignment in kept:
        policy.require(actor, Code.STORE_KEEPER_ASSIGN, assignment.warehouse)
    now = timezone.now()
    for assignment in kept:
        _end(actor, assignment, reason, now)
    return kept
