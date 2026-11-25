/** Mirrors backend/apps/employees/serializers.py::EmployeeOutput. */

import type { Ref } from '@/features/auth/types';

export type Employee = {
  id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  email: string | null;
  telephone: string;
  region: Ref;
  office: Ref;
  department: Ref;
  work_location: { id: string; name: string } | null;
  is_active: boolean;
};

/** One item an employee holds (backend/apps/assets/serializers.py::EmployeeAssetOutput). */
export type EmployeeAsset = {
  assignment_id: string;
  asset: {
    id: string;
    asset_tag: string;
    item: string;
    asset_class: string;
    status: string;
  };
  location: { id: string; name: string };
  assigned_at: string;
};

/** What the backend lists when it refuses to deactivate an employee who holds equipment. */
export type HeldAsset = {
  id: string;
  asset_tag: string;
  item: string;
};

export function fullName(
  employee: Pick<Employee, 'first_name' | 'last_name'>,
): string {
  return `${employee.first_name} ${employee.last_name}`;
}
