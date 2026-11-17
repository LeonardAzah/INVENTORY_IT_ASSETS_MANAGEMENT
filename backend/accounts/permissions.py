from rest_framework.permissions import SAFE_METHODS, BasePermission

from . import policy

class ReadOnlyForViewer(BasePermission):
    """A Viewer may only read: any method other than GET, HEAD or OPTIONS is refused (403)
    on every endpoint. Installed in DEFAULT_PERMISSION_CLASSES, so
    a new view is covered without doing anything.
    """
    message = "A Viewer account is read-only."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS or getattr(view, "viewer_may_write", False):
            return True
        return not policy.context_for(request.user).read_only
