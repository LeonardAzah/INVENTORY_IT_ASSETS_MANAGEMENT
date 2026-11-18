from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import UUIDModel

from .choices import Kind, Status

class Notification(UUIDModel):
    """One email the system sent or tried to send. Secret links are never stored: the
    saved body carries a placeholder where the sent body had the link."""
    kind = models.CharField(max_length=32, choices=Kind.choices)
    recipient_email = models.EmailField(max_length=254)
    recipient_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    subject = models.CharField(max_length=255)
    body_text = models.TextField()
    body_html = models.TextField()
    redacted = models.BooleanField(default=False)
    related_type = models.CharField(max_length=64, blank=True)
    related_id = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.QUEUED)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        default_permissions = ()
        indexes = [
            models.Index(fields=["status", "created_at"], name="notifications_status"),
        ]

    def __str__(self):
        return f"{self.kind} to {self.recipient_email}"
