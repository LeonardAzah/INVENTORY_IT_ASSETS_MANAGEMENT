from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError

from ..models import Location, Office
from . import locations
from .common import apply, lock, require_active, require_no_active

AUDITED = ("region", "parent", "kind", "code", "name", "town", "path", "is_active")
PATH_MAX_LENGTH = Office._meta.get_field("path").max_length

deactivation_checks = []

def _path(office, parent):
    return f"{parent.path if parent else '/'}{office.pk.hex}/"

def _check_parent(office, parent):
    require_active(parent, "parent office")
    if parent.region_id != office.region_id:
        raise DomainError(
            "PARENT_IN_OTHER_REGION",
            "The parent office must be in the same region.",
            status_code=400,
        )

def _check_depth(longest_path):
    if len(longest_path) > PATH_MAX_LENGTH:
        raise DomainError(
            "OFFICE_TREE_TOO_DEEP", "Offices cannot be nested this deeply.", status_code=400
        )

@transaction.atomic
def create_office(actor, *, region, kind, code, name, town, parent=None):
    policy.require(actor, Code.ORG_STRUCTURE_MANAGE)
    region = lock(region)
    require_active(region, "region")
    office = Office(region=region, kind=kind, code=code.upper(), name=name, town=town)
    if parent is not None:
        parent = lock(parent)
        _check_parent(office, parent)
        office.parent = parent
    office.path = _path(office, parent)
    _check_depth(office.path)
    office.save()
    audit.record(
        actor, "organization.office.created", office, after=audit.snapshot(office, AUDITED)
    )

    # Every office starts with one default approved location (RQ-06).
    default = Location.objects.create(
        office=office, region=region, name=office.name, is_default=True
    )
    after = audit.snapshot(default, locations.AUDITED)
    audit.record(actor, "organization.location.created", default, after=after)
    return office

def _move(office, parent):
    """Re-parents `office` and rewrites the path of its whole subtree."""
    old_path = office.path
    if parent is not None:
        _check_parent(office, parent)
        if parent.path.startswith(old_path):
            raise DomainError(
                "OFFICE_CYCLE",
                "An office cannot be placed under itself or one of its own child offices.",
                status_code=400,
            )
    new_path = _path(office, parent)
    descendants = list(
        Office.objects.select_for_update().filter(path__startswith=old_path).exclude(pk=office.pk)
    )
    for descendant in descendants:
        descendant.path = new_path + descendant.path[len(old_path) :]
    _check_depth(max([new_path, *(d.path for d in descendants)], key=len))
    office.path = new_path
    Office.objects.bulk_update(descendants, ["path"])

@transaction.atomic
def update_office(actor, office, **changes):
    """`changes` may hold `code`, `name`, `town`, `parent` and `is_active`.
    Region and kind are fixed at creation."""
    policy.require(actor, Code.ORG_STRUCTURE_MANAGE)
    office = lock(office)
    before = audit.snapshot(office, AUDITED)
    if "code" in changes:
        changes["code"] = changes["code"].upper()
    if changes.get("parent") is not None:
        changes["parent"] = lock(changes["parent"])
    changed = apply(office, changes)
    if not changed:
        return office

    if "parent" in changed:
        _move(office, office.parent)
        changed.append("path")
    if "is_active" in changed:
        if office.is_active:
            require_active(office.region, "region")
            if office.parent is not None:
                require_active(office.parent, "parent office")
        else:
            owner = f"Office {office.code}"
            require_no_active(office.children, "child offices", owner)
            require_no_active(office.departments, "departments", owner)
            for check in deactivation_checks:
                check(office)

    office.save(update_fields=changed)
    after = audit.snapshot(office, AUDITED)
    audit.record(actor, "organization.office.updated", office, before=before, after=after)
    return office
