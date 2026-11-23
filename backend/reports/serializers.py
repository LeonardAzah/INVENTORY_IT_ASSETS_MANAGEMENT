from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from audit.models import AuditLog
from notifications.models import Notification

class AuditActor(serializers.Serializer):
    """Who did it: the account id (null for the system) and its name when recorded."""

    id = serializers.UUIDField(allow_null=True)
    name = serializers.CharField()

class AuditOutput(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "occurred_at",
            "actor",
            "action",
            "object_type",
            "object_id",
            "object_repr",
            "before",
            "after",
            "request_id",
            "ip",
        ]

    @extend_schema_field(AuditActor())
    def get_actor(self, entry):
        return {"id": entry.actor_id, "name": entry.actor_repr}

class NotificationOutput(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id",
            "kind",
            "recipient_email",
            "subject",
            "body_text",
            "redacted",
            "related_type",
            "related_id",
            "status",
            "attempts",
            "last_error",
            "created_at",
            "sent_at",
        ]


# Documentation only: the shapes below describe responses that the report and dashboard
# views build as plain data (`views._describe`, `dashboard.build`). They are used by the
# OpenAPI schema, not to render anything.
class ReportColumn(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()

class ReportDescription(serializers.Serializer):
    name = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    columns = ReportColumn(many=True)
    # The query parameters the report takes, besides `format`, `page` and `page_size`.
    filters = serializers.ListField(child=serializers.CharField())
    formats = serializers.ListField(child=serializers.ChoiceField(choices=["json", "pdf"]))

class ReportPagination(serializers.Serializer):
    count = serializers.IntegerField()
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    total_pages = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)

class ReportOutput(ReportDescription):
    """One page of a report. Every cell is text, keyed by the column's `key`."""
    results = serializers.ListField(child=serializers.DictField(child=serializers.CharField()))
    pagination = ReportPagination()

class DashboardWarehouses(serializers.Serializer):
    total = serializers.IntegerField()
    active = serializers.IntegerField()

class DashboardStock(serializers.Serializer):
    items_in_stock = serializers.IntegerField()
    low_stock = serializers.IntegerField()
    with_unavailable = serializers.IntegerField()


class DashboardAssets(serializers.Serializer):
    total = serializers.IntegerField()
    # Every asset status, with its count (0 included).
    by_status = serializers.DictField(child=serializers.IntegerField())
    pending_registration = serializers.IntegerField()

class DashboardMovement(serializers.Serializer):
    occurred_at = serializers.CharField(help_text="Local time, YYYY-MM-DD HH:MM.")
    warehouse = serializers.CharField()
    item = serializers.CharField()
    type = serializers.CharField()
    quantity = serializers.CharField(help_text="Signed decimal quantity.")
    reference = serializers.CharField()

class DashboardAssetEvent(serializers.Serializer):
    occurred_at = serializers.CharField(help_text="Local time, YYYY-MM-DD HH:MM.")
    asset_tag = serializers.CharField()
    event_type = serializers.CharField()
    to_status = serializers.CharField(allow_blank=True)
    by = serializers.EmailField()

class DashboardOutput(serializers.Serializer):
    warehouses = DashboardWarehouses()
    stock = DashboardStock()
    assets = DashboardAssets()
    recent_movements = DashboardMovement(many=True)
    recent_asset_events = DashboardAssetEvent(many=True)
