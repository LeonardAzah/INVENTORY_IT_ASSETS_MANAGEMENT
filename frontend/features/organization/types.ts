/** Mirrors backend/apps/warehouses/serializers.py (regions, offices, departments, locations). */

import type { Option } from '@/components/shared/select-field';
import type { Ref } from '@/features/auth/types';

export type Region = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type OfficeKind = 'REGIONAL_OFFICE' | 'COMMERCIAL_CENTER';

export type Office = {
  id: string;
  code: string;
  name: string;
  town: string;
  kind: OfficeKind;
  region: Ref;
  parent: Ref | null;
  is_active: boolean;
};

export type DepartmentKind = 'DEPARTMENT' | 'REGIONAL_IT' | 'CENTER_UNIT';

export type Department = {
  id: string;
  code: string;
  name: string;
  kind: DepartmentKind;
  office: Ref;
  region: Ref;
  is_active: boolean;
};

export type Location = {
  id: string;
  name: string;
  office: Ref;
  region: Ref;
  department: Ref | null;
  is_default: boolean;
  is_active: boolean;
};

/** Labels as the backend names them (warehouses/choices.py). */
export const OFFICE_KIND_LABELS: Record<OfficeKind, string> = {
  REGIONAL_OFFICE: 'Regional office',
  COMMERCIAL_CENTER: 'Commercial center',
};

export const DEPARTMENT_KIND_LABELS: Record<DepartmentKind, string> = {
  DEPARTMENT: 'Department',
  REGIONAL_IT: 'Regional IT department',
  CENTER_UNIT: 'Commercial center unit',
};

/**
 * Which kinds of department each kind of office may hold
 * (warehouses/services/departments.py::ALLOWED_KINDS). Used to offer only choices the
 * backend will accept; the backend still decides.
 */
export const DEPARTMENT_KINDS_BY_OFFICE_KIND: Record<
  OfficeKind,
  DepartmentKind[]
> = {
  REGIONAL_OFFICE: ['DEPARTMENT', 'REGIONAL_IT'],
  COMMERCIAL_CENTER: ['CENTER_UNIT'],
};

export const ACTIVE_OPTIONS: Option[] = [
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
];

export const OFFICE_KIND_OPTIONS: Option[] = (
  Object.keys(OFFICE_KIND_LABELS) as OfficeKind[]
).map((kind) => ({ value: kind, label: OFFICE_KIND_LABELS[kind] }));

export const DEPARTMENT_KIND_OPTIONS: Option[] = (
  Object.keys(DEPARTMENT_KIND_LABELS) as DepartmentKind[]
).map((kind) => ({ value: kind, label: DEPARTMENT_KIND_LABELS[kind] }));

/** A record named by its code as well as its name: names are not unique, codes are. */
export function refLabel(ref: { code: string; name: string }): string {
  return `${ref.name} (${ref.code})`;
}
