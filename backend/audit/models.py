from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.utils import timezone

from core.models import UUIDModel

class AuditLog(UUIDModel):
    occurred_at = models.DateTimeField(default=timezone.now)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+"
    )
    actor_repr = models.CharField(max_length=255)
    action = models.CharField(max_length=64)
    object_type = models.CharField(max_length=64)
    object_id = models.CharField(max_length=64)
    object_repr = models.CharField(max_length=255)
    before = models.JSONField(null=True, encoder=DjangoJSONEncoder)
    after = models.JSONField(null=True, encoder=DjangoJSONEncoder)
    request_id = models.UUIDField(null=True)
    ip = models.GenericIPAddressField(null=True)

    class Meta:
        default_permissions = ()
        permissions = [("audit_view", "View the audit log")]
        indexes = [
            models.Index(fields=["object_type", "object_id"], name="audit_auditlog_object"),
            models.Index(fields=["actor", "occurred_at"], name="audit_auditlog_actor_time"),
            models.Index(fields=["occurred_at"], name="audit_auditlog_time"),
        ]

    def __str__(self):
        return f"{self.action} {self.object_repr}"
