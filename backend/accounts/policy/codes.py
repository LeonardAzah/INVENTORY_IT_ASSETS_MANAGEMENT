from enum import Enum

class Code(Enum):
    """Permission codes. The value is the Django permission, `app_label.codename`,
    declared in the owning model's `Meta.permissions`. Code refers only to this enum."""

    ORG_STRUCTURE_MANAGE = "organization.org_structure_manage"
    LOCATION_MANAGE = "organization.location_manage"
    EMPLOYEE_MANAGE = "employees.employee_manage"
    USER_PROVISION = "accounts.user_provision"
    USER_MANAGE = "accounts.user_manage"
    USER_VIEW = "accounts.user_view"
    ROLE_GRANT = "accounts.role_grant"  # Manager, Chief of Service, Employee
    ROLE_GRANT_REGIONAL = "accounts.role_grant_regional"  # Regional Representative
    ROLE_GRANT_PRIVILEGED = "accounts.role_grant_privileged"  # Admin, Viewer
    JURISDICTION_MANAGE = "accounts.jurisdiction_manage"
    IT_ASSET_MANAGER_APPOINT = "accounts.it_asset_manager_appoint"
    STORE_KEEPER_GRANT = "accounts.store_keeper_grant"
    WAREHOUSE_MANAGE = "warehouses.warehouse_manage"
    STORE_KEEPER_ASSIGN = "warehouses.store_keeper_assign"

    UOM_MANAGE = "items.uom_manage"
    CATEGORY_MANAGE = "items.category_manage"
    ITEM_MANAGE = "items.item_manage"

    INVENTORY_VIEW = "inventory.inventory_view"
    INVENTORY_RECEIVE = "inventory.inventory_receive"
    INVENTORY_ISSUE = "inventory.inventory_issue"
    INVENTORY_RETURN = "inventory.inventory_return"
    INVENTORY_STOCK_TAKE = "inventory.inventory_stock_take"
    INVENTORY_ADJUST = "inventory.inventory_adjust"
    INVENTORY_THRESHOLD_SET = "inventory.inventory_threshold_set"

    IT_STOCK_RECEIVE = "inventory.it_stock_receive"
    IT_ACQUISITION_RECORD = "assets.it_acquisition_record"
    IT_ASSET_VIEW = "assets.it_asset_view"
    IT_ASSET_REGISTER = "assets.it_asset_register"
    IT_ASSET_ASSIGN = "assets.it_asset_assign"
    IT_ASSET_RETURN = "assets.it_asset_return"
    IT_ASSET_UPDATE = "assets.it_asset_update"
    IT_ASSET_MAINTAIN = "assets.it_asset_maintain"
    IT_ASSET_RELOCATE = "assets.it_asset_relocate"
    IT_ASSET_DISPOSE = "assets.it_asset_dispose"

    REPORT_VIEW_INVENTORY = "inventory.report_view_inventory"
    REPORT_VIEW_ASSETS = "assets.report_view_assets"
    AUDIT_VIEW = "audit.audit_view"
