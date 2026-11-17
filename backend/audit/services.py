from core.middleware import get_client_ip, get_request_id

from .models import AuditLog

SYSTEM_ACTOR = "system"

def snapshot(obj, fields):
    """The audited state of `obj`: column values, so foreign keys appear as ids."""
    return {name: getattr(obj, obj._meta.get_field(name).attname) for name in fields}

def record(actor, action, obj, before=None, after=None):
    """Writes one audit row. Call it inside the service's transaction."""
    return AuditLog.objects.create(
        actor=actor,
        actor_repr=str(actor)[:255] if actor is not None else SYSTEM_ACTOR,
        action=action,
        object_type=obj._meta.label,
        object_id=str(obj.pk),
        object_repr=str(obj)[:255],
        before=before,
        after=after,
        request_id=get_request_id(),
        ip=get_client_ip(),
    )
