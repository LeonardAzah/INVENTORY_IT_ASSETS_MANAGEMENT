from django.apps import apps as django_apps
from django.contrib.auth.management import create_permissions
from django.contrib.auth.models import Group, Permission
from django.db import connections

from ..choices import ResponsibilityCode, Role
from .codes import Code

ROLE_GROUPS = {role.value: f"role:{role.value.lower()}" for role in Role}
RESPONSIBILITY_GROUPS = {code.value: f"resp:{code.value.lower()}" for code in ResponsibilityCode}
COMPUTING_CHIEF_GROUP = "post:computing_chief"

SUPER_ADMIN_GROUP = ROLE_GROUPS[Role.SUPER_ADMIN.value]
ADMIN_GROUP = ROLE_GROUPS[Role.ADMIN.value]
VIEWER_GROUP = ROLE_GROUPS[Role.VIEWER.value]

ADMINISTERING_GROUPS = frozenset({SUPER_ADMIN_GROUP, ADMIN_GROUP})
ORGANIZATION_VIEWING_GROUPS = ADMINISTERING_GROUPS | {VIEWER_GROUP}

_MANAGEMENT = (
    # Code.USER_VIEW,
    # Code.WAREHOUSE_MANAGE,
    # Code.STORE_KEEPER_ASSIGN,
    # Code.STORE_KEEPER_GRANT,
    # Code.CATEGORY_MANAGE,
    # Code.ITEM_MANAGE,
    # Code.INVENTORY_VIEW,
    # Code.IT_ASSET_VIEW,
    # Code.REPORT_VIEW_INVENTORY,
    # Code.REPORT_VIEW_ASSETS,
)

_STORE_KEEPER = (
    # Code.INVENTORY_VIEW,
    # Code.INVENTORY_RECEIVE,
    # Code.INVENTORY_ISSUE,
    # Code.INVENTORY_RETURN,
    # Code.INVENTORY_STOCK_TAKE,
    # Code.INVENTORY_ADJUST,
    # Code.INVENTORY_THRESHOLD_SET,
    # Code.REPORT_VIEW_INVENTORY,
)

_REGIONAL_IT = (
    # Code.IT_STOCK_RECEIVE,
    # Code.IT_ACQUISITION_RECORD,
    # Code.IT_ASSET_VIEW,
    # Code.IT_ASSET_REGISTER,
    # Code.IT_ASSET_ASSIGN,
    # Code.IT_ASSET_RETURN,
    # Code.IT_ASSET_UPDATE,
    # Code.IT_ASSET_MAINTAIN,
    # Code.IT_ASSET_RELOCATE,
    # Code.IT_ASSET_DISPOSE,
    # Code.CATEGORY_MANAGE,
    # Code.ITEM_MANAGE,
    # Code.INVENTORY_VIEW,
    # Code.INVENTORY_THRESHOLD_SET,
    # Code.REPORT_VIEW_ASSETS,
)

_ADMINISTRATION = (
    Code.ORG_STRUCTURE_MANAGE,
    Code.LOCATION_MANAGE,
    Code.EMPLOYEE_MANAGE,
    Code.JURISDICTION_MANAGE,
    Code.ROLE_GRANT,
    Code.ROLE_GRANT_REGIONAL,
    # Code.IT_ASSET_MANAGER_APPOINT,
    Code.USER_PROVISION,
    Code.USER_MANAGE,
    # Code.WAREHOUSE_MANAGE,
    # Code.STORE_KEEPER_ASSIGN,
    # Code.STORE_KEEPER_GRANT,
    # Code.UOM_MANAGE,
    # Code.CATEGORY_MANAGE,
    # Code.ITEM_MANAGE,
    # Code.INVENTORY_VIEW,
    # Code.IT_ASSET_VIEW,
    # Code.REPORT_VIEW_INVENTORY,
    # Code.REPORT_VIEW_ASSETS,
    # Code.AUDIT_VIEW,
)

GROUP_CODES = {
    SUPER_ADMIN_GROUP: (*_ADMINISTRATION, Code.ROLE_GRANT_PRIVILEGED),
    ADMIN_GROUP: _ADMINISTRATION,
    # VIEWER_GROUP: (Code.INVENTORY_VIEW, Code.REPORT_VIEW_INVENTORY),
    ROLE_GROUPS[Role.REGIONAL_REPRESENTATIVE.value]: (
        Code.USER_PROVISION,
        Code.USER_MANAGE,
        Code.ROLE_GRANT,
        # Code.STORE_KEEPER_ASSIGN,
        # Code.STORE_KEEPER_GRANT,
        # Code.INVENTORY_VIEW,
        # Code.REPORT_VIEW_INVENTORY,
    ),
    ROLE_GROUPS[Role.MANAGER.value]: _MANAGEMENT,
    ROLE_GROUPS[Role.CHIEF_OF_SERVICE.value]: _MANAGEMENT,
    ROLE_GROUPS[Role.EMPLOYEE.value]: (),
    COMPUTING_CHIEF_GROUP: (Code.IT_ASSET_MANAGER_APPOINT, *_REGIONAL_IT),
    RESPONSIBILITY_GROUPS[ResponsibilityCode.STORE_KEEPER.value]: _STORE_KEEPER,
    RESPONSIBILITY_GROUPS[ResponsibilityCode.IT_ASSET_MANAGER.value]: _REGIONAL_IT,
}

MANAGED_GROUPS = frozenset(GROUP_CODES)
MANAGED_PREFIXES = ("role:", "resp:", "post:")

# def sync_group_permissions(using="default"):
#     """Makes every group in GROUP_CODES exist with exactly its permission set."""
#     for name, codes in GROUP_CODES.items():
#         group, _ = Group.objects.using(using).get_or_create(name=name)
#         permissions = []
#         for code in codes:
#             app_label, codename = code.value.split(".")
#             permissions.append(
#                 Permission.objects.using(using).get(
#                     content_type__app_label=app_label, codename=codename
#                 )
#             )
#         group.permissions.set(permissions)

def sync_group_permissions(using="default"):
    """Makes every group in GROUP_CODES exist with exactly its permission set."""
    for name, codes in GROUP_CODES.items():
        group, _ = Group.objects.using(using).get_or_create(name=name)
        permissions = []

        for code in codes:
            app_label, codename = code.value.split(".")

            try:
                permission = Permission.objects.using(using).get(
                    content_type__app_label=app_label,
                    codename=codename,
                )
            except Permission.DoesNotExist:
                raise LookupError(
                    f"Permission '{code.value}' does not exist. "
                    f"Required by group '{name}'."
                )

            permissions.append(permission)

        group.permissions.set(permissions)

def sync_responsibilities(using="default"):
    """Makes the Responsibility rows exist, each tied to its group."""
    responsibility_model = django_apps.get_model("accounts", "Responsibility")
    if responsibility_model._meta.db_table not in connections[using].introspection.table_names():
        return  # migrated to a point before the table existed
    for code in ResponsibilityCode:
        group = Group.objects.using(using).get(name=RESPONSIBILITY_GROUPS[code.value])
        responsibility_model.objects.using(using).update_or_create(
            code=code.value, defaults={"name": code.label, "group": group}
        )

def resync_memberships(using="default"):
    from ..services.groups import sync

    user_model = django_apps.get_model("accounts", "User")
    for user in user_model.objects.using(using).all():
        sync(user)

def _schema_is_current(state_apps):
    """Whether the database was migrated to the roles this code knows. After migrating
    backwards (or partway), profiles may hold roles, or lack columns, that the services
    cannot read: memberships are then left alone."""
    if state_apps is None:
        return False
    try:
        profile = state_apps.get_model("accounts", "UserProfile")
    except LookupError:
        return False
    names = {field.name for field in profile._meta.get_fields()}
    if "role_region" not in names:
        return False
    choices = {value for value, _ in profile._meta.get_field("role").choices}
    from ..choices import PROFILE_ROLES

    return choices == set(PROFILE_ROLES)

def delete_obsolete_groups(using="default"):
    """Deletes the groups this module once owned and no longer defines, such as the group
    of a renamed role. Run after `resync_memberships`, so nobody relies on them."""
    obsolete = Group.objects.using(using).exclude(name__in=MANAGED_GROUPS)
    for prefix in MANAGED_PREFIXES:
        obsolete.filter(name__startswith=prefix).delete()


def seed_groups(sender, using="default", **kwargs):
    """post_migrate receiver: runs once per migrate, when the accounts app is signalled."""
    if sender.label != "accounts":
        return
    for app_config in django_apps.get_app_configs():
        create_permissions(app_config, verbosity=0, using=using)
    sync_group_permissions(using)
    sync_responsibilities(using)
    if _schema_is_current(kwargs.get("apps")):
        resync_memberships(using)
        delete_obsolete_groups(using)
