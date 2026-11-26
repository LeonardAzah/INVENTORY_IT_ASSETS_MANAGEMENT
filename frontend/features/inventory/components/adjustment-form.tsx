'use client';

import { CircleAlert, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import { EntityPicker } from '@/components/shared/entity-picker';
import { Field } from '@/components/shared/form-field';
import { PageHeader } from '@/components/shared/page-header';
import { SelectField } from '@/components/shared/select-field';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { Warehouse } from '@/features/warehouses/types';
import { isApiError } from '@/lib/api/errors';
import { formatQuantity, parseQuantity } from '@/lib/format/quantity';
import { useSubmitLock } from '@/lib/forms/submit-lock';

import {
  inventoryKeys,
  searchItems,
  useBalanceList,
  useCreateAdjustment,
  useOperableWarehouses,
  type AdjustmentInput,
} from '../api';
import { isUncertainOutcome, readDocumentErrors } from '../document-errors';
import { parseSerials, serialsProblem } from '../serials';
import {
  ADJUSTMENT_KIND_HELP,
  ADJUSTMENT_KIND_LABELS,
  ADJUSTMENT_KIND_OPTIONS,
  type AdjustmentKind,
  type ItemRef,
  type UnitRef,
} from '../types';
import { BackLink, Detail } from './document-detail';
import { SerialsInput, UnitChooser } from './unit-fields';

const TEXTAREA =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive md:text-sm';

const FIELDS = [
  'warehouse_id',
  'item_id',
  'kind',
  'quantity',
  'reason',
] as const;
const BACK = { href: '/inventory/adjustments', label: 'Adjustments' };

const isKind = (value: string): value is AdjustmentKind =>
  value in ADJUSTMENT_KIND_LABELS;

type Direction = 'in' | 'out';
const DIRECTION_OPTIONS = [
  { value: 'in', label: 'Add units (found, or missing from the records)' },
  { value: 'out', label: 'Remove units (missing from the shelves)' },
];

function unitRule(
  kind: AdjustmentKind,
  direction: Direction,
): { bySerial: true } | { bySerial: false; status: string } {
  if (kind === 'OPENING_BALANCE' || (kind === 'QUANTITY' && direction === 'in'))
    return { bySerial: true };
  return {
    bySerial: false,
    status: kind === 'QUANTITY' ? 'IN_STOCK' : 'UNAVAILABLE',
  };
}

/** What the adjustment will do, in words. Nothing is worked out here: the backend applies it. */
function effect(kind: AdjustmentKind, quantity: string, item: ItemRef): string {
  const places = { decimalPlaces: item.decimal_places };
  if (kind === 'QUANTITY') {
    return `${formatQuantity(quantity, { ...places, signed: true })} ${item.unit} on hand`;
  }
  const amount = `${formatQuantity(quantity, places)} ${item.unit}`;
  if (kind === 'WRITE_OFF_UNAVAILABLE') {
    return `${amount} of unavailable stock written off`;
  }
  return kind === 'RESTORE_UNAVAILABLE'
    ? `${amount} of unavailable stock made available again`
    : `${amount} as the opening balance`;
}

export function NewAdjustment() {
  const params = useSearchParams();
  const warehouseId = params.get('warehouse') ?? '';
  const itemId = params.get('item') ?? '';
  const preset = Boolean(warehouseId && itemId);
  const warehouses = useOperableWarehouses('adjustment');
  const balance = useBalanceList(
    { warehouse: warehouseId, item: itemId, page_size: 1 },
    preset,
  );

  if (warehouses.isLoading || (preset && balance.isLoading)) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="Loading the adjustment form"
      >
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  const operable = warehouses.data ?? [];
  if (warehouses.error || operable.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink {...BACK} />
        <PageHeader title="New adjustment" />
        <div className="bg-card rounded-lg border">
          {warehouses.error ? (
            <ErrorState
              title="The warehouses could not be loaded"
              error={warehouses.error}
              onRetry={() => warehouses.refetch()}
              retrying={warehouses.isFetching}
            />
          ) : (
            <EmptyState
              title="No warehouse to adjust"
              description="The stock of a general warehouse is adjusted by its Store Keeper. No active warehouse is yours to adjust."
            />
          )}
        </div>
      </div>
    );
  }
  const found = preset ? balance.data?.results[0] : undefined;
  const usable =
    found && operable.some((warehouse) => warehouse.id === found.warehouse.id)
      ? found
      : undefined;
  return (
    <AdjustmentForm
      warehouses={operable}
      presetWarehouseId={usable?.warehouse.id ?? null}
      presetItem={usable?.item ?? null}
    />
  );
}

type FormProps = {
  warehouses: Warehouse[];
  presetWarehouseId: string | null;
  presetItem: ItemRef | null;
};

function AdjustmentForm({
  warehouses,
  presetWarehouseId,
  presetItem,
}: FormProps) {
  const router = useRouter();
  const create = useCreateAdjustment();
  const once = useSubmitLock(create.isPending);
  const [requestId] = useState(() => crypto.randomUUID());
  const [warehouseId, setWarehouseId] = useState(
    presetWarehouseId ?? (warehouses.length === 1 ? warehouses[0].id : ''),
  );
  const [item, setItem] = useState<ItemRef | null>(presetItem);
  const [kind, setKind] = useState<AdjustmentKind>('QUANTITY');
  const [quantity, setQuantity] = useState('');
  const [direction, setDirection] = useState<Direction>('in');
  const [serials, setSerials] = useState('');
  const [units, setUnits] = useState<UnitRef[]>([]);
  const [crossReason, setCrossReason] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [review, setReview] = useState<AdjustmentInput | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [done, setDone] = useState(false);
  const found = useRef(new Map<string, ItemRef>());
  const heading = useRef<HTMLHeadingElement>(null);

  const warehouse =
    warehouses.find((candidate) => candidate.id === warehouseId) ?? null;
  const stock = useBalanceList(
    { warehouse: warehouseId, item: item?.id, page_size: 1 },
    Boolean(warehouse && item),
  );
  const held = stock.data?.results[0];
  const dirty =
    quantity !== '' || reason !== '' || serials !== '' || units.length > 0;
  const rule = unitRule(kind, direction);
  const resetUnits = () => {
    setSerials('');
    setUnits([]);
    setCrossReason(null);
    clear('serials');
  };

  const reviewing = review !== null;
  useEffect(() => {
    heading.current?.focus();
  }, [reviewing]);

  useEffect(() => {
    if (!dirty || done) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, done]);

  const clear = (field: string) =>
    setErrors((current) => ({ ...current, [field]: '' }));

  const check = (): AdjustmentInput | null => {
    const problems: Record<string, string> = {};
    if (!warehouse) {
      problems.warehouse_id = 'Choose the warehouse.';
    }
    if (!item) {
      problems.item_id = 'Choose an item.';
    }
    if (item?.tracks_units) {
      const named = rule.bySerial ? parseSerials(serials) : units;
      if (rule.bySerial) {
        const problem = serialsProblem(named as string[]);
        if (problem) problems.serials = problem;
      } else if (units.length === 0) {
        problems.serials = 'Choose the units.';
      }
      if (crossReason !== null && crossReason.trim() === '') {
        problems.serials =
          'Say why these are different units, or correct the serial numbers.';
      }
      if (reason.trim() === '') {
        problems.reason = 'Say why the stock is being adjusted.';
      }
      setErrors(problems);
      const invalid = Object.keys(problems).length > 0;
      setGeneral(invalid ? 'Check the fields marked below.' : null);
      if (invalid || !warehouse) {
        return null;
      }
      const out = kind === 'QUANTITY' && direction === 'out';
      return {
        warehouse_id: warehouse.id,
        item_id: item.id,
        kind,
        quantity: `${out ? '-' : ''}${named.length}`,
        reason: reason.trim(),
        client_request_id: requestId,
        ...(rule.bySerial
          ? { serials: named as string[] }
          : { unit_ids: units.map((unit) => unit.id) }),
        ...(crossReason
          ? { cross_item_serial_reason: crossReason.trim() }
          : {}),
      };
    }
    const parsed = item
      ? parseQuantity(quantity, item.decimal_places, {
          allowNegative: kind === 'QUANTITY',
        })
      : null;
    if (parsed && !parsed.ok) {
      problems.quantity =
        kind !== 'QUANTITY' && quantity.trim().startsWith('-')
          ? 'This kind of adjustment takes a quantity without a minus sign. Only a quantity correction can go down.'
          : parsed.message;
    } else if (!item && quantity.trim() === '') {
      problems.quantity = 'Enter a quantity.';
    }
    if (reason.trim() === '') {
      problems.reason = 'Say why the stock is being adjusted.';
    }
    setErrors(problems);
    const invalid = Object.keys(problems).length > 0;
    setGeneral(invalid ? 'Check the fields marked below.' : null);
    if (invalid || !warehouse || !item || !parsed?.ok) {
      return null;
    }
    return {
      warehouse_id: warehouse.id,
      item_id: item.id,
      kind,
      quantity: parsed.value,
      reason: reason.trim(),
      client_request_id: requestId,
    };
  };

  const record = () => {
    if (!review) {
      return;
    }
    create.mutate(review, {
      onSuccess: (response) => {
        setDone(true);
        toast.success(response.message);
        router.push(`/inventory/adjustments/${response.data.id}`);
      },
      onError: (error) => {
        if (isUncertainOutcome(error)) {
          setUncertain(true);
          return;
        }
        const read = readDocumentErrors(error, [review.item_id], FIELDS);
        const [line] = read.lines;
        setErrors({
          ...read.fields,
          ...(line?.item ? { item_id: line.item } : {}),
          ...(line?.quantity ? { quantity: line.quantity } : {}),
          ...(line?.serials ? { serials: line.serials } : {}),
        });
        if (
          isApiError(error) &&
          error.errorCode === 'SERIAL_ON_OTHER_ITEM' &&
          crossReason === null
        ) {
          setCrossReason('');
        }
        setGeneral(read.general ?? 'Check the fields marked below.');
        setUncertain(false);
        setReview(null);
      },
    });
  };

  if (review && warehouse && item) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight outline-none"
          >
            Check the adjustment
          </h1>
          <p className="text-neutral-600">
            Nothing has been recorded yet. Once recorded, an adjustment cannot
            be changed or deleted: a mistake is corrected by another adjustment.
          </p>
        </div>
        {uncertain ? (
          <Alert variant="default">
            <TriangleAlert aria-hidden />
            <AlertTitle>
              We could not confirm that the adjustment was recorded
            </AlertTitle>
            <AlertDescription>
              The server did not answer, so the adjustment may or may not have
              been recorded. Try again: it is safe, because the same adjustment
              is never recorded twice. If it was already recorded, you will be
              taken to it.
            </AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>{ADJUSTMENT_KIND_LABELS[review.kind]}</CardTitle>
            <CardDescription>
              {warehouse.name} ({warehouse.code})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail term="Item">
                {item.name}{' '}
                <span className="text-neutral-600">({item.code})</span>
              </Detail>
              <Detail term="Change">
                <span className="font-medium tabular-nums">
                  {effect(review.kind, review.quantity, item)}
                </span>
              </Detail>
              {item.tracks_units ? (
                <Detail term="Units" className="sm:col-span-2">
                  <span className="font-mono wrap-break-word">
                    {(
                      review.serials ?? units.map((unit) => unit.serial_number)
                    ).join(', ')}
                  </span>
                </Detail>
              ) : null}
              <Detail term="Reason" className="sm:col-span-2">
                <span className="whitespace-pre-line">{review.reason}</span>
              </Detail>
            </dl>
          </CardContent>
        </Card>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {/* After an uncertain outcome the adjustment may already exist as shown here, so it can no longer be edited. */}
          {uncertain ? (
            <Button variant="outline" onClick={() => router.push(BACK.href)}>
              Leave and check the adjustments
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={create.isPending}
              onClick={() => setReview(null)}
            >
              Back to edit
            </Button>
          )}
          <Button
            type="button"
            disabled={create.isPending}
            onClick={once(record)}
          >
            {create.isPending ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            ) : null}
            {create.isPending
              ? 'Recording…'
              : uncertain
                ? 'Try again'
                : 'Record adjustment'}
          </Button>
        </div>
      </div>
    );
  }

  const places = held ? { decimalPlaces: held.item.decimal_places } : {};
  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        const input = check();
        if (input) {
          create.reset();
          setReview(input);
        }
      }}
    >
      <BackLink {...BACK} />
      <div className="flex flex-col gap-1">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight outline-none"
        >
          New adjustment
        </h1>
        <p className="text-neutral-600">
          Correct the stock of one item in a warehouse, with the reason. To
          correct many items after counting, use a stock-take.
        </p>
      </div>
      {general ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Not recorded</AlertTitle>
          <AlertDescription>{general}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Adjustment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Warehouse"
            required
            error={errors.warehouse_id || undefined}
          >
            {(control) => (
              <SelectField
                {...control}
                placeholder="Choose a warehouse"
                value={warehouseId}
                onChange={(id) => {
                  setWarehouseId(id);
                  clear('warehouse_id');
                  resetUnits();
                }}
                options={warehouses.map((option) => ({
                  value: option.id,
                  label: `${option.name} (${option.code})`,
                }))}
              />
            )}
          </Field>
          <Field
            label="Item"
            required
            error={errors.item_id || undefined}
            description={
              !warehouse || !item
                ? undefined
                : stock.isLoading
                  ? 'Reading the stock…'
                  : held
                    ? `Now: ${formatQuantity(held.on_hand, places)} ${held.item.unit} on hand, of which ${formatQuantity(held.unavailable, places)} unavailable.`
                    : stock.error
                      ? 'The current stock could not be read.'
                      : 'This warehouse has no record of this item yet.'
            }
          >
            {(control) => (
              <EntityPicker
                {...control}
                placeholder="Choose an item"
                searchPlaceholder="Search by code or name"
                queryKey={inventoryKeys.itemPicker('GENERAL', true)}
                // An item that has since been deactivated may still be in the warehouse and need correcting.
                search={(term, signal) =>
                  searchItems(
                    'GENERAL',
                    term,
                    signal,
                    (candidate) => found.current.set(candidate.id, candidate),
                    { includeInactive: true },
                  )
                }
                value={
                  item
                    ? { value: item.id, label: `${item.name} (${item.code})` }
                    : null
                }
                onChange={(option) => {
                  setItem(
                    option ? (found.current.get(option.value) ?? null) : null,
                  );
                  clear('item_id');
                  resetUnits();
                }}
              />
            )}
          </Field>
          <Field
            label="Kind"
            required
            description={ADJUSTMENT_KIND_HELP[kind]}
            error={errors.kind || undefined}
            className="sm:col-span-2"
          >
            {(control) => (
              <SelectField
                {...control}
                value={kind}
                onChange={(value) => {
                  if (isKind(value)) {
                    setKind(value);
                    clear('kind');
                    resetUnits();
                  }
                }}
                options={ADJUSTMENT_KIND_OPTIONS}
              />
            )}
          </Field>
          {item?.tracks_units ? (
            <>
              {kind === 'QUANTITY' ? (
                <Field label="Direction" required className="sm:col-span-2">
                  {(control) => (
                    <SelectField
                      {...control}
                      value={direction}
                      onChange={(value) => {
                        setDirection(value === 'out' ? 'out' : 'in');
                        resetUnits();
                      }}
                      options={DIRECTION_OPTIONS}
                    />
                  )}
                </Field>
              ) : null}
              {rule.bySerial ? (
                <SerialsInput
                  label={`Serial numbers of ${item.name}`}
                  description="Scan or type each unit's serial number on its own line. A unit seen before comes back with its history."
                  value={serials}
                  onChange={(value) => {
                    setSerials(value);
                    clear('serials');
                  }}
                  error={errors.serials || undefined}
                />
              ) : (
                <UnitChooser
                  label={`Units of ${item.name}`}
                  description={
                    rule.status === 'IN_STOCK'
                      ? 'Units in stock in this warehouse.'
                      : 'Damaged units of this warehouse.'
                  }
                  filters={{
                    warehouse: warehouseId,
                    item: item.id,
                    status: rule.status,
                  }}
                  value={units}
                  onChange={(value) => {
                    setUnits(value);
                    clear('serials');
                  }}
                  error={errors.serials || undefined}
                />
              )}
              {crossReason !== null ? (
                <Field
                  label="Why these are different units"
                  required
                  description="These serial numbers are already recorded under another item. If they really are other units, say why; the reason is kept in the audit log."
                  className="sm:col-span-2"
                >
                  {(control) => (
                    <Input
                      autoComplete="off"
                      maxLength={500}
                      value={crossReason}
                      onChange={(event) => {
                        setCrossReason(event.target.value);
                        clear('serials');
                      }}
                      {...control}
                    />
                  )}
                </Field>
              ) : null}
            </>
          ) : (
            <Field
              label={item ? `Quantity (${item.unit})` : 'Quantity'}
              required
              error={errors.quantity || undefined}
            >
              {(control) => (
                <Input
                  // Not `inputMode="decimal"`: some phone keypads have no minus sign.
                  inputMode="text"
                  autoComplete="off"
                  className="tabular-nums"
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                    clear('quantity');
                  }}
                  {...control}
                />
              )}
            </Field>
          )}
          <Field
            label="Reason"
            required
            description="Kept with the adjustment for good, and shown in the reports."
            error={errors.reason || undefined}
            className="sm:col-span-2"
          >
            {(control) => (
              <textarea
                rows={3}
                className={TEXTAREA}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  clear('reason');
                }}
                {...control}
              />
            )}
          </Field>
        </CardContent>
      </Card>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.push(BACK.href)}>
          Cancel
        </Button>
        <Button type="submit">Review adjustment</Button>
      </div>
    </form>
  );
}
