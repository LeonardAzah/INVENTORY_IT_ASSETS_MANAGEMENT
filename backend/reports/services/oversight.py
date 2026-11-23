from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError
from notifications.choices import Status
from notifications.models import Notification
from notifications.services import email

@transaction.atomic
def retry_notification(actor, notification):
    """Sends a failed email again. An email whose one-time link was left out of the stored
    copy cannot be rebuilt: issue a new one instead (e.g. re-send the invitation)."""
    policy.require(actor, Code.AUDIT_VIEW)
    notification = Notification.objects.select_for_update().get(pk=notification.pk)
    if notification.status == Status.SENT:
        raise DomainError("ALREADY_SENT", "This email has already been sent.")
    if notification.redacted:
        raise DomainError(
            "NOT_RETRYABLE",
            "This email contained a one-time link that is not stored. Issue a new one "
            "instead, for example by re-sending the invitation.",
        )
    email.resend(notification)
    audit.record(actor, "notifications.notification.retried", notification)
    return notification
