import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone

from ..choices import Status
from ..models import Notification
from ..templates import render, to_html

logger = logging.getLogger(__name__)

def send(kind, to, context, *, secrets=None, recipient_user=None, related=None, on_result=None):
    """Records a notification and sends it once the current transaction commits.

    A delivery failure is recorded, never raised: it must not undo the business operation.
    """
    subject, sent_text, stored_text = render(kind, context, secrets)
    notification = Notification.objects.create(
        kind=kind,
        recipient_email=to,
        recipient_user=recipient_user,
        subject=subject,
        body_text=stored_text,
        body_html=to_html(stored_text),
        redacted=bool(secrets),
        related_type=related._meta.label if related is not None else "",
        related_id=str(related.pk) if related is not None else "",
    )
    transaction.on_commit(lambda: _deliver(notification, sent_text, on_result))
    return notification


def _deliver(notification, text, on_result):
    message = EmailMultiAlternatives(
        subject=notification.subject,
        body=text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[notification.recipient_email],
    )
    message.attach_alternative(to_html(text), "text/html")
    error = ""
    try:
        message.send()
    except Exception as exc:  # any SMTP or network failure
        error = f"{type(exc).__name__}: {exc}"[:1000]
        logger.warning("Email %s to %s failed: %s", notification.kind, notification.pk, error)

    sent = not error
    Notification.objects.filter(pk=notification.pk).update(
        status=Status.SENT if sent else Status.FAILED,
        attempts=notification.attempts + 1,
        last_error=error,
        sent_at=timezone.now() if sent else None,
    )
    if on_result is not None:
        try:
            on_result(sent)
        except Exception:
            logger.exception("Notification result callback failed for %s", notification.pk)


def resend(notification):
    """Sends a stored email again, once the current transaction commits. Only for emails
    whose stored copy is complete (`redacted` is False)."""
    transaction.on_commit(lambda: _deliver(notification, notification.body_text, None))


def send_failed():
    """Retries every failed email that can be rebuilt from its stored copy. Returns
    (sent, still failing)."""
    sent = failing = 0
    for notification in Notification.objects.filter(status=Status.FAILED, redacted=False):
        _deliver(notification, notification.body_text, None)
        notification.refresh_from_db()
        if notification.status == Status.SENT:
            sent += 1
        else:
            failing += 1
    return sent, failing
