from django.core.exceptions import PermissionDenied

from accounts import policy

def require(actor, code, entry):
    """The catalogue is visible to everyone, so there is nothing to hide: an actor who
    may not manage this type of entry gets 403, never 404."""
    if not policy.can(actor, code, entry):
        raise PermissionDenied
