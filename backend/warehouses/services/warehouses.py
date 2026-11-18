from django.core.exceptions import PermissionDenied
from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError
from organization.choices import DepartmentKind
from organization.services.common import apply, lock, require_active

from ..choices import WarehouseType
from ..models import Warehouse

AUDITED = (
    "code",
    "name",
    "type",
    "region",
    "office",
    "department",
    "is_active",
    "is_regional_store",
)

deactivation_checks = []

def _invalid(error_code, message):
    return DomainError(error_code, message, status_code=400)

def _require_it_warehouse_authority(actor, warehouse):
    if warehouse.type != WarehouseType.IT:
        return
    context = policy.context_for(actor)
    if context.administers_organization or warehouse.region_id in context.computing_regions:
        return
    raise PermissionDenied

def _check_department(warehouse):
    department = warehouse.department
    is_regional_it = department is not None and department.kind == DepartmentKind.REGIONAL_IT
    if warehouse.type == WarehouseType.IT and not is_regional_it:
        raise _invalid(
            "IT_WAREHOUSE_NEEDS_IT_DEPARTMENT",
            "An IT warehouse must belong to the region's Regional IT department.",
        )
    if warehouse.type == WarehouseType.GENERAL and is_regional_it:
        raise _invalid(
            "GENERAL_WAREHOUSE_IN_IT_DEPARTMENT",
            "The Regional IT department holds only the IT warehouse.",
        )
    if department is None:
        return
    if department.office_id != warehouse.office_id:
        raise _invalid("DEPARTMENT_NOT_IN_OFFICE", "The department is not in that office.")
    require_active(department, "department")

def _check_regional_store(actor, warehouse):
    if not policy.context_for(actor).administers_organization:
        raise PermissionDenied
    if warehouse.is_regional_store and warehouse.type != WarehouseType.GENERAL:
        raise _invalid(
            "REGIONAL_STORE_MUST_BE_GENERAL", "The regional store is a general warehouse."
        )

@transaction.atomic
def create_warehouse(actor, *, code, name, type, office, department=None, is_regional_store=False):
    warehouse = Warehouse(
        code=code.upper(),
        name=name,
        type=type,
        office=office,
        region_id=office.region_id,
        department=department,
        is_regional_store=is_regional_store,
        created_by=actor,
    )
    # Scope is judged on where the warehouse would be: its office and department.
    policy.require(actor, Code.WAREHOUSE_MANAGE, warehouse)
    _require_it_warehouse_authority(actor, warehouse)
    if is_regional_store:
        _check_regional_store(actor, warehouse)
    office = lock(office)
    require_active(office, "office")
    _check_department(warehouse)
    warehouse.save()
    audit.record(
        actor, "warehouses.warehouse.created", warehouse, after=audit.snapshot(warehouse, AUDITED)
    )
    return warehouse

@transaction.atomic
def update_warehouse(actor, warehouse, **changes):
    policy.require(actor, Code.WAREHOUSE_MANAGE, warehouse)
    _require_it_warehouse_authority(actor, warehouse)
    warehouse = lock(warehouse)
    before = audit.snapshot(warehouse, AUDITED)
    changed = apply(warehouse, changes)
    if not changed:
        return warehouse
    if "is_regional_store" in changed:
        _check_regional_store(actor, warehouse)
    if "is_active" in changed:
        if warehouse.is_active:
            require_active(warehouse.office, "office")
        elif warehouse.assignments.filter(ended_at__isnull=True).exists():
            raise DomainError(
                "WAREHOUSE_HAS_STORE_KEEPER",
                "Remove the Store Keeper before deactivating this warehouse.",
            )
        else:
            for check in deactivation_checks:
                check(warehouse)
    warehouse.save(update_fields=changed)
    after = audit.snapshot(warehouse, AUDITED)
    audit.record(actor, "warehouses.warehouse.updated", warehouse, before=before, after=after)
    return warehouse
