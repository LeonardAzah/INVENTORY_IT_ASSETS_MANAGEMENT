/** Mirrors backend/apps/assets/serializers.py (acquisitions, registration) and the pending-registration view. */

import type { Option } from '@/components/shared/select-field';
import type { Ref } from '@/features/auth/types';
import type { AssetClass } from '@/features/catalogue/types';

export type AssetSource = 'RECEIPT' | 'ALTERNATIVE_ACQUISITION' | 'DISCOVERED';

export const SOURCE_LABELS: Record<AssetSource, string> = {
  RECEIPT: 'Receipt',
  ALTERNATIVE_ACQUISITION: 'Acquisition',
  DISCOVERED: 'Discovery',
};

/** The two places units wait to be registered from. */
export const PENDING_SOURCE_OPTIONS: Option[] = [
  { value: 'RECEIPT', label: 'From a receipt' },
  { value: 'ALTERNATIVE_ACQUISITION', label: 'From an acquisition' },
];

/** An item as shown on an asset or an acquisition (AssetItemRef). */
export type AssetItemRef = {
  id: string;
  code: string;
  name: string;
  asset_class: AssetClass;
  brand: string;
  model: string;
};

/**
 * A receipt line or an acquisition that still has units without an asset record.
 * Quantities here are whole numbers: IT equipment is counted one by one.
 */
export type PendingRow = {
  source_type: 'RECEIPT' | 'ALTERNATIVE_ACQUISITION';
  receipt_line_id: string | null;
  acquisition_id: string | null;
  reference: string;
  date: string;
  region: Ref;
  item: Ref;
  quantity: number;
  registered: number;
  remaining: number;
};

/** IT equipment that arrived outside the IT warehouse's receipts. */
export type Acquisition = {
  id: string;
  reference: string;
  region: Ref;
  item: AssetItemRef;
  quantity: number;
  registered_quantity: number;
  remaining: number;
  acquisition_date: string;
  source: string;
  notes: string;
  recorded_by: string;
  recorded_at: string;
};

/** Free-text specifications of a computer (ComputerDetails). */
export type ComputerDetails = {
  operating_system: string;
  license_status: string;
  processor: string;
  ram: string;
  storage: string;
  dvd: string;
  domain_id: string;
  deployment_date: string | null;
  anydesk_id: string;
};

/** The text fields of the computer details, in the order they are shown, with their length limits. */
export const COMPUTER_TEXT_FIELDS: {
  name: Exclude<keyof ComputerDetails, 'deployment_date'>;
  label: string;
  max: number;
}[] = [
  { name: 'operating_system', label: 'Operating system', max: 100 },
  { name: 'license_status', label: 'Licence status', max: 100 },
  { name: 'processor', label: 'Processor', max: 100 },
  { name: 'ram', label: 'Memory (RAM)', max: 50 },
  { name: 'storage', label: 'Storage', max: 100 },
  { name: 'dvd', label: 'DVD drive', max: 50 },
  { name: 'domain_id', label: 'Domain ID', max: 100 },
  { name: 'anydesk_id', label: 'AnyDesk ID', max: 50 },
];

export type AssigneeType = 'EMPLOYEE' | 'DEPARTMENT' | 'LOCATION';

export const ASSIGNEE_OPTIONS: Option[] = [
  { value: 'EMPLOYEE', label: 'An employee' },
  { value: 'DEPARTMENT', label: 'A department' },
  { value: 'LOCATION', label: 'A place only (shared equipment)' },
];

export type AssetStatus =
  | 'UNKNOWN'
  | 'AVAILABLE'
  | 'ASSIGNED'
  | 'RETURNED'
  | 'MAINTENANCE'
  | 'DAMAGED'
  | 'LOST'
  | 'RETIRED';

/** Labels as the backend names them (assets/choices.py). */
export const STATUS_LABELS: Record<AssetStatus, string> = {
  UNKNOWN: 'Unknown (to be verified)',
  AVAILABLE: 'Available',
  ASSIGNED: 'Assigned',
  RETURNED: 'Returned (to be inspected)',
  MAINTENANCE: 'Under maintenance',
  DAMAGED: 'Damaged',
  LOST: 'Lost',
  RETIRED: 'Retired',
};

export const STATUS_OPTIONS: Option[] = (
  Object.keys(STATUS_LABELS) as AssetStatus[]
).map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

export const statusLabel = (status: string) =>
  STATUS_LABELS[status as AssetStatus] ?? status;

/**
 * Which status may follow which (assets/state_machine.py). Used only to offer the choices
 * the backend will accept; the backend decides, and names the allowed ones when it refuses.
 */
export const NEXT_STATUSES: Record<AssetStatus, AssetStatus[]> = {
  UNKNOWN: ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'DAMAGED', 'RETIRED'],
  AVAILABLE: ['ASSIGNED', 'MAINTENANCE', 'DAMAGED', 'LOST', 'RETIRED'],
  ASSIGNED: [
    'ASSIGNED',
    'RETURNED',
    'MAINTENANCE',
    'DAMAGED',
    'LOST',
    'RETIRED',
  ],
  RETURNED: ['AVAILABLE', 'MAINTENANCE', 'DAMAGED', 'RETIRED'],
  MAINTENANCE: ['AVAILABLE', 'DAMAGED', 'LOST', 'RETIRED'],
  DAMAGED: ['MAINTENANCE', 'RETIRED'],
  LOST: ['RETIRED', 'UNKNOWN'],
  RETIRED: [],
};

/** Statuses reached through their own operation (assign, return, found), never through "change status". */
export const DEDICATED_STATUSES: AssetStatus[] = [
  'ASSIGNED',
  'RETURNED',
  'UNKNOWN',
];
/** Losing or retiring an asset needs its own permission. */
export const DISPOSAL_STATUSES: AssetStatus[] = ['LOST', 'RETIRED'];

export const SOURCE_OPTIONS: Option[] = (
  Object.keys(SOURCE_LABELS) as AssetSource[]
).map((value) => ({
  value,
  label: SOURCE_LABELS[value],
}));

export type AssetAssignment = {
  id: string;
  assignee_type: AssigneeType;
  employee: {
    id: string;
    matricule: string;
    first_name: string;
    last_name: string;
  } | null;
  department: Ref | null;
  location: { id: string; name: string };
  assigned_at: string;
  notes: string;
};

/** One physical unit of IT equipment (AssetOutput). */
export type Asset = {
  id: string;
  asset_tag: string;
  item: AssetItemRef;
  region: Ref;
  serial_number: string;
  lot_number: string;
  status: AssetStatus;
  source: AssetSource;
  /** Set exactly while the unit is held by the IT warehouse. */
  custody_warehouse: Ref | null;
  /** Where the unit is when it is out of the warehouse. */
  location: { id: string; name: string } | null;
  assignment: AssetAssignment | null;
  critical_observations: string;
  /** Null unless the item is a computer. */
  computer_details: ComputerDetails | null;
  registered_at: string;
  updated_at: string;
};

/** Who or what an asset is with, in a few words. */
export function holderOf(
  asset: Pick<Asset, 'assignment' | 'custody_warehouse' | 'location'>,
): string {
  const { assignment } = asset;
  if (assignment?.employee) {
    return `${assignment.employee.first_name} ${assignment.employee.last_name}`;
  }
  if (assignment?.department) {
    return assignment.department.name;
  }
  if (assignment) {
    return assignment.location.name;
  }
  if (asset.custody_warehouse) {
    return asset.custody_warehouse.name;
  }
  return asset.location?.name ?? '–';
}

/** An asset as shown inside another record (AssetRef). */
export type AssetRef = {
  id: string;
  asset_tag: string;
  /** The item's name. */
  item: string;
  asset_class: AssetClass;
  status: AssetStatus;
};

export type EventType =
  | 'REGISTERED'
  | 'STATUS_CHANGED'
  | 'SPEC_CHANGED'
  | 'RELOCATED'
  | 'ASSIGNED'
  | 'RETURNED'
  | 'FOUND';

export const EVENT_LABELS: Record<EventType, string> = {
  REGISTERED: 'Registered',
  STATUS_CHANGED: 'Status changed',
  SPEC_CHANGED: 'Details changed',
  RELOCATED: 'Relocated',
  ASSIGNED: 'Assigned',
  RETURNED: 'Returned',
  FOUND: 'Found',
};

/** One line of an asset's timeline. It can never be changed or removed. */
export type AssetEvent = {
  id: string;
  event_type: EventType;
  from_status: string;
  to_status: string;
  reason: string;
  /** What the event recorded besides the status. For "Details changed": the values before and after. */
  details: Record<string, unknown>;
  /** The email of the account that did it. */
  actor: string;
  occurred_at: string;
};

export type RelationshipKind = 'PERIPHERAL_OF' | 'SHARED_PRINTER_FOR';

export const RELATIONSHIP_LABELS: Record<RelationshipKind, string> = {
  PERIPHERAL_OF: 'Peripheral of',
  SHARED_PRINTER_FOR: 'Shared printer for',
};

/**
 * What each kind links (assets/services/relationships.py::RULES): the classes the first
 * asset may have. The other asset is always a computer.
 */
export const RELATIONSHIP_FROM: Record<RelationshipKind, AssetClass[]> = {
  PERIPHERAL_OF: ['KEYBOARD', 'MOUSE', 'MONITOR', 'UPS'],
  SHARED_PRINTER_FOR: ['PRINTER'],
};

/** A link between two assets: `asset` is the peripheral or printer, `related_asset` the computer. */
export type Relationship = {
  id: string;
  kind: RelationshipKind;
  asset: AssetRef;
  related_asset: AssetRef;
  created_at: string;
  ended_at: string | null;
};
