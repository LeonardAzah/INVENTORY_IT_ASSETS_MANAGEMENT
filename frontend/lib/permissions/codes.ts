export const PERMISSION_CODES = [
  'ORG_STRUCTURE_MANAGE',
  'LOCATION_MANAGE',
  'EMPLOYEE_MANAGE',
  'USER_PROVISION',
  'USER_MANAGE',
  'USER_VIEW',
  'ROLE_GRANT',
  'ROLE_GRANT_REGIONAL',
  'ROLE_GRANT_PRIVILEGED',
  'JURISDICTION_MANAGE',
  'IT_ASSET_MANAGER_APPOINT',
  'STORE_KEEPER_GRANT',
  'WAREHOUSE_MANAGE',
  'STORE_KEEPER_ASSIGN',
  'UOM_MANAGE',
  'SPEC_TEMPLATE_MANAGE',
  'CATEGORY_MANAGE',
  'ITEM_MANAGE',
  'INVENTORY_VIEW',
  'INVENTORY_RECEIVE',
  'INVENTORY_ISSUE',
  'INVENTORY_RETURN',
  'INVENTORY_STOCK_TAKE',
  'INVENTORY_ADJUST',
  'INVENTORY_THRESHOLD_SET',
  'IT_STOCK_RECEIVE',
  'IT_ACQUISITION_RECORD',
  'IT_ASSET_VIEW',
  'IT_ASSET_REGISTER',
  'IT_ASSET_ASSIGN',
  'IT_ASSET_RETURN',
  'IT_ASSET_UPDATE',
  'IT_ASSET_MAINTAIN',
  'IT_ASSET_RELOCATE',
  'IT_ASSET_DISPOSE',
  'REPORT_VIEW_INVENTORY',
  'REPORT_VIEW_ASSETS',
  'AUDIT_VIEW',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

type Holder =
  { permission_codes?: readonly string[] | null } | null | undefined;

export function can(user: Holder, code: PermissionCode): boolean {
  return (
    Array.isArray(user?.permission_codes) &&
    user.permission_codes.includes(code)
  );
}

export function isAdministrator(user: Holder): boolean {
  return can(user, 'ORG_STRUCTURE_MANAGE');
}

export function canAny(
  user: Holder,
  codes: readonly PermissionCode[],
): boolean {
  return codes.some((code) => can(user, code));
}
