'use client';

import { CircleAlert, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTable, type Column } from '@/components/shared/data-table';
import { EntityPicker } from '@/components/shared/entity-picker';
import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import { PageHeader } from '@/components/shared/page-header';
import {
  EmptyState,
  ErrorState,
  errorMessage,
} from '@/components/shared/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { ROW_LINK } from '@/features/accounts/components/shared';
import { useCurrentUser } from '@/features/auth/session';
import { isApiError } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format/date';
import {
  formatQuantity,
  isZeroQuantity,
  parseQuantity,
} from '@/lib/format/quantity';
import { useSubmitLock } from '@/lib/forms/submit-lock';
import { can } from '@/lib/permissions/codes';

import {
  inventoryKeys,
  searchItems,
  useBalanceList,
  useStockTake,
  useStockTakeActions,
  type CountInput,
} from '../api';
import { parseSerials, repeatedSerials } from '../serials';
import type { ItemRef, StockTake, StockTakeLine } from '../types';
import { BackLink, Detail, DocumentShell } from './document-detail';
import { StockTakeStatusBadge } from './stock-takes-page';

const BACK = { href: '/inventory/stock-takes', label: 'Stock-takes' };
const GRID_SIZE = 100;

const places = (item: ItemRef) => ({ decimalPlaces: item.decimal_places });
const differs = (line: StockTakeLine) => line.differs;
const SCAN_BOX =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 font-mono text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive md:text-sm';

function scanOutcome(line: StockTakeLine): string {
  const parts: string[] = [];
  if (line.missing.length > 0)
    parts.push(
      `not found on the shelf: ${line.missing.map((unit) => unit.serial_number).join(', ')}`,
    );
  if (line.found.length > 0)
    parts.push(`not in the records: ${line.found.join(', ')}`);
  return parts.length > 0
    ? `${parts.join('; ')}.`
    : 'Every unit matches the records.';
}

export function StockTakeDetail({ id }: { id: string }) {
  const query = useStockTake(id);
  return (
    <DocumentShell
      query={query}
      found={Boolean(query.data)}
      noun="stock-take"
      back={BACK}
    >
      {query.data ? <Loaded stockTake={query.data} /> : null}
    </DocumentShell>
  );
}

function Loaded({ stockTake }: { stockTake: StockTake }) {
  const me = useCurrentUser();
  const mayCount =
    can(me, 'INVENTORY_STOCK_TAKE') &&
    me.warehouse_ids.includes(stockTake.warehouse.id);
  const open = stockTake.status === 'DRAFT';

  return (
    <>
      <BackLink {...BACK} />
      <PageHeader
        title={stockTake.reference}
        description={
          open
            ? 'An open count. The warehouse keeps working while it is counted; nothing changes in the stock until the count is completed.'
            : stockTake.status === 'COMPLETED'
              ? 'A completed count. Every item whose count differed was adjusted, with its reason.'
              : 'A cancelled count. Nothing was adjusted; the counts are kept for the record.'
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Stock-take
            <StockTakeStatusBadge status={stockTake.status} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail term="Warehouse">
              <Link
                href={`/warehouses/${stockTake.warehouse.id}`}
                className={ROW_LINK}
              >
                {stockTake.warehouse.name}
              </Link>{' '}
              ({stockTake.warehouse.code})
            </Detail>
            <Detail term="Started">
              {formatDateTime(stockTake.started_at)}
            </Detail>
            <Detail term="Started by">{stockTake.started_by}</Detail>
            {open ? null : (
              <>
                <Detail
                  term={
                    stockTake.status === 'COMPLETED' ? 'Completed' : 'Cancelled'
                  }
                >
                  {formatDateTime(stockTake.completed_at)}
                </Detail>
                <Detail
                  term={
                    stockTake.status === 'COMPLETED'
                      ? 'Completed by'
                      : 'Cancelled by'
                  }
                >
                  {stockTake.completed_by ?? '–'}
                </Detail>
              </>
            )}
          </dl>
        </CardContent>
      </Card>
      {open && mayCount ? (
        <Counting
          stockTake={stockTake}
          mayComplete={can(me, 'INVENTORY_ADJUST')}
        />
      ) : (
        <Counted stockTake={stockTake} />
      )}
    </>
  );
}

const COUNTED_COLUMNS: Column<StockTakeLine>[] = [
  {
    id: 'item',
    header: 'Item',
    primary: true,
    cell: (line) => (
      <span className="flex flex-col">
        <Link href={`/catalogue/items/${line.item.id}`} className={ROW_LINK}>
          {line.item.name}
        </Link>
        <span className="text-xs font-normal text-neutral-600">
          {line.item.code}
        </span>
      </span>
    ),
  },
  {
    id: 'counted',
    header: 'Counted',
    className: 'text-right tabular-nums whitespace-nowrap',
    cell: (line) =>
      `${formatQuantity(line.counted_quantity, places(line.item))} ${line.item.unit}`,
  },
  {
    id: 'system',
    header: 'System when counted',
    className: 'text-right tabular-nums whitespace-nowrap',
    cell: (line) =>
      formatQuantity(line.system_quantity_at_count, places(line.item)),
  },
  {
    id: 'difference',
    header: 'Difference',
    className: 'text-right tabular-nums whitespace-nowrap',
    cell: (line) =>
      isZeroQuantity(line.difference) ? (
        'None'
      ) : (
        <span className="font-medium">
          {formatQuantity(line.difference, {
            ...places(line.item),
            signed: true,
          })}
        </span>
      ),
  },
  {
    id: 'adjustment',
    header: 'Adjustment',
    className: 'whitespace-nowrap',
    cell: (line) =>
      line.adjustments.length > 0 ? (
        <span className="flex flex-col">
          {line.adjustments.map((adjustment) => (
            <Link
              key={adjustment.id}
              href={`/inventory/adjustments/${adjustment.id}`}
              className={ROW_LINK}
            >
              {adjustment.reference}
            </Link>
          ))}
        </span>
      ) : (
        '–'
      ),
  },
  {
    id: 'at',
    header: 'Counted at',
    className: 'whitespace-nowrap',
    cell: (line) => formatDateTime(line.counted_at),
  },
];

function Counted({ stockTake }: { stockTake: StockTake }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Counts</CardTitle>
        <CardDescription>
          {stockTake.lines.length === 1
            ? 'One item counted.'
            : `${stockTake.lines.length} items counted.`}
          {stockTake.status === 'DRAFT'
            ? ' The count is still open: only the Store Keeper of the warehouse can enter counts.'
            : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          caption="Counts"
          columns={COUNTED_COLUMNS}
          rows={stockTake.lines}
          rowId={(line) => line.id}
          ordering=""
          onOrderingChange={() => undefined}
          isLoading={false}
          isFetching={false}
          error={null}
          onRetry={() => undefined}
          empty={
            <EmptyState
              title="Nothing was counted"
              description="No count was entered in this stock-take."
            />
          }
        />
      </CardContent>
    </Card>
  );
}

type Row = { item: ItemRef; line: StockTakeLine | null };

function Counting({
  stockTake,
  mayComplete,
}: {
  stockTake: StockTake;
  mayComplete: boolean;
}) {
  const actions = useStockTakeActions(stockTake.id);
  const once = useSubmitLock(actions.saveCounts.isPending);
  const held = useBalanceList({
    warehouse: stockTake.warehouse.id,
    ordering: 'item__code',
    page_size: GRID_SIZE,
  });
  const [extra, setExtra] = useState<ItemRef[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<'complete' | 'cancel' | null>(null);
  const found = useRef(new Map<string, ItemRef>());

  const rows = new Map<string, Row>();
  for (const line of stockTake.lines) {
    rows.set(line.item.id, { item: line.item, line });
  }
  for (const item of [
    ...(held.data?.results ?? []).map((balance) => balance.item),
    ...extra,
  ]) {
    if (!rows.has(item.id)) {
      rows.set(item.id, { item, line: null });
    }
  }
  const list = [...rows.values()].sort((a, b) =>
    a.item.code.localeCompare(b.item.code),
  );
  const saved = (row: Row) =>
    row.item.tracks_units
      ? (row.line?.serials.map((scan) => scan.serial_number).join('\n') ?? '')
      : row.line
        ? formatQuantity(row.line.counted_quantity, {
            ...places(row.item),
            grouped: false,
          })
        : '';
  const isChanged = (row: Row) => {
    const typed = edits[row.item.id];
    if (typed === undefined) return false;
    return row.item.tracks_units
      ? parseSerials(typed).join('\n') !== saved(row)
      : typed.trim() !== saved(row);
  };
  const changed = list.filter(isChanged);
  const differing = stockTake.lines.filter(differs);
  const busy = actions.saveCounts.isPending;

  const save = () => {
    const problems: Record<string, string> = {};
    const lines = changed.flatMap((row): CountInput[] => {
      const typed = edits[row.item.id];
      if (row.item.tracks_units) {
        const serials = parseSerials(typed);
        const repeated = repeatedSerials(serials);
        if (repeated.length > 0) {
          problems[row.item.id] =
            `Scanned more than once: ${repeated.join(', ')}.`;
          return [];
        }
        return [{ item_id: row.item.id, serials }];
      }
      if (typed.trim() === '') {
        problems[row.item.id] = 'Enter the count. Use 0 if there is none.';
        return [];
      }
      const parsed = parseQuantity(typed, row.item.decimal_places, {
        allowZero: true,
      });
      if (!parsed.ok) {
        problems[row.item.id] = parsed.message;
        return [];
      }
      return [{ item_id: row.item.id, counted_quantity: parsed.value }];
    });
    setErrors(problems);
    if (Object.keys(problems).length > 0 || lines.length === 0) {
      return;
    }
    actions.saveCounts.mutate(lines, {
      onSuccess: (response) => {
        toast.success(response.message);
        setEdits({});
      },
      onError: (error) => {
        // The backend names the item a count is wrong for.
        const itemId =
          isApiError(error) && typeof error.context?.item_id === 'string'
            ? error.context.item_id
            : null;
        if (itemId) {
          setErrors({ [itemId]: errorMessage(error) });
        }
      },
    });
  };

  const saveError = actions.saveCounts.error;
  const saveErrorShown =
    saveError &&
    !(isApiError(saveError) && typeof saveError.context?.item_id === 'string');

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Counts</CardTitle>
          <CardDescription>
            Type what you counted for each item and save. Saving a count again
            replaces it. {stockTake.lines.length} of {list.length}{' '}
            {list.length === 1 ? 'item' : 'items'} counted
            {differing.length > 0
              ? `, ${differing.length} with a difference`
              : ''}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {saveErrorShown ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden />
              <AlertTitle>Counts not saved</AlertTitle>
              <AlertDescription>{errorMessage(saveError)}</AlertDescription>
            </Alert>
          ) : null}
          {held.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : held.error && list.length === 0 ? (
            <ErrorState
              title="The items of the warehouse could not be loaded"
              error={held.error}
              onRetry={() => held.refetch()}
              retrying={held.isFetching}
            />
          ) : list.length === 0 ? (
            <p className="text-sm text-neutral-600">
              This warehouse holds nothing yet. Use the box below to count an
              item.
            </p>
          ) : (
            <ul aria-label="Items to count" className="flex flex-col divide-y">
              {list.map((row) => {
                const { item, line } = row;
                const error = errors[item.id];
                const hintId = `count-${item.id}-hint`;
                return (
                  <li
                    key={item.id}
                    className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-start sm:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium wrap-break-word">{item.name}</p>
                      <p className="text-xs text-neutral-600">{item.code}</p>
                      <p
                        id={hintId}
                        className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600"
                      >
                        {item.tracks_units ? (
                          line ? (
                            <>
                              <span>
                                Scanned{' '}
                                {formatQuantity(
                                  line.counted_quantity,
                                  places(item),
                                )}
                                ; the system had{' '}
                                {formatQuantity(
                                  line.system_quantity_at_count,
                                  places(item),
                                )}
                                . {scanOutcome(line)}
                              </span>
                              {differs(line) ? (
                                <Badge variant="outline">To adjust</Badge>
                              ) : (
                                <Badge>Matches</Badge>
                              )}
                            </>
                          ) : (
                            'Not scanned yet. Scan the serial number of every unit on the shelf, one per line.'
                          )
                        ) : line ? (
                          <>
                            <span>
                              Counted{' '}
                              {formatQuantity(
                                line.counted_quantity,
                                places(item),
                              )}
                              ; the system had{' '}
                              {formatQuantity(
                                line.system_quantity_at_count,
                                places(item),
                              )}
                              .
                            </span>
                            {differs(line) ? (
                              <Badge variant="outline">
                                Difference{' '}
                                {formatQuantity(line.difference, {
                                  ...places(item),
                                  signed: true,
                                })}
                              </Badge>
                            ) : (
                              <Badge>Matches</Badge>
                            )}
                          </>
                        ) : (
                          'Not counted yet.'
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      {item.tracks_units ? (
                        <textarea
                          rows={Math.min(
                            Math.max(
                              3,
                              (edits[item.id] ?? saved(row)).split('\n')
                                .length + 1,
                            ),
                            10,
                          )}
                          className={SCAN_BOX}
                          spellCheck={false}
                          autoComplete="off"
                          aria-label={`Serial numbers of ${item.name}`}
                          aria-describedby={hintId}
                          aria-invalid={Boolean(error)}
                          value={edits[item.id] ?? saved(row)}
                          onChange={(event) => {
                            setEdits((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }));
                            setErrors((current) => ({
                              ...current,
                              [item.id]: '',
                            }));
                          }}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input
                            inputMode="decimal"
                            autoComplete="off"
                            className="tabular-nums"
                            aria-label={`Count of ${item.name} (${item.unit})`}
                            aria-describedby={hintId}
                            aria-invalid={Boolean(error)}
                            value={edits[item.id] ?? saved(row)}
                            onChange={(event) => {
                              setEdits((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }));
                              setErrors((current) => ({
                                ...current,
                                [item.id]: '',
                              }));
                            }}
                          />
                          <span className="w-10 shrink-0 text-sm text-neutral-600">
                            {item.unit}
                          </span>
                        </div>
                      )}
                      {error ? (
                        <p className="text-destructive text-sm wrap-break-word">
                          {error}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {(held.data?.pagination.count ?? 0) > GRID_SIZE ? (
            <p className="text-sm text-neutral-600">
              This warehouse holds more than {GRID_SIZE} items. The first{' '}
              {GRID_SIZE} are listed; count the others with the box below.
            </p>
          ) : null}
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="sm:w-80">
              <Field
                label="Count another item"
                description="For an item that is not listed, such as one found on a shelf."
              >
                {(control) => (
                  <EntityPicker
                    {...control}
                    placeholder="Choose an item"
                    searchPlaceholder="Search by code or name"
                    queryKey={inventoryKeys.itemPicker('GENERAL', true)}
                    search={(term, signal) =>
                      searchItems(
                        'GENERAL',
                        term,
                        signal,
                        (item) => found.current.set(item.id, item),
                        { includeInactive: true },
                      )
                    }
                    value={null}
                    onChange={(option) => {
                      const item = option
                        ? found.current.get(option.value)
                        : undefined;
                      if (item) {
                        setExtra((current) =>
                          current.some((other) => other.id === item.id)
                            ? current
                            : [...current, item],
                        );
                      }
                    }}
                  />
                )}
              </Field>
            </div>
            <Button
              onClick={once(save)}
              disabled={busy || changed.length === 0}
            >
              {busy ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : null}
              {busy
                ? 'Saving…'
                : changed.length > 0
                  ? `Save ${changed.length} ${changed.length === 1 ? 'count' : 'counts'}`
                  : 'Save counts'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Finish</CardTitle>
          <CardDescription>
            {changed.length > 0
              ? 'Save your counts before completing.'
              : stockTake.lines.length === 0
                ? 'Nothing has been counted yet. Enter counts, or cancel the count.'
                : differing.length === 0
                  ? 'Every count matches the system. Completing will adjust nothing.'
                  : `Completing will adjust ${differing.length} ${differing.length === 1 ? 'item' : 'items'}. You will give a reason for each.`}
            {mayComplete
              ? ''
              : ' Completing also needs the permission to adjust stock, which you do not have.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setDialog('cancel')}>
            Cancel the count
          </Button>
          {mayComplete ? (
            <Button
              disabled={changed.length > 0 || stockTake.lines.length === 0}
              onClick={() => setDialog('complete')}
            >
              Complete the count
            </Button>
          ) : null}
        </CardContent>
      </Card>
      {dialog === 'complete' ? (
        <CompleteDialog
          stockTake={stockTake}
          differing={differing}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(next) => {
          if (!next) {
            actions.cancel.reset();
            setDialog(null);
          }
        }}
        title="Cancel this count?"
        description="Nothing will be adjusted. The counts entered so far are kept for the record, and a new count can be started afterwards."
        confirmLabel="Cancel the count"
        isSubmitting={actions.cancel.isPending}
        error={actions.cancel.error ? errorMessage(actions.cancel.error) : null}
        onConfirm={() =>
          actions.cancel.mutate(undefined, {
            onSuccess: (response) => {
              toast.success(response.message);
              setDialog(null);
            },
          })
        }
      />
    </>
  );
}

type CompleteProps = {
  stockTake: StockTake;
  differing: StockTakeLine[];
  onClose: () => void;
};

/** Asks for the reason of every difference, then completes the count. */
function CompleteDialog({ stockTake, differing, onClose }: CompleteProps) {
  const { complete } = useStockTakeActions(stockTake.id);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const empty = differing
      .filter((line) => !(reasons[line.id] ?? '').trim())
      .map((line) => line.id);
    setMissing(empty);
    if (empty.length > 0) {
      return;
    }
    const payload = Object.fromEntries(
      differing.map((line) => [line.id, reasons[line.id].trim()]),
    );
    complete.mutate(payload, {
      onSuccess: (response) => {
        toast.success(response.message);
        onClose();
      },
      onError: (error) => {
        // The backend lists the lines that still need a reason (a count may have changed meanwhile).
        const ids = isApiError(error) ? error.context?.line_ids : null;
        if (Array.isArray(ids)) {
          setMissing(ids.filter((id): id is string => typeof id === 'string'));
        }
      },
    });
  };

  const first = differing[0] ? (reasons[differing[0].id] ?? '').trim() : '';

  return (
    <FormDialog
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title="Complete the count"
      description={
        differing.length === 0
          ? 'Every count matches the system. Nothing will be adjusted, and the count will be closed.'
          : 'Each difference becomes an adjustment that cannot be undone, applied to the stock as it is now. Give the reason for each.'
      }
      onSubmit={submit}
      submitLabel="Complete the count"
      submittingLabel="Completing…"
      isSubmitting={complete.isPending}
      error={complete.error ? errorMessage(complete.error) : null}
    >
      {differing.map((line, index) => (
        <div key={line.id} className="flex flex-col gap-2">
          <Field
            label={`Reason for ${line.item.name}`}
            required
            description={
              line.item.tracks_units
                ? `Units ${scanOutcome(line)} Those not found are written off; those not in the records are brought in.`
                : `Counted ${formatQuantity(line.counted_quantity, places(line.item))}, system ${formatQuantity(line.system_quantity_at_count, places(line.item))}: ${formatQuantity(line.difference, { ...places(line.item), signed: true })} ${line.item.unit}.`
            }
            error={
              missing.includes(line.id)
                ? 'Give the reason for this difference.'
                : undefined
            }
          >
            {(control) => (
              <Input
                autoComplete="off"
                value={reasons[line.id] ?? ''}
                onChange={(event) => {
                  setReasons((current) => ({
                    ...current,
                    [line.id]: event.target.value,
                  }));
                  setMissing((current) =>
                    current.filter((id) => id !== line.id),
                  );
                }}
                {...control}
              />
            )}
          </Field>
          {index === 0 && differing.length > 1 ? (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={first === ''}
                onClick={() => {
                  setReasons(
                    Object.fromEntries(
                      differing.map((other) => [other.id, first]),
                    ),
                  );
                  setMissing([]);
                }}
              >
                Use this reason for every item
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </FormDialog>
  );
}
