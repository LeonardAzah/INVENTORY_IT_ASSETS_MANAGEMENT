from django.db.models import F, Q

from accounts import policy
from accounts.policy import Code
from inventory.models import ReceiptLine
from warehouses.choices import WarehouseType

from .models import AcquisitionRecord, AssetAssignment, AssetEvent, AssetRelationship, ITAsset

def _base():
    return ITAsset.objects.select_related(
        "item__unit",
        "region",
        "custody_warehouse",
        "location__office",
        "current_assignment__employee",
        "current_assignment__department",
        "current_assignment__location",
        "computer_details",
    )

def assets_for(user):
    queryset = _base()
    context = policy.context_for(user)
    if Code.IT_ASSET_VIEW not in context.codes:
        return queryset.none()
    if context.sees_organization:
        return queryset
    return queryset.filter(
        Q(region_id__in=context.it_regions) | policy.jurisdiction_q(context, "location__")
    )

def _it_regions_or_all(queryset, user, field="region_id"):
    """For what only IT staff (and Administrators, read-only) see: by region."""
    context = policy.context_for(user)
    if Code.IT_ASSET_VIEW not in context.codes:
        return queryset.none()
    if context.sees_organization:
        return queryset
    return queryset.filter(**{f"{field}__in": context.it_regions})

def acquisitions_for(user):
    return _it_regions_or_all(
        AcquisitionRecord.objects.select_related("region", "item__unit", "recorded_by"), user
    )

def pending_receipt_lines(user):
    """IT receipt lines that still have units without an asset record."""
    queryset = ReceiptLine.objects.filter(
        receipt__warehouse__type=WarehouseType.IT, registered_quantity__lt=F("quantity")
    ).select_related("receipt__warehouse__region", "item__unit")
    return _it_regions_or_all(queryset, user, "receipt__warehouse__region_id")

def pending_acquisitions(user):
    return acquisitions_for(user).filter(registered_quantity__lt=F("quantity"))

def events_of(asset):
    return AssetEvent.objects.filter(asset=asset).select_related("actor")

def relationships_of(asset):
    """Links in both directions: what this asset is attached to, and what is attached to it."""
    return AssetRelationship.objects.filter(Q(asset=asset) | Q(related_asset=asset)).select_related(
        "asset__item", "related_asset__item"
    )

def linked_peripherals(asset):
    return [
        relationship.asset
        for relationship in AssetRelationship.objects.filter(
            related_asset=asset, ended_at__isnull=True
        ).select_related("asset__item")
    ]

def assignments_of_employee(employee):
    return (
        AssetAssignment.objects.filter(employee=employee, returned_at__isnull=True)
        .select_related("asset__item", "location")
        .order_by("asset__asset_tag")
    )
