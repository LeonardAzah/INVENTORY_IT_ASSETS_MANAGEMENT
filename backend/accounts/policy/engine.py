from dataclasses import dataclass
from typing import NamedTuple
from uuid import UUID

from django.apps import apps
from django.contrib.auth.models import Permission
from django.core.exceptions import PermissionDenied
from django.db.models import Q
from django.http import Http404

from ..models import (
    COMPUTING_CHIEF,
    REGIONAL_REPRESENTATIVE,
    UserJurisdiction,
    UserProfile,
    UserResponsibility,
)
from .codes import Code
from .groups import (
    ADMINISTERING_GROUPS,
    ORGANIZATION_VIEWING_GROUPS,
    SUPER_ADMIN_GROUP,
    VIEWER_GROUP,
)

_PLACE_SCOPED = frozenset(
    {
        Code.USER_PROVISION,
        Code.USER_MANAGE,
        Code.USER_VIEW,
        Code.STORE_KEEPER_GRANT,
        Code.WAREHOUSE_MANAGE,
    }
)

_STORE_KEEPER_OPERATIONS = frozenset(
    {
        Code.INVENTORY_RECEIVE,
        Code.INVENTORY_ISSUE,
        Code.INVENTORY_RETURN,
        Code.INVENTORY_STOCK_TAKE,
        Code.INVENTORY_ADJUST,
    }
)

_REGIONAL_IT_OPERATIONS = frozenset(
    {
        Code.IT_ASSET_MANAGER_APPOINT,
        Code.IT_ACQUISITION_RECORD,
        Code.IT_ASSET_REGISTER,
        Code.IT_ASSET_ASSIGN,
        Code.IT_ASSET_RETURN,
        Code.IT_ASSET_UPDATE,
        Code.IT_ASSET_MAINTAIN,
        Code.IT_ASSET_RELOCATE,
        Code.IT_ASSET_DISPOSE,
    }
)

_STOCK_VIEWS = frozenset({Code.INVENTORY_VIEW, Code.REPORT_VIEW_INVENTORY})

_ASSET_VIEWS = frozenset({Code.IT_ASSET_VIEW, Code.REPORT_VIEW_ASSETS})

_CATALOGUE = frozenset({Code.CATEGORY_MANAGE, Code.ITEM_MANAGE})

ORGANIZATION_CODES = frozenset(
    {
        Code.ORG_STRUCTURE_MANAGE,
        Code.LOCATION_MANAGE,
        Code.EMPLOYEE_MANAGE,
        Code.UOM_MANAGE,
        Code.JURISDICTION_MANAGE,
        Code.AUDIT_VIEW,
    }
)

GENERAL = "GENERAL"
IT = "IT"

class JurisdictionScope(NamedTuple):
    region_id: UUID
    office_path: str | None
    department_id: UUID | None

@dataclass(frozen=True)
class AuthContext:
    """Everything the policy knows about a user. Empty for anonymous or inactive users:
    no codes and no scope, so nothing is granted by default.
    """
    codes: frozenset = frozenset()
    sees_organization: bool = False
    administers_organization: bool = False
    read_only: bool = False
    represented_regions: frozenset = frozenset()
    it_regions: frozenset = frozenset()
    jurisdictions: tuple = ()
    warehouses: tuple = ()

    @property
    def warehouse_ids(self):
        return frozenset(warehouse_id for warehouse_id, _ in self.warehouses)

    @property
    def warehouse_regions(self):
        return frozenset(region_id for _, region_id in self.warehouses)

    def covers(self, region_id, office_path, department_id):
        """The jurisdiction coverage rule"""
        for scope in self.jurisdictions:
            if scope.office_path is None:
                if scope.region_id == region_id:
                    return True
            elif scope.department_id is None:
                if office_path and office_path.startswith(scope.office_path):
                    return True
            elif scope.department_id == department_id:
                return True
        return False

def context_for(user):
    """Builds the user's AuthContext from the database."""
    if not getattr(user, "is_authenticated", False) or not user.is_active:
        return AuthContext()

    group_names = set(user.groups.values_list("name", flat=True))
    if user.is_superuser:
        group_names.add(SUPER_ADMIN_GROUP)
    administers = bool(group_names & ADMINISTERING_GROUPS)
    sees = bool(group_names & ORGANIZATION_VIEWING_GROUPS)
    read_only = VIEWER_GROUP in group_names and not administers
    rows = Permission.objects.filter(group__name__in=group_names).values_list(
        "content_type__app_label", "codename"
    )
    values = {f"{app_label}.{codename}" for app_label, codename in rows}
    codes = frozenset(code for code in Code if code.value in values)

    it_regions = set(
        UserProfile.objects.filter(COMPUTING_CHIEF, user=user).values_list(
            "role_region_id", flat=True
        )
    )
    represented_regions = frozenset(
        UserProfile.objects.filter(REGIONAL_REPRESENTATIVE, user=user).values_list(
            "role_region_id", flat=True
        )
    )
    it_regions.update(
        UserResponsibility.objects.filter(
            user=user, ended_at__isnull=True, region__isnull=False
        ).values_list("region_id", flat=True)
    )

    jurisdictions = tuple(
        JurisdictionScope(region_id, office_path, department_id)
        for region_id, office_path, department_id in UserJurisdiction.objects.filter(
            user=user, ended_at__isnull=True
        ).values_list("region_id", "office__path", "department_id")
    )
    assignment_model = apps.get_model("warehouses", "WarehouseAssignment")
    warehouses = tuple(
        assignment_model.objects.filter(user=user, ended_at__isnull=True).values_list(
            "warehouse_id", "warehouse__region_id"
        )
    )
    return AuthContext(
        codes=codes,
        sees_organization=sees,
        administers_organization=administers,
        read_only=read_only,
        represented_regions=represented_regions,
        it_regions=frozenset(it_regions),
        jurisdictions=jurisdictions,
        warehouses=warehouses,
    )


def jurisdiction_q(context, prefix=""):
    query = Q(pk__in=[])
    for scope in context.jurisdictions:
        if scope.office_path is None:
            query |= Q(**{f"{prefix}region_id": scope.region_id})
        elif scope.department_id is None:
            query |= Q(**{f"{prefix}office__path__startswith": scope.office_path})
        else:
            query |= Q(**{f"{prefix}department_id": scope.department_id})
    return query

def codes_for(user):
    return context_for(user).codes

def _affiliation(target):
    """The object that places `target` in the organization: a user's Employee, or the
    target itself when it carries region, office and department (Employee, Warehouse)."""
    profile = getattr(target, "profile", None)  # a User
    return profile.employee if profile is not None else target

def _region_id(target):
    """The region of an asset, acquisition or warehouse; or the target, if it is a region."""
    return getattr(target, "region_id", None) or target.pk


def sees_warehouse(context, warehouse):
    """The stock of a warehouse is visible to its Store Keeper, to anyone whose
    jurisdiction covers it, (for the IT warehouse) to the region's IT staff, and to
    whoever sees the whole organization."""
    if context.sees_organization or warehouse.pk in context.warehouse_ids:
        return True
    if warehouse.type == IT and warehouse.region_id in context.it_regions:
        return True
    return context.covers(warehouse.region_id, warehouse.office.path, warehouse.department_id)

def _in_scope(context, code, target):
    if target is None:
        return code in ORGANIZATION_CODES and context.administers_organization

    if code in _STORE_KEEPER_OPERATIONS:
        return target.type == GENERAL and target.pk in context.warehouse_ids
    if code is Code.IT_STOCK_RECEIVE:
        return target.type == IT and target.region_id in context.it_regions
    if code is Code.IT_ASSET_MANAGER_APPOINT and context.administers_organization:
        return True 
    if code in _REGIONAL_IT_OPERATIONS:
        return _region_id(target) in context.it_regions
    if code is Code.INVENTORY_THRESHOLD_SET:
        if target.type == GENERAL:
            return target.pk in context.warehouse_ids
        return target.region_id in context.it_regions
    if code in _CATALOGUE:
        if context.administers_organization:
            return True
        needed = Code.IT_ASSET_REGISTER if target.warehouse_type == IT else Code.WAREHOUSE_MANAGE
        return needed in context.codes

    if code in _STOCK_VIEWS:
        return sees_warehouse(context, target)
    if code in _ASSET_VIEWS:
        if context.sees_organization or target.region_id in context.it_regions:
            return True
        location = target.location
        return location is not None and context.covers(
            location.region_id, location.office.path, location.department_id
        )

    if code is Code.STORE_KEEPER_ASSIGN:
        if context.administers_organization:
            return True
        if target.is_regional_store:
            return target.region_id in context.represented_regions
        if target.region_id in context.represented_regions:
            return False
        return context.covers(target.region_id, target.office.path, target.department_id)
    if code in _PLACE_SCOPED:
        if context.administers_organization:
            return True
        place = _affiliation(target)
        if not hasattr(place, "office_id"):
            return False 
        return context.covers(place.region_id, place.office.path, place.department_id)
    if code in ORGANIZATION_CODES:
        return context.administers_organization
    return False

def can(user, code, target=None):
    context = context_for(user)
    return code in context.codes and _in_scope(context, code, target)

def holds(user, code):
    return code in context_for(user).codes

def require(user, code, target=None):
    """PermissionDenied (403) without the code; Http404 when the target is out of scope,
    so that the existence of records elsewhere is not revealed. Without a target"""
    context = context_for(user)
    if code not in context.codes:
        raise PermissionDenied
    if not _in_scope(context, code, target):
        raise Http404

def require_code(user, code):
    if code not in context_for(user).codes:
        raise PermissionDenied
