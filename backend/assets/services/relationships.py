from django.db import transaction
from django.utils import timezone

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError
from items.choices import AssetClass

from ..choices import AssetStatus, RelationshipKind
from ..models import AssetRelationship
from .common import invalid

AUDITED = ("asset", "related_asset", "kind", "ended_at")

RULES = {
    RelationshipKind.PERIPHERAL_OF.value: (
        {
            AssetClass.KEYBOARD.value,
            AssetClass.MOUSE.value,
            AssetClass.MONITOR.value,
            AssetClass.UPS.value,
        },
        {AssetClass.COMPUTER.value},
    ),
    RelationshipKind.SHARED_PRINTER_FOR.value: (
        {AssetClass.PRINTER.value},
        {AssetClass.COMPUTER.value},
    ),
}


@transaction.atomic
def add(actor, asset, *, related_asset, kind):
    """Links a peripheral to its computer, or a shared printer to a computer it serves.
    A link is information only: linked assets are still assigned and moved one by one."""
    policy.require(actor, Code.IT_ASSET_UPDATE, asset)
    if asset.pk == related_asset.pk:
        raise invalid("SELF_RELATIONSHIP", "An asset cannot be related to itself.")
    if asset.region_id != related_asset.region_id:
        raise invalid("ASSET_IN_OTHER_REGION", "Both assets must be in the same region.")
    asset_classes, related_classes = RULES[str(RelationshipKind(kind).value)]
    if (
        asset.item.asset_class not in asset_classes
        or related_asset.item.asset_class not in related_classes
    ):
        raise invalid(
            "RELATIONSHIP_NOT_ALLOWED",
            f"{kind} links a {' / '.join(sorted(asset_classes))} to a "
            f"{' / '.join(sorted(related_classes))}.",
        )
    if AssetStatus.RETIRED in (asset.status, related_asset.status):
        raise DomainError("ASSET_RETIRED", "A retired asset cannot be linked to another.")
    relationship = AssetRelationship.objects.create(
        asset=asset, related_asset=related_asset, kind=kind, created_by=actor
    )
    audit.record(
        actor,
        "assets.relationship.created",
        relationship,
        after=audit.snapshot(relationship, AUDITED),
    )
    return relationship

@transaction.atomic
def end(actor, relationship):
    policy.require(actor, Code.IT_ASSET_UPDATE, relationship.asset)
    relationship = AssetRelationship.objects.select_for_update().get(pk=relationship.pk)
    if relationship.ended_at is not None:
        raise DomainError("RELATIONSHIP_ENDED", "This relationship has already ended.")
    before = audit.snapshot(relationship, AUDITED)
    relationship.ended_at = timezone.now()
    relationship.ended_by = actor
    relationship.save(update_fields=["ended_at", "ended_by"])
    audit.record(
        actor,
        "assets.relationship.ended",
        relationship,
        before=before,
        after=audit.snapshot(relationship, AUDITED),
    )
    return relationship
