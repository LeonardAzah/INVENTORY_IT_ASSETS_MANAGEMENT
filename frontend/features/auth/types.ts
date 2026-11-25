export type Ref = {
  id: string;
  code: string;
  name: string;
};

export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'VIEWER'
  | 'REGIONAL_REPRESENTATIVE'
  | 'MANAGER'
  | 'CHIEF_OF_SERVICE'
  | 'EMPLOYEE';
export type ProfileStatus = 'INVITED' | 'ACTIVE' | 'DEACTIVATED';
export type ResponsibilityCode = 'STORE_KEEPER' | 'IT_ASSET_MANAGER';

export type EmployeeSummary = {
  id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  region: Ref;
  office: Ref;
  department: Ref;
};

export type Responsibility = {
  code: ResponsibilityCode;
  region: Ref | null;
  granted_at: string;
};

export type Jurisdiction = {
  id: string;
  region: Ref;
  office: Ref | null;
  department: Ref | null;
  granted_at: string;
  ended_at: string | null;
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role | null;
  role_region: Ref | null;
  is_computing_chief: boolean;
  status: ProfileStatus | null;
  employee: EmployeeSummary | null;
  is_superuser: boolean;
  responsibilities: Responsibility[];
  jurisdictions: Jurisdiction[];
  it_regions: string[];
  represented_regions: string[];
  warehouse_ids: string[];
  read_only: boolean;
  permission_codes: string[];
};

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  VIEWER: 'Viewer',
  REGIONAL_REPRESENTATIVE: 'Regional Representative',
  MANAGER: 'Manager (Head of Commercial Branch)',
  CHIEF_OF_SERVICE: 'Chief of Service (Head of Department)',
  EMPLOYEE: 'Employee',
};

export const RESPONSIBILITY_LABELS: Record<ResponsibilityCode, string> = {
  STORE_KEEPER: 'Store Keeper',
  IT_ASSET_MANAGER: 'IT Asset Manager',
};

export function roleLabel(
  user: Pick<CurrentUser, 'role' | 'is_superuser'> & {
    is_computing_chief?: boolean;
  },
): string {
  if (user.is_computing_chief) {
    return 'Chief of Service of Computing';
  }
  if (user.role) {
    return ROLE_LABELS[user.role] ?? user.role;
  }
  return user.is_superuser ? ROLE_LABELS.SUPER_ADMIN : 'No role';
}
