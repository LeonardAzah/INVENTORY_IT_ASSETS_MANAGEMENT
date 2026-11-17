from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit

from ..models import Region
from .common import apply, lock, require_no_active

AUDITED = ("code", "name", "is_active")

@transaction.atomic
def create_region(actor, *, code, name):
    policy.require(actor, Code.ORG_STRUCTURE_MANAGE)
    region = Region.objects.create(code=code.upper(), name=name)
    audit.record(
        actor, "organization.region.created", region, after=audit.snapshot(region, AUDITED)
    )
    return region

@transaction.atomic
def update_region(actor, region, **changes):
    """`changes` may hold `name` and `is_active`. The code is permanent (U-09)."""
    policy.require(actor, Code.ORG_STRUCTURE_MANAGE)
    region = lock(region)
    before = audit.snapshot(region, AUDITED)
    changed = apply(region, changes)
    if not changed:
        return region
    if "is_active" in changed and not region.is_active:
        require_no_active(region.offices, "offices", f"Region {region.code}")
    region.save(update_fields=changed)
    after = audit.snapshot(region, AUDITED)
    audit.record(actor, "organization.region.updated", region, before=before, after=after)
    return region
