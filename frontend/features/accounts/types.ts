import type { Option } from '@/components/shared/select-field';
import {
  RESPONSIBILITY_LABELS,
  ROLE_LABELS,
  type EmployeeSummary,
  type Jurisdiction,
  type ProfileStatus,
  type Ref,
  type Responsibility,
  type ResponsibilityCode,
  type Role,
} from '@/features/auth/types';

export type Account = {
  id: string;
  email: string;
  role: Role;
  role_region: Ref | null;
  is_computing_chief: boolean;
  status: ProfileStatus;
  employee: EmployeeSummary;
  created_at: string;
};

export type AccountDetail = Account & {
  responsibilities: Responsibility[];
  jurisdictions: Jurisdiction[];
};

export type PersonRef = {
  account_id: string;
  email: string;
  name: string;
  matricule: string | null;
};

export type ItStaff = {
  computing_chief: PersonRef | null;
  it_asset_manager: PersonRef | null;
  it_warehouse: Ref | null;
  regional_representative: PersonRef | null;
  vacancies: string[];
};

export type JurisdictionLevel = 'region' | 'office' | 'department';
export type GrantableRole = {
  role: Role;
  label: string;
  jurisdiction: JurisdictionLevel | null;
};

export const STATUS_LABELS: Record<ProfileStatus, string> = {
  INVITED: 'Invited',
  ACTIVE: 'Active',
  DEACTIVATED: 'Deactivated',
};

export const ROLE_OPTIONS: Option[] = (Object.keys(ROLE_LABELS) as Role[])
  .filter((role) => role !== 'SUPER_ADMIN')
  .map((role) => ({ value: role, label: ROLE_LABELS[role] }));

export const STATUS_OPTIONS: Option[] = (
  Object.keys(STATUS_LABELS) as ProfileStatus[]
).map((status) => ({
  value: status,
  label: STATUS_LABELS[status],
}));

export const RESPONSIBILITY_OPTIONS: Option[] = (
  Object.keys(RESPONSIBILITY_LABELS) as ResponsibilityCode[]
).map((code) => ({ value: code, label: RESPONSIBILITY_LABELS[code] }));

export function accountName(account: Pick<Account, 'employee'>): string {
  return `${account.employee.first_name} ${account.employee.last_name}`;
}

export function jurisdictionLabel(jurisdiction: Jurisdiction): string {
  if (jurisdiction.department) {
    return `${jurisdiction.department.name} department, ${jurisdiction.office?.name ?? jurisdiction.region.name}`;
  }
  if (jurisdiction.office) {
    return `${jurisdiction.office.name}, ${jurisdiction.region.name}`;
  }
  return `${jurisdiction.region.name} region`;
}
