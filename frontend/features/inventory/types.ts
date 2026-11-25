/** Mirrors backend/apps/inventory/serializers.py (balances and the ledger). */

import type { Option } from '@/components/shared/select-field';
import type { Ref } from '@/features/auth/types';

/** An item as it appears inside stock rows (items/serializers.py::ItemRef). */
export type ItemRef = {
  id: string;
  code: string;
  name: string;
  /** The unit's code, e.g. "EA". */
  unit: string;
  /** How many decimals a quantity of this item may have. */
  decimal_places: number;
  /** A serialized general item: stock lines name its units by serial number. */
  tracks_units: boolean;
};

/** One unit of a serialized general item, as named on a document line. */
export type UnitRef = { id: string; serial_number: string };

/** What a warehouse holds of one item. Quantities are decimal strings, never numbers. */
export type Balance = {
  id: string;
  warehouse: Ref;
  item: ItemRef;
  on_hand: string;
  /** The part of what is on hand that cannot be issued (damaged returns). */
  unavailable: string;
  available: string;
  threshold: string | null;
  /** True once available stock has dropped to the threshold. */
  below_threshold: boolean;
  last_movement_at: string | null;
};

export type TransactionType =
  | 'RECEIPT'
  | 'ISSUE'
  | 'RETURN'
  | 'ADJUSTMENT'
  | 'OPENING_BALANCE'
  | 'ASSET_OUT'
  | 'ASSET_IN'
  | 'ASSET_WRITE_OFF';

/** One line of the ledger. It can never be changed or removed. */
export type Transaction = {
  id: string;
  warehouse: Ref;
  item: ItemRef;
  type: TransactionType;
  quantity_delta: string;
  unavailable_delta: string;
  on_hand_after: string;
  unavailable_after: string;
  source_type: string;
  source_id: string | null;
  reference: string;
  /** The email of the account that recorded the movement. */
  actor: string;
  occurred_at: string;
};

/** Labels as the backend names them (inventory/choices.py). */
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  RECEIPT: 'Receipt',
  ISSUE: 'Issue',
  RETURN: 'Return',
  ADJUSTMENT: 'Adjustment',
  OPENING_BALANCE: 'Opening balance',
  ASSET_OUT: 'Asset left the warehouse',
  ASSET_IN: 'Asset entered the warehouse',
  ASSET_WRITE_OFF: 'Asset written off',
};

export const TRANSACTION_TYPE_OPTIONS: Option[] = (
  Object.keys(TRANSACTION_TYPE_LABELS) as TransactionType[]
).map((type) => ({ value: type, label: TRANSACTION_TYPE_LABELS[type] }));

export const LOW_STOCK_OPTIONS: Option[] = [
  { value: 'true', label: 'Low on stock' },
  { value: 'false', label: 'Not low on stock' },
];

export const UNAVAILABLE_OPTIONS: Option[] = [
  { value: 'true', label: 'With unavailable stock' },
  { value: 'false', label: 'Without unavailable stock' },
];

/** One line of a receipt (inventory/serializers.py::ReceiptLineOutput). */
export type ReceiptLine = {
  id: string;
  item: ItemRef;
  quantity: string;
  /** Units of this line already registered as IT assets. Stays at zero in a general warehouse. */
  registered_quantity: string;
  /** The units it brought, for a serialized general item; empty otherwise. */
  units: UnitRef[];
};

/** Goods that arrived in a warehouse. Once recorded it can never be changed or removed. */
export type Receipt = {
  id: string;
  reference: string;
  warehouse: Ref;
  /** The date on the delivery, `YYYY-MM-DD`. It may be earlier than the day it was recorded. */
  receipt_date: string;
  source: string;
  notes: string;
  lines: ReceiptLine[];
  /** The email of the account that recorded it. */
  created_by: string;
  created_at: string;
};

/** An employee as named on a stock document (inventory/serializers.py::EmployeeRef). */
export type EmployeeRef = {
  id: string;
  matricule: string;
  first_name: string;
  last_name: string;
};

export const employeeName = (employee: EmployeeRef) =>
  `${employee.first_name} ${employee.last_name}`;

export type IssueLine = {
  id: string;
  item: ItemRef;
  quantity: string;
  /** How much of this line has come back on returns linked to the issue. */
  returned_quantity: string;
  /** The units that left on it, for a serialized general item; empty otherwise. */
  units: UnitRef[];
};

/**
 * Stock handed from a general warehouse to one recipient: an employee, or another general
 * store of the region that asked for it (requirements 1.1). It can never be changed or removed.
 */
export type Issue = {
  id: string;
  reference: string;
  warehouse: Ref;
  issue_date: string;
  /** Exactly one of `employee` and `recipient_store` is set. */
  employee: EmployeeRef | null;
  recipient_store: Ref | null;
  notes: string;
  lines: IssueLine[];
  created_by: string;
  created_at: string;
};

export type ReturnCondition = 'GOOD' | 'DAMAGED';

export const CONDITION_LABELS: Record<ReturnCondition, string> = {
  GOOD: 'Good',
  DAMAGED: 'Damaged',
};

export const CONDITION_OPTIONS: Option[] = (
  Object.keys(CONDITION_LABELS) as ReturnCondition[]
).map((value) => ({
  value,
  label: CONDITION_LABELS[value],
}));

export const LINKED_OPTIONS: Option[] = [
  { value: 'true', label: 'Linked to an issue' },
  { value: 'false', label: 'Not linked to an issue' },
];

export type ReturnLine = {
  id: string;
  item: ItemRef;
  quantity: string;
  /** Good units can be issued again; damaged ones are on hand but unavailable. */
  condition: ReturnCondition;
  units: UnitRef[];
};

/** Stock taken back from an employee. It can never be changed or removed. */
export type StockReturn = {
  id: string;
  reference: string;
  warehouse: Ref;
  return_date: string;
  employee: EmployeeRef;
  /** The issue this return was booked against, if any. */
  issue: { id: string; reference: string } | null;
  notes: string;
  lines: ReturnLine[];
  created_by: string;
  created_at: string;
};

export type AdjustmentKind =
  | 'QUANTITY'
  | 'WRITE_OFF_UNAVAILABLE'
  | 'RESTORE_UNAVAILABLE'
  | 'OPENING_BALANCE';

/** Labels as the backend names them (inventory/choices.py). */
export const ADJUSTMENT_KIND_LABELS: Record<AdjustmentKind, string> = {
  QUANTITY: 'Quantity correction',
  WRITE_OFF_UNAVAILABLE: 'Write off unavailable stock',
  RESTORE_UNAVAILABLE: 'Restore unavailable stock',
  OPENING_BALANCE: 'Opening balance',
};

export const ADJUSTMENT_KIND_OPTIONS: Option[] = (
  Object.keys(ADJUSTMENT_KIND_LABELS) as AdjustmentKind[]
).map((value) => ({
  value,
  label: ADJUSTMENT_KIND_LABELS[value],
}));

/** What each kind does to the stock, for the person choosing one. */
export const ADJUSTMENT_KIND_HELP: Record<AdjustmentKind, string> = {
  QUANTITY:
    'Corrects the quantity on hand, up or down. To reduce it, type a minus sign first, such as -3.',
  WRITE_OFF_UNAVAILABLE:
    'Removes damaged units from the warehouse. They leave both the unavailable stock and the quantity on hand.',
  RESTORE_UNAVAILABLE:
    'Makes damaged units available again. The quantity on hand does not change.',
  OPENING_BALANCE:
    'The first quantity of an item that has never moved in this warehouse.',
};

/** A correction of stock, with its reason. It can never be changed or removed. */
export type Adjustment = {
  id: string;
  reference: string;
  warehouse: Ref;
  item: ItemRef;
  kind: AdjustmentKind;
  /** The change in the quantity on hand, signed. */
  quantity_delta: string;
  /** The change in the unavailable part, signed. */
  unavailable_delta: string;
  previous_on_hand: string;
  resulting_on_hand: string;
  reason: string;
  /** The id of the stock-take line that caused it, when a stock-take did. */
  stock_take_line: string | null;
  /** The units it named, for a serialized general item; empty otherwise. */
  units: UnitRef[];
  created_by: string;
  created_at: string;
};

export type StockTakeStatus = 'DRAFT' | 'COMPLETED' | 'CANCELLED';

export const STOCK_TAKE_STATUS_LABELS: Record<StockTakeStatus, string> = {
  DRAFT: 'Open',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const STOCK_TAKE_STATUS_OPTIONS: Option[] = (
  Object.keys(STOCK_TAKE_STATUS_LABELS) as StockTakeStatus[]
).map((value) => ({
  value,
  label: STOCK_TAKE_STATUS_LABELS[value],
}));

/** One item counted during a stock-take. */
export type StockTakeLine = {
  id: string;
  item: ItemRef;
  counted_quantity: string;
  /** What the system held when the count was entered. */
  system_quantity_at_count: string;
  /** Counted less system, signed, worked out by the backend. */
  difference: string;
  counted_at: string;
  /** The adjustment made for this line when the stock-take was completed, if its count differed. */
  adjustment: { id: string; reference: string } | null;
  /** Every adjustment it made: a serialized item can make two, units found and units missing. */
  adjustments: { id: string; reference: string }[];
  /** Whether completing adjusts (or adjusted) this line. */
  differs: boolean;
  /** A serialized general item: the serial numbers scanned. */
  serials: { serial_number: string; unit_id: string | null }[];
  /** While the count is open: the units completing would write off (in stock, not scanned). */
  missing: UnitRef[];
  /** While the count is open: the scanned serials completing would bring in. */
  found: string[];
};

/** A count of a warehouse. Open while it is being counted, then completed or cancelled. */
export type StockTake = {
  id: string;
  reference: string;
  warehouse: Ref;
  status: StockTakeStatus;
  lines: StockTakeLine[];
  started_by: string;
  started_at: string;
  /** Who completed or cancelled it. */
  completed_by: string | null;
  completed_at: string | null;
};

export type UnitStatus = 'IN_STOCK' | 'UNAVAILABLE' | 'ISSUED' | 'WRITTEN_OFF';

/** Labels as the backend names them (inventory/choices.py::StockUnitStatus). */
export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  IN_STOCK: 'In stock',
  UNAVAILABLE: 'Unavailable',
  ISSUED: 'Issued',
  WRITTEN_OFF: 'Written off',
};

export const UNIT_STATUS_OPTIONS: Option[] = (
  Object.keys(UNIT_STATUS_LABELS) as UnitStatus[]
).map((value) => ({
  value,
  label: UNIT_STATUS_LABELS[value],
}));

/** One unit of a serialized general item (inventory/serializers.py::UnitOutput). It is never an asset. */
export type StockUnit = {
  id: string;
  item: ItemRef;
  serial_number: string;
  status: UnitStatus;
  /** The warehouse holding it, or that last issued or wrote it off. */
  warehouse: Ref;
  /** Set while it is issued: one of the two. */
  issued_to_employee: EmployeeRef | null;
  issued_to_store: Ref | null;
  issue: { id: string; reference: string } | null;
  created_at: string;
  updated_at: string;
};

/** One change of a unit, tied to the ledger movement that counted it. */
export type UnitMovement = {
  id: string;
  occurred_at: string;
  type: TransactionType;
  reference: string;
  source_type: string;
  source_id: string;
  warehouse: Ref;
  /** null when the unit was first recorded by this movement. */
  from_status: UnitStatus | null;
  to_status: UnitStatus;
  actor: string;
};

export type StockUnitDetail = StockUnit & { history: UnitMovement[] };
