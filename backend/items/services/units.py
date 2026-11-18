from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError

from ..models import UnitOfMeasure

AUDITED = ("code", "name", "decimal_places", "is_active")

@transaction.atomic
def create_unit(actor, *, code, name, decimal_places=0):
    policy.require(actor, Code.UOM_MANAGE)
    unit = UnitOfMeasure.objects.create(code=code.upper(), name=name, decimal_places=decimal_places)
    audit.record(actor, "items.unit.created", unit, after=audit.snapshot(unit, AUDITED))
    return unit

@transaction.atomic
def update_unit(actor, unit, **changes):
    """`changes` may hold `name`, `decimal_places` and `is_active`."""
    policy.require(actor, Code.UOM_MANAGE)
    unit = UnitOfMeasure.objects.select_for_update().get(pk=unit.pk)
    before = audit.snapshot(unit, AUDITED)
    for name, value in changes.items():
        setattr(unit, name, value)
    after = audit.snapshot(unit, AUDITED)
    if after == before:
        return unit
    if after["decimal_places"] != before["decimal_places"] and unit.items.exists():
        raise DomainError(
            "UNIT_IN_USE", "The precision of a unit that items use cannot be changed."
        )
    unit.save()
    audit.record(actor, "items.unit.updated", unit, before=before, after=after)
    return unit
