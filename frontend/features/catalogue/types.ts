/** Mirrors backend/apps/items/serializers.py (units, categories, items, specification templates). */

import type { Option } from '@/components/shared/select-field';
import { TYPE_LABELS, type WarehouseType } from '@/features/warehouses/types';

export type Unit = {
  id: string;
  code: string;
  name: string;
  /** 0 means the unit counts whole things; up to 3. */
  decimal_places: number;
  is_active: boolean;
};

export type TemplateRef = { id: string; code: string; name: string };

export type Category = {
  id: string;
  name: string;
  warehouse_type: WarehouseType;
  is_predefined: boolean;
  is_active: boolean;
  /** The specifications its items describe, or null when they have none. */
  specification_template: TemplateRef | null;
};

export type SpecDataType =
  | 'TEXT'
  | 'INTEGER'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'CHOICE'
  | 'MULTI_CHOICE'
  | 'MEASURE';

export type SpecificationField = {
  id: string;
  /** The key of its value in `Item.specifications`. Fixed. */
  key: string;
  label: string;
  /** Fixed once the field exists. */
  data_type: SpecDataType;
  required: boolean;
  /** CHOICE and MULTI_CHOICE only, in display order. */
  choices: string[];
  /** Decimal strings, or null. */
  min_value: string | null;
  max_value: string | null;
  /** DECIMAL and MEASURE only. */
  decimal_places: number;
  /** e.g. "m" or "GB"; always set for MEASURE. */
  unit_label: string;
  help_text: string;
  sort_order: number;
  /** An inactive field is no longer offered; the values items hold for it are kept. */
  is_active: boolean;
};

export type SpecificationTemplate = {
  id: string;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
  /** Every field, inactive ones included, in display order. */
  fields: SpecificationField[];
};

/** A stored value: text, a whole number, a decimal string, yes/no, or a list of choices. */
export type SpecValue = string | number | boolean | string[];

export type Tracking = 'QUANTITY' | 'SERIALIZED';
export type AssetClass =
  'COMPUTER' | 'PRINTER' | 'MONITOR' | 'UPS' | 'KEYBOARD' | 'MOUSE' | 'OTHER';

export type Item = {
  id: string;
  code: string;
  name: string;
  description: string;
  category: {
    id: string;
    name: string;
    specification_template_id: string | null;
  };
  unit: { id: string; code: string; name: string; decimal_places: number };
  warehouse_type: WarehouseType;
  tracking: Tracking;
  asset_class: AssetClass | null;
  brand: string;
  model: string;
  /** Keyed by the fields of the category's template; {} when it has none. */
  specifications: Record<string, SpecValue>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Set on the response to a save, e.g. when another item has the same name. */
  warnings: string[];
};

export const TRACKING_LABELS: Record<Tracking, string> = {
  QUANTITY: 'By quantity',
  SERIALIZED: 'Serialized',
};

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  COMPUTER: 'Computer',
  PRINTER: 'Printer',
  MONITOR: 'Monitor',
  UPS: 'UPS',
  KEYBOARD: 'Keyboard',
  MOUSE: 'Mouse',
  OTHER: 'Other',
};

export const ASSET_CLASS_OPTIONS: Option[] = (
  Object.keys(ASSET_CLASS_LABELS) as AssetClass[]
).map((value) => ({ value, label: ASSET_CLASS_LABELS[value] }));

/**
 * How a general item is tracked (items/services/items.py::_check_consistency). An IT item
 * is always serialized and its units become assets; a general item is counted by quantity,
 * or serialized: each unit is then received with its serial number, and stays stock.
 */
export const GENERAL_TRACKING_OPTIONS: Option[] = [
  { value: 'QUANTITY', label: 'By quantity' },
  { value: 'SERIALIZED', label: 'Serialized: each unit has a serial number' },
];

/** The tracking an item of this type gets: an IT item has no choice. */
export function trackingFor(type: WarehouseType, chosen: string): Tracking {
  return type === 'IT' || chosen === 'SERIALIZED' ? 'SERIALIZED' : 'QUANTITY';
}

export const PREDEFINED_OPTIONS: Option[] = [
  { value: 'true', label: 'Predefined' },
  { value: 'false', label: 'Added later' },
];

export function typeLabel(type: WarehouseType): string {
  return TYPE_LABELS[type] ?? type;
}

/** How a unit counts, in words. */
export function precisionLabel(decimalPlaces: number): string {
  if (decimalPlaces === 0) return 'Whole units';
  return decimalPlaces === 1
    ? '1 decimal place'
    : `${decimalPlaces} decimal places`;
}

export const SPEC_TYPE_LABELS: Record<SpecDataType, string> = {
  TEXT: 'Text',
  INTEGER: 'Whole number',
  DECIMAL: 'Decimal number',
  BOOLEAN: 'Yes or no',
  CHOICE: 'One of a list',
  MULTI_CHOICE: 'Several of a list',
  MEASURE: 'Measure (number with a unit)',
};

export const SPEC_TYPE_OPTIONS: Option[] = (
  Object.keys(SPEC_TYPE_LABELS) as SpecDataType[]
).map((value) => ({
  value,
  label: SPEC_TYPE_LABELS[value],
}));
