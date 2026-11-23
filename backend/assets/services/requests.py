import functools

from core.exceptions import DomainError

from ..models import AssetRequest

def _reused(message):
    return DomainError("REQUEST_ID_REUSED", message, status_code=409)

def _replay(model, done, many):
    found = {str(obj.pk): obj for obj in model.objects.filter(pk__in=done.object_ids)}
    objects = [found[pk] for pk in done.object_ids if pk in found]
    for obj in objects:
        obj.replayed = True
    return objects if many else objects[0]

def idempotent(model, operation, *, many=False, on_target=False):
    def decorate(service):
        @functools.wraps(service)
        def wrapper(actor, *args, client_request_id=None, **kwargs):
            if client_request_id is None:
                return service(actor, *args, **kwargs)
            done = AssetRequest.objects.filter(
                actor=actor, client_request_id=client_request_id
            ).first()
            if done is not None:
                if done.operation != operation:
                    raise _reused("This request id was already used for another operation.")
                if on_target and str(args[0].pk) not in done.object_ids:
                    raise _reused("This request id was already used on another asset.")
                return _replay(model, done, many)
            # Claimed before the work: the same request arriving at the same moment waits
            # on this row, then fails on its uniqueness instead of doing the work twice.
            claim = AssetRequest.objects.create(
                actor=actor, client_request_id=client_request_id, operation=operation
            )
            result = service(actor, *args, **kwargs)
            claim.object_ids = [str(obj.pk) for obj in (result if many else [result])]
            claim.save(update_fields=["object_ids"])
            return result

        return wrapper

    return decorate
