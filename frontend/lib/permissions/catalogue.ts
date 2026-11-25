import { can, isAdministrator, type PermissionCode } from './codes';

type Holder =
  { permission_codes?: readonly string[] | null } | null | undefined;
type CatalogueType = 'GENERAL' | 'IT';

export function manageableTypes(
  user: Holder,
  code: Extract<PermissionCode, 'CATEGORY_MANAGE' | 'ITEM_MANAGE'>,
): CatalogueType[] {
  if (!can(user, code)) {
    return [];
  }
  if (isAdministrator(user)) {
    return ['GENERAL', 'IT'];
  }
  const types: CatalogueType[] = [];
  if (can(user, 'WAREHOUSE_MANAGE')) types.push('GENERAL');
  if (can(user, 'IT_ASSET_REGISTER')) types.push('IT');
  return types;
}
