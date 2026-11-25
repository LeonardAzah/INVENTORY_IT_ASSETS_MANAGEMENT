import type { Option } from '@/components/shared/select-field';
import type { PersonRef } from '@/features/accounts/types';
import type { Ref } from '@/features/auth/types';

export type WarehouseType = 'GENERAL' | 'IT';

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  type: WarehouseType;
  region: Ref;
  office: Ref;
  department: Ref | null;
  is_active: boolean;
  is_regional_store: boolean;
  store_keeper: (PersonRef & { assigned_at: string }) | null;
  created_at: string;
};

export type Assignment = {
  id: string;
  user: PersonRef;
  assigned_by: PersonRef;
  assigned_at: string;
  ended_by: PersonRef | null;
  ended_at: string | null;
  end_reason: string;
};

export const TYPE_LABELS: Record<WarehouseType, string> = {
  GENERAL: 'General',
  IT: 'IT',
};

export const TYPE_OPTIONS: Option[] = (
  Object.keys(TYPE_LABELS) as WarehouseType[]
).map((type) => ({
  value: type,
  label: TYPE_LABELS[type],
}));

export const KEEPER_OPTIONS: Option[] = [
  { value: 'true', label: 'Has a Store Keeper' },
  { value: 'false', label: 'No Store Keeper' },
];
