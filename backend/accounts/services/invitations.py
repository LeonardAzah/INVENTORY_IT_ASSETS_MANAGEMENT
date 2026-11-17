import hashlib
import secrets
import uuid
from datetime import timedelta

from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from djoser import utils

from audit import services as audit
from core.exceptions import DomainError

from .. import emails
from ..choices import DeliveryStatus, ProfileStatus
from ..models import AccountInvitation, UserProfile
from . import management

INVITATION_HOURS = 72

def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()

def _live(user):
    return AccountInvitation.objects.filter(
        user=user, used_at__isnull=True, revoked_at__isnull=True
    )

def _record_delivery(invitation_id, sent):
    AccountInvitation.objects.filter(pk=invitation_id).update(
        delivery_status=DeliveryStatus.SENT if sent else DeliveryStatus.FAILED,
        sent_at=timezone.now() if sent else None,
    )

def issue(actor, user):
    """Replaces any live invitation of `user` with a new one and emails the link.
    Call inside the caller's transaction, after its authorization."""
    now = timezone.now()
    _live(user).update(revoked_at=now, revoked_by=actor)
    token = secrets.token_urlsafe(32)
    invitation = AccountInvitation.objects.create(
        user=user,
        token_hash=hash_token(token),
        created_by=actor,
        created_at=now,
        expires_at=now + timedelta(hours=INVITATION_HOURS),
    )
    emails.send_invitation(
        invitation,
        token,
        INVITATION_HOURS,
        on_result=lambda sent: _record_delivery(invitation.pk, sent),
    )
    return invitation

def _locked_invited_profile(user):
    profile = UserProfile.objects.select_for_update().get(user=user)
    if profile.status != ProfileStatus.INVITED:
        raise DomainError("NOT_INVITED", "This account is not waiting for activation.")
    return profile

@transaction.atomic
def resend(actor, user):
    """Sends a fresh link. The previous one stops working."""
    management.require_manageable(actor, user)
    _locked_invited_profile(user)
    invitation = issue(actor, user)
    audit.record(actor, "accounts.invitation.resent", user)
    return invitation

@transaction.atomic
def revoke(actor, user):
    """Cancels the live invitation. The account stays INVITED until a new one is sent."""
    management.require_manageable(actor, user)
    _locked_invited_profile(user)
    if not _live(user).update(revoked_at=timezone.now(), revoked_by=actor):
        raise DomainError(
            "NO_LIVE_INVITATION", "This account has no invitation that can be revoked."
        )
    audit.record(actor, "accounts.invitation.revoked", user)

def _invalid():
    return DomainError("INVALID_INVITATION", "This activation link is not valid.", status_code=400)

@transaction.atomic
def activate(*, uid, token, new_password):
    """Public: the invited person sets their password and the account becomes ACTIVE.

    Raises django.core.exceptions.ValidationError when the password is too weak.
    """
    try:
        user_id = uuid.UUID(utils.decode_uid(uid))
    except ValueError, TypeError, UnicodeDecodeError:
        raise _invalid() from None
    invitation = (
        AccountInvitation.objects.select_for_update(of=("self",))
        .select_related("user__profile")
        .filter(user_id=user_id, token_hash=hash_token(token))
        .first()
    )
    # A wrong, used or revoked link all look the same from outside.
    if invitation is None or invitation.used_at or invitation.revoked_at:
        raise _invalid()
    user = invitation.user
    if user.profile.status != ProfileStatus.INVITED:
        raise _invalid()
    now = timezone.now()
    if invitation.expires_at <= now:
        raise DomainError(
            "INVITATION_EXPIRED",
            "This activation link has expired. Ask for a new invitation.",
            status_code=400,
        )

    validate_password(new_password, user)
    user.set_password(new_password)
    user.is_active = True
    user.save(update_fields=["password", "is_active"])
    UserProfile.objects.filter(user=user).update(status=ProfileStatus.ACTIVE)
    invitation.used_at = now
    invitation.save(update_fields=["used_at"])
    audit.record(
        user,
        "accounts.user.activated",
        user,
        before={"status": ProfileStatus.INVITED},
        after={"status": ProfileStatus.ACTIVE},
    )
    return user
