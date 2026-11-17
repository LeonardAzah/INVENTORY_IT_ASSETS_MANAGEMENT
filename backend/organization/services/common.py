from core.exceptions import DomainError

def lock(obj):
    """Re-reads `obj` with a row lock. Must be called inside a transaction."""
    return type(obj).objects.select_for_update().get(pk=obj.pk)

def require_active(obj, what):
    if not obj.is_active:
        raise DomainError(
            "INACTIVE_PARENT",
            f"The {what} {obj.code} is inactive.",
            context={"id": str(obj.pk)},
            status_code=400,
        )

def require_no_active(queryset, what, owner):
    """Blocks a deactivation that would leave active records under an inactive parent."""
    count = queryset.filter(is_active=True).count()
    if count:
        raise DomainError(
            "HAS_ACTIVE_CHILDREN",
            f"{owner} still has {count} active {what}. Deactivate them first.",
            context={"children": what, "count": count},
        )

def apply(obj, changes):
    """Sets the changed attributes and returns the names of those that really differ."""
    changed = [name for name, value in changes.items() if getattr(obj, name) != value]
    for name in changed:
        setattr(obj, name, changes[name])
    return changed
