from collections.abc import Mapping

from django.apps import apps

from rest_framework import serializers

class StrictSerializer(serializers.Serializer):
    """Input serializer that rejects keys it does not declare, instead of ignoring them."""

    def to_internal_value(self, data):
        errors = {}
        if isinstance(data, Mapping):
            errors = {key: ["Unknown field."] for key in data if key not in self.fields}
        try:
            value = super().to_internal_value(data)
        except serializers.ValidationError as exc:
            if not errors or not isinstance(exc.detail, dict):
                raise
            errors = {**exc.detail, **errors}
        if errors:
            raise serializers.ValidationError(errors)
        return value

class _ModelIdField(serializers.PrimaryKeyRelatedField):
    def __init__(self, model, **kwargs):
        self.model = model
        super().__init__(pk_field=serializers.UUIDField(), **kwargs)

    def get_queryset(self):
        model = apps.get_model(self.model) if isinstance(self.model, str) else self.model
        return model._default_manager.all()

def id_field(model, source, **kwargs):
    """`<name>_id` input: a UUID resolved to the object, stored under `source`.
    `model` is a model class or an "app_label.Model" string."""
    return _ModelIdField(model, source=source, **kwargs)

class RefSerializer(serializers.Serializer):
    """How a related master-data object is rendered inside another resource."""

    id = serializers.UUIDField()
    code = serializers.CharField()
    name = serializers.CharField()