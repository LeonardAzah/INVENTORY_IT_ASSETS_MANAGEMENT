from django.db.models import OuterRef, Prefetch, Q, Subquery

from accounts import policy
from accounts.choices import ProfileStatus, ResponsibilityCode
from accounts.models import (
    COMPUTING_CHIEF,
    REGIONAL_REPRESENTATIVE,
    UserProfile,
    UserResponsibility,
)

from .choices import WarehouseType
from .models import Warehouse, WarehouseAssignment

def _active_assignments():
    return WarehouseAssignment.objects.filter(ended_at__isnull=True).select_related(
        "user__profile__employee"
    )

def warehouses_for(user):
    """Administrators see every warehouse. Others see the warehouses their jurisdictions
    cover, the ones they keep, and the IT warehouse of a region whose IT they run."""
    queryset = Warehouse.objects.select_related("region", "office", "department").prefetch_related(
        Prefetch("assignments", queryset=_active_assignments(), to_attr="active_assignments")
    )
    context = policy.context_for(user)
    if context.sees_organization:
        return queryset
    return queryset.filter(
        policy.jurisdiction_q(context)
        | Q(pk__in=context.warehouse_ids)
        | Q(type=WarehouseType.IT, region_id__in=context.it_regions)
    )

def with_store_keeper_flag(queryset):
    active = WarehouseAssignment.objects.filter(warehouse=OuterRef("pk"), ended_at__isnull=True)
    return queryset.annotate(keeper_id=Subquery(active.values("user_id")[:1]))

def assignments_of(warehouse):
    return WarehouseAssignment.objects.filter(warehouse=warehouse).select_related(
        "user__profile__employee", "assigned_by", "ended_by"
    )

def it_staff(region):
    representative = (
        UserProfile.objects.filter(REGIONAL_REPRESENTATIVE, role_region=region)
        .exclude(status=ProfileStatus.DEACTIVATED)
        .select_related("user", "employee")
        .first()
    )
    chief = (
        UserProfile.objects.filter(COMPUTING_CHIEF, role_region=region)
        .exclude(status=ProfileStatus.DEACTIVATED)
        .select_related("user", "employee")
        .first()
    )
    manager = (
        UserResponsibility.objects.filter(
            region=region,
            responsibility=ResponsibilityCode.IT_ASSET_MANAGER,
            ended_at__isnull=True,
        )
        .select_related("user__profile__employee")
        .first()
    )
    warehouse = Warehouse.objects.filter(
        region=region, type=WarehouseType.IT, is_active=True
    ).first()
    return {
        "computing_chief": chief.user if chief else None,
        "it_asset_manager": manager.user if manager else None,
        "it_warehouse": warehouse,
        "regional_representative": representative.user if representative else None,
        "vacancies": [
            post
            for post, holder in (
                ("CHIEF_OF_SERVICE_OF_COMPUTING", chief),
                ("IT_ASSET_MANAGER", manager),
                ("IT_WAREHOUSE", warehouse),
            )
            if holder is None
        ],
    }
