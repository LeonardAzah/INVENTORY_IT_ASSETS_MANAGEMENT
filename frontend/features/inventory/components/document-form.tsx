'use client';

import {
  ArrowLeft,
  CircleAlert,
  LoaderCircle,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import {
  EntityPicker,
  type PickerOption,
} from '@/components/shared/entity-picker';
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
import { formatDate, today } from '@/lib/format/date';
import { formatQuantity, parseQuantity } from '@/lib/format/quantity';
import { useSubmitLock } from '@/lib/forms/submit-lock';

import {
  inventoryKeys,
  searchItems,
  searchRecipients,
  searchStock,
  useCreateDocument,
  useIssue,
  useOperableWarehouses,
  useRecipientStores,
  type DocumentInput,
  type DocumentKind,
  type LineUnits,
} from '../api';
import {
  isUncertainOutcome,
  readDocumentErrors,
  type LineErrors,
} from '../document-errors';
import { parseSerials, serialsProblem } from '../serials';
import {
  CONDITION_LABELS,
  CONDITION_OPTIONS,
  employeeName,
  type Issue,
  type ItemRef,
  type ReturnCondition,
  type UnitRef,
} from '../types';
import { SerialsInput, UnitChooser } from './unit-fields';

const BACK_LINK =
  'inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

const TEXTAREA =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive md:text-sm';

const SOURCE_MAX = 255;

const COPY = {
  receipt: {
    noun: 'receipt',
    title: 'New receipt',
    intro:
      'Record goods that arrived in a warehouse. You will check everything before it is recorded.',
    listHref: '/inventory/receipts',
    listLabel: 'Receipts',
    card: 'Delivery',
    dateField: 'receipt_date',
    dateLabel: 'Receipt date',
    dateHelp:
      'The date on the delivery. It can be earlier than today, never later.',
    dateMissing: 'Enter the date of the delivery.',
    linesTitle: 'Items received',
    personLabel: '',
    personMissing: '',
    noWarehouseTitle: 'No warehouse to receive into',
    noWarehouse:
      'A general warehouse is received into by its Store Keeper, and an IT warehouse by the IT staff of its region. No active warehouse is yours to receive into.',
  },
  issue: {
    noun: 'issue',
    title: 'New issue',
    intro:
      'Hand stock from a warehouse to an employee. You will check everything before it is recorded.',
    listHref: '/inventory/issues',
    listLabel: 'Issues',
    card: 'Issue',
    dateField: 'issue_date',
    dateLabel: 'Issue date',
    dateHelp:
      'The day the stock was handed over. It can be earlier than today, never later.',
    dateMissing: 'Enter the date of the issue.',
    linesTitle: 'Items issued',
    personLabel: 'Issued to',
    personMissing: 'Choose who receives the stock.',
    noWarehouseTitle: 'No warehouse to issue from',
    noWarehouse:
      'Stock is issued from a general warehouse by its Store Keeper. No active warehouse is yours to issue from.',
  },
  return: {
    noun: 'return',
    title: 'New return',
    intro:
      'Take stock back from an employee. You will check everything before it is recorded.',
    listHref: '/inventory/returns',
    listLabel: 'Returns',
    card: 'Return',
    dateField: 'return_date',
    dateLabel: 'Return date',
    dateHelp:
      'The day the stock came back. It can be earlier than today, never later.',
    dateMissing: 'Enter the date of the return.',
    linesTitle: 'Items returned',
    personLabel: 'Returned by',
    personMissing: 'Choose who is returning the stock.',
    noWarehouseTitle: 'No warehouse to take returns into',
    noWarehouse:
      'Stock is returned to a general warehouse through its Store Keeper. No active warehouse is yours to take returns into.',
  },
} as const;

type Line = {
  key: number;
  item: ItemRef | null;
  quantity: string;
  condition: ReturnCondition;
  hint: string | null;
  serials: string;
  units: UnitRef[];
  crossReason: string | null;
};
type Errors = {
  fields: Record<string, string>;
  lines: Record<number, LineErrors>;
  general: string | null;
};

const NO_ERRORS: Errors = { fields: {}, lines: {}, general: null };
const EMPTY_LINE: Omit<Line, 'key'> = {
  item: null,
  quantity: '',
  condition: 'GOOD',
  hint: null,
  serials: '',
  units: [],
  crossReason: null,
};

function BackLink({ kind }: { kind: DocumentKind }) {
  return (
    <Link href={COPY[kind].listHref} className={BACK_LINK}>
      <ArrowLeft className="size-4" aria-hidden />
      {COPY[kind].listLabel}
    </Link>
  );
}

function Stopped({
  kind,
  children,
}: {
  kind: DocumentKind;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <BackLink kind={kind} />
      <PageHeader title={COPY[kind].title} />
      <div className="bg-card rounded-lg border">{children}</div>
    </div>
  );
}

const outstandingLines = (issue: Issue) =>
  issue.lines.filter((line) => line.quantity !== line.returned_quantity);

export function NewReceipt() {
  return <NewDocument kind="receipt" issueId={null} />;
}

export function NewIssue() {
  return <NewDocument kind="issue" issueId={null} />;
}

export function NewReturn() {
  return <NewDocument kind="return" issueId={useSearchParams().get('issue')} />;
}

function NewDocument({
  kind,
  issueId,
}: {
  kind: DocumentKind;
  issueId: string | null;
}) {
  const warehouses = useOperableWarehouses(kind);
  const issue = useIssue(issueId ?? '', issueId !== null);

  if (warehouses.isLoading || issue.isLoading) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label={`Loading the ${COPY[kind].noun} form`}
      >
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (warehouses.error) {
    return (
      <Stopped kind={kind}>
        <ErrorState
          title="The warehouses could not be loaded"
          error={warehouses.error}
          onRetry={() => warehouses.refetch()}
          retrying={warehouses.isFetching}
        />
      </Stopped>
    );
  }
  const operable = warehouses.data ?? [];
  if (operable.length === 0) {
    return (
      <Stopped kind={kind}>
        <EmptyState
          title={COPY[kind].noWarehouseTitle}
          description={COPY[kind].noWarehouse}
        />
      </Stopped>
    );
  }
  if (issueId !== null) {
    if (!issue.data) {
      const missing =
        isApiError(issue.error) && issue.error.kind === 'not_found';
      return (
        <Stopped kind={kind}>
          {missing ? (
            <EmptyState
              title="Issue not found"
              description="This issue does not exist, or it belongs to a warehouse you cannot see."
            />
          ) : (
            <ErrorState
              title="The issue could not be loaded"
              error={issue.error}
              onRetry={() => issue.refetch()}
              retrying={issue.isFetching}
            />
          )}
        </Stopped>
      );
    }
    const back = (
      <Button variant="outline" size="sm">
        <Link href={`/inventory/issues/${issue.data.id}`}>
          Back to the issue
        </Link>
      </Button>
    );
    if (
      !operable.some((warehouse) => warehouse.id === issue.data.warehouse.id)
    ) {
      return (
        <Stopped kind={kind}>
          <EmptyState
            title="Not yours to take back"
            description={`${issue.data.reference} was issued from ${issue.data.warehouse.name}. Its Store Keeper records its returns.`}
            action={back}
          />
        </Stopped>
      );
    }
    if (issue.data.recipient_store) {
      return (
        <Stopped kind={kind}>
          <EmptyState
            title="Issued to a store"
            description={`${issue.data.reference} supplied ${issue.data.recipient_store.name}. Stock moves back between stores only by a new issue from that store.`}
            action={back}
          />
        </Stopped>
      );
    }
    if (outstandingLines(issue.data).length === 0) {
      return (
        <Stopped kind={kind}>
          <EmptyState
            title="Nothing left to return"
            description={`Everything on ${issue.data.reference} has already been returned.`}
            action={back}
          />
        </Stopped>
      );
    }
  }
  return (
    <DocumentForm
      kind={kind}
      warehouses={operable}
      issue={issue.data ?? null}
    />
  );
}

function DocumentForm({
  kind,
  warehouses,
  issue,
}: {
  kind: DocumentKind;
  warehouses: Warehouse[];
  issue: Issue | null;
}) {
  const copy = COPY[kind];
  const router = useRouter();
  const create = useCreateDocument(kind);
  const once = useSubmitLock(create.isPending);
  const [requestId] = useState(() => crypto.randomUUID());
  const [warehouseId, setWarehouseId] = useState(
    issue?.warehouse.id ?? (warehouses.length === 1 ? warehouses[0].id : ''),
  );
  const [date, setDate] = useState(today);
  const [source, setSource] = useState('');
  const [person, setPerson] = useState<PickerOption | null>(
    issue?.employee
      ? {
          value: issue.employee.id,
          label: `${employeeName(issue.employee)} (${issue.employee.matricule})`,
        }
      : null,
  );
  const [toStore, setToStore] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [notes, setNotes] = useState('');
  const nextKey = useRef(1);
  const [lines, setLines] = useState<Line[]>([{ key: 0, ...EMPTY_LINE }]);
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const [review, setReview] = useState<DocumentInput | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [done, setDone] = useState(false);
  const found = useRef(
    new Map<string, { item: ItemRef; hint: string | null }>(),
  );
  const heading = useRef<HTMLHeadingElement>(null);

  const warehouse =
    warehouses.find((candidate) => candidate.id === warehouseId) ?? null;
  const withStore = kind === 'issue' && toStore;
  const withPerson = kind !== 'receipt' && !withStore;
  const stores = useRecipientStores(warehouseId, withStore);
  const storeLabel = stores.data?.find((store) => store.id === storeId);
  const withCondition = kind === 'return';
  const bySerial = kind === 'receipt' || (kind === 'return' && !issue);
  const latest = today();
  const dirty =
    source !== '' ||
    notes !== '' ||
    (person !== null && !issue) ||
    lines.some(
      (line) =>
        line.item !== null || line.quantity !== '' || line.serials !== '',
    );

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

  const chooseWarehouse = (id: string) => {
    const chosen = warehouses.find((candidate) => candidate.id === id);
    if (warehouse && chosen && chosen.id !== warehouse.id) {
      if (kind !== 'receipt' || chosen.type !== warehouse.type) {
        setLines((current) =>
          current.map((line) => ({ ...line, item: null, hint: null })),
        );
      }
      if (kind !== 'receipt' && chosen.region.id !== warehouse.region.id) {
        setPerson(null);
      }
      setStoreId('');
    }
    setWarehouseId(id);
  };

  const changeLine = (key: number, patch: Partial<Line>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
    setErrors((current) => ({
      ...current,
      lines: { ...current.lines, [key]: {} },
    }));
  };

  const chooseItem = (key: number, id: string | null) => {
    const entry = id ? found.current.get(id) : undefined;
    changeLine(key, {
      item: entry?.item ?? null,
      hint: entry?.hint ?? null,
      serials: '',
      units: [],
      crossReason: null,
    });
  };

  const unitFilters = (item: ItemRef) =>
    issue
      ? { issue: issue.id, item: item.id, status: 'ISSUED' }
      : { warehouse: warehouseId, item: item.id, status: 'IN_STOCK' };

  const check = (): DocumentInput | null => {
    const fields: Record<string, string> = {};
    const lineErrors: Record<number, LineErrors> = {};
    if (!warehouse) {
      fields.warehouse_id = 'Choose the warehouse.';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      fields[copy.dateField] = copy.dateMissing;
    } else if (date > latest) {
      fields[copy.dateField] =
        `The ${copy.dateLabel.toLowerCase()} cannot be in the future.`;
    }
    if (kind === 'receipt') {
      if (source.trim() === '') {
        fields.source = 'Say where the goods came from.';
      } else if (source.trim().length > SOURCE_MAX) {
        fields.source = `Use at most ${SOURCE_MAX} characters.`;
      }
    }
    if (withPerson && !person) {
      fields.employee_id = copy.personMissing;
    }
    if (withStore && !storeId) {
      fields.recipient_store_id = 'Choose the store that asked for the stock.';
    }
    if (kind === 'return' && !issue && notes.trim() === '') {
      fields.notes =
        'A return that is not linked to an issue needs a note saying where the stock comes from.';
    }

    const payload: ({
      item_id: string;
      quantity: string;
      condition: ReturnCondition;
    } & LineUnits)[] = [];
    const seen = new Map<string, number>();
    const unitLine = new Map<string, number>();
    lines.forEach((line, index) => {
      const problems: LineErrors = {};
      const identity = line.item
        ? withCondition
          ? `${line.item.id}:${line.condition}`
          : line.item.id
        : '';
      if (!line.item) {
        problems.item = 'Choose an item.';
      } else if (seen.has(identity)) {
        problems.item = withCondition
          ? `This item is already on line ${seen.get(identity)} in the same condition. Put the whole quantity on one line.`
          : `This item is already on line ${seen.get(identity)}. Put the whole quantity on one line.`;
      } else {
        seen.set(identity, index + 1);
      }
      if (line.item?.tracks_units) {
        const units: LineUnits = {};
        if (bySerial) {
          const serials = parseSerials(line.serials);
          const problem = serialsProblem(serials);
          if (problem) problems.serials = problem;
          units.serials = serials;
        } else {
          const taken = line.units.find((unit) => unitLine.has(unit.id));
          if (line.units.length === 0) {
            problems.serials = 'Choose the units.';
          } else if (taken) {
            problems.serials = `${taken.serial_number} is already on line ${unitLine.get(taken.id)}.`;
          }
          line.units.forEach((unit) => unitLine.set(unit.id, index + 1));
          units.unit_ids = line.units.map((unit) => unit.id);
        }
        if (line.crossReason !== null) {
          if (line.crossReason.trim() === '') {
            problems.serials =
              'Say why these are different units, or correct the serial numbers.';
          } else {
            units.cross_item_serial_reason = line.crossReason.trim();
          }
        }
        const count = units.serials?.length ?? units.unit_ids?.length ?? 0;
        if (problems.item || problems.serials) {
          lineErrors[line.key] = problems;
        } else {
          payload.push({
            item_id: line.item.id,
            quantity: String(count),
            condition: line.condition,
            ...units,
          });
        }
        return;
      }
      const parsed = line.item
        ? parseQuantity(line.quantity, line.item.decimal_places)
        : null;
      if (parsed && !parsed.ok) {
        problems.quantity = parsed.message;
      } else if (!line.item && line.quantity.trim() === '') {
        problems.quantity = 'Enter a quantity.';
      }
      if (problems.item || problems.quantity) {
        lineErrors[line.key] = problems;
      } else if (line.item && parsed?.ok) {
        payload.push({
          item_id: line.item.id,
          quantity: parsed.value,
          condition: line.condition,
        });
      }
    });

    const invalid =
      Object.keys(fields).length > 0 || Object.keys(lineErrors).length > 0;
    setErrors({
      fields,
      lines: lineErrors,
      general: invalid ? 'Check the fields marked below.' : null,
    });
    if (invalid || !warehouse) {
      return null;
    }
    const base = {
      warehouse_id: warehouse.id,
      notes: notes.trim(),
      client_request_id: requestId,
    };
    const plain = payload.map(
      ({ item_id, quantity, serials, unit_ids, cross_item_serial_reason }) => ({
        item_id,
        quantity,
        serials,
        unit_ids,
        cross_item_serial_reason,
      }),
    );
    if (kind === 'receipt') {
      return {
        ...base,
        receipt_date: date,
        source: source.trim(),
        lines: plain,
      };
    }
    if (kind === 'issue') {
      return withStore
        ? {
            ...base,
            issue_date: date,
            recipient_store_id: storeId,
            lines: plain,
          }
        : {
            ...base,
            issue_date: date,
            employee_id: person?.value ?? '',
            lines: plain,
          };
    }
    return {
      ...base,
      return_date: date,
      employee_id: person?.value ?? '',
      issue_id: issue?.id ?? null,
      lines: payload,
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
        router.push(`${copy.listHref}/${response.data.id}`);
      },
      onError: (error) => {
        if (isUncertainOutcome(error)) {
          setUncertain(true);
          return;
        }
        const read = readDocumentErrors(
          error,
          review.lines.map((line) => line.item_id),
          [
            'warehouse_id',
            copy.dateField,
            'source',
            'employee_id',
            'recipient_store_id',
            'notes',
          ],
        );
        const byKey: Record<number, LineErrors> = {};
        read.lines.forEach((problems, index) => {
          const line = lines[index];
          if (line) {
            byKey[line.key] = problems;
          }
        });
        setErrors({
          fields: read.fields,
          lines: byKey,
          general: read.general ?? 'Check the fields marked below.',
        });
        if (isApiError(error) && error.errorCode === 'SERIAL_ON_OTHER_ITEM') {
          const itemId = String(error.context?.item_id ?? '');
          setLines((current) =>
            current.map((line) =>
              line.item?.id === itemId && line.crossReason === null
                ? { ...line, crossReason: '' }
                : line,
            ),
          );
        }
        setUncertain(false);
        setReview(null);
      },
    });
  };

  if (review && warehouse) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight outline-none"
          >
            Check the {copy.noun}
          </h1>
          <p className="text-neutral-600">
            Nothing has been recorded yet. Once recorded,{' '}
            {kind === 'issue' ? 'an' : 'a'} {copy.noun} cannot be changed or
            deleted: a mistake is corrected by an adjustment.
          </p>
        </div>
        {uncertain ? (
          <Alert variant="default">
            <TriangleAlert aria-hidden />
            <AlertTitle>
              We could not confirm that the {copy.noun} was recorded
            </AlertTitle>
            <AlertDescription>
              The server did not answer, so the {copy.noun} may or may not have
              been recorded. Try again: it is safe, because the same {copy.noun}{' '}
              is never recorded twice. If it was already recorded, you will be
              taken to it.
            </AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>{warehouse.name}</CardTitle>
            <CardDescription>Warehouse {warehouse.code}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="text-sm text-neutral-600">{copy.dateLabel}</dt>
                <dd className="text-sm">{formatDate(date)}</dd>
              </div>
              {kind === 'receipt' ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <dt className="text-sm text-neutral-600">Received from</dt>
                  <dd className="text-sm wrap-break-word">{source.trim()}</dd>
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-1">
                  <dt className="text-sm text-neutral-600">
                    {copy.personLabel}
                  </dt>
                  <dd className="text-sm wrap-break-word">
                    {withStore && storeLabel
                      ? `${storeLabel.name} (${storeLabel.code}), a store`
                      : person?.label}
                  </dd>
                </div>
              )}
              {kind === 'return' ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <dt className="text-sm text-neutral-600">Against issue</dt>
                  <dd className="text-sm">
                    {issue ? issue.reference : 'None'}
                  </dd>
                </div>
              ) : null}
              {review.notes ? (
                <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
                  <dt className="text-sm text-neutral-600">Notes</dt>
                  <dd className="text-sm wrap-break-word whitespace-pre-line">
                    {review.notes}
                  </dd>
                </div>
              ) : null}
            </dl>
            <table className="w-full text-sm">
              <caption className="sr-only">Lines to record</caption>
              <thead>
                <tr className="border-b text-left text-neutral-600">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Item
                  </th>
                  {withCondition ? (
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Condition
                    </th>
                  ) : null}
                  <th scope="col" className="py-2 text-right font-medium">
                    Quantity
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) =>
                  line.item ? (
                    <tr key={line.key} className="border-b last:border-b-0">
                      <th
                        scope="row"
                        className="py-2.5 pr-3 text-left font-normal"
                      >
                        <span className="font-medium wrap-break-word">
                          {line.item.name}
                        </span>
                        <span className="block text-xs text-neutral-600">
                          {line.item.code}
                        </span>
                        {line.item.tracks_units ? (
                          <span className="block font-mono text-xs wrap-break-word text-neutral-600">
                            {(
                              review.lines[index]?.serials ??
                              line.units.map((unit) => unit.serial_number)
                            ).join(', ')}
                          </span>
                        ) : null}
                      </th>
                      {withCondition ? (
                        <td className="py-2.5 pr-3">
                          {CONDITION_LABELS[line.condition]}
                        </td>
                      ) : null}
                      <td className="py-2.5 text-right font-medium whitespace-nowrap tabular-nums">
                        {formatQuantity(review.lines[index]?.quantity, {
                          decimalPlaces: line.item.decimal_places,
                        })}{' '}
                        {line.item.unit}
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
            {withCondition &&
            lines.some((line) => line.condition === 'DAMAGED') ? (
              <p className="text-sm text-neutral-600">
                Damaged units are counted in the warehouse but cannot be issued.
              </p>
            ) : null}
          </CardContent>
        </Card>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {/* After an uncertain outcome the document may already exist as shown here, so it can no longer be edited. */}
          {uncertain ? (
            <Button asChild variant="outline">
              <Link href={copy.listHref}>
                Leave and check the {copy.listLabel.toLowerCase()}
              </Link>
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
                : `Record ${copy.noun}`}
          </Button>
        </div>
      </div>
    );
  }

  const itemsHelp = !warehouse
    ? 'Choose the warehouse first: it decides which items can be chosen.'
    : kind === 'issue'
      ? 'Only what this warehouse holds can be issued. One line for each item. Serialized items are issued by choosing their units.'
      : kind === 'return'
        ? issue
          ? `Only what is still out on ${issue.reference} can be returned against it. Use one line for the good units of an item and another for the damaged ones.`
          : 'Use one line for the good units of an item and another for the damaged ones.'
        : warehouse.type === 'IT'
          ? 'Only IT items can be received here. Each unit is registered as an asset afterwards.'
          : 'Only general items can be received here. One line for each item. For a serialized item, enter the serial number of every unit.';

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
      <BackLink kind={kind} />
      <div className="flex flex-col gap-1">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight outline-none"
        >
          {copy.title}
        </h1>
        <p className="text-neutral-600">{copy.intro}</p>
      </div>
      {errors.general ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Not recorded</AlertTitle>
          <AlertDescription>{errors.general}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{copy.card}</CardTitle>
          {issue ? (
            <CardDescription>
              Against issue {issue.reference} of {formatDate(issue.issue_date)}.
              The warehouse and the employee are those of the issue.
            </CardDescription>
          ) : kind === 'return' ? (
            <CardDescription>
              This return is not linked to an issue. To return what was issued,
              open the issue and choose &ldquo;Record a return&rdquo;.
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Warehouse" required error={errors.fields.warehouse_id}>
            {(control) => (
              <SelectField
                {...control}
                disabled={issue !== null}
                placeholder="Choose a warehouse"
                value={warehouseId}
                onChange={chooseWarehouse}
                options={warehouses.map((option) => ({
                  value: option.id,
                  label: `${option.name} (${option.code})`,
                }))}
              />
            )}
          </Field>
          <Field
            label={copy.dateLabel}
            required
            description={copy.dateHelp}
            error={errors.fields[copy.dateField]}
          >
            {(control) => (
              <Input
                type="date"
                max={latest}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                {...control}
              />
            )}
          </Field>
          {kind === 'receipt' ? (
            <Field
              label="Received from"
              required
              description="The supplier, or wherever the goods came from."
              error={errors.fields.source}
              className="sm:col-span-2"
            >
              {(control) => (
                <Input
                  maxLength={SOURCE_MAX}
                  autoComplete="off"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  {...control}
                />
              )}
            </Field>
          ) : (
            <>
              {kind === 'issue' ? (
                <Field
                  label="Recipient"
                  description="A store asks for stock with a manual request; put its reference in the notes. That store records its own receipt."
                  className="sm:col-span-2"
                >
                  {(control) => (
                    <SelectField
                      {...control}
                      value={toStore ? 'store' : 'employee'}
                      onChange={(value) => {
                        setToStore(value === 'store');
                        setErrors((current) => ({
                          ...current,
                          fields: {
                            ...current.fields,
                            employee_id: '',
                            recipient_store_id: '',
                          },
                        }));
                      }}
                      options={[
                        { value: 'employee', label: 'An employee' },
                        {
                          value: 'store',
                          label: 'Another store of the region',
                        },
                      ]}
                    />
                  )}
                </Field>
              ) : null}
              {withStore ? (
                <Field
                  label="Store"
                  required
                  description={
                    stores.data && stores.data.length === 0
                      ? 'The region has no other active general store.'
                      : "An active general store of the warehouse's region."
                  }
                  error={errors.fields.recipient_store_id}
                  className="sm:col-span-2"
                >
                  {(control) => (
                    <SelectField
                      {...control}
                      placeholder={
                        warehouse
                          ? 'Choose a store'
                          : 'Choose the warehouse first'
                      }
                      disabled={!warehouse}
                      value={storeId}
                      onChange={(value) => {
                        setStoreId(value);
                        setErrors((current) => ({
                          ...current,
                          fields: { ...current.fields, recipient_store_id: '' },
                        }));
                      }}
                      options={(stores.data ?? []).map((store) => ({
                        value: store.id,
                        label: `${store.name} (${store.code})`,
                      }))}
                    />
                  )}
                </Field>
              ) : (
                <Field
                  label={copy.personLabel}
                  required
                  description={
                    issue
                      ? undefined
                      : kind === 'issue'
                        ? "An active employee of the warehouse's region."
                        : "An employee of the warehouse's region, even one who has since left."
                  }
                  error={errors.fields.employee_id}
                  className="sm:col-span-2"
                >
                  {(control) => (
                    <EntityPicker
                      {...control}
                      disabled={!warehouse || issue !== null}
                      placeholder={
                        warehouse
                          ? 'Choose an employee'
                          : 'Choose the warehouse first'
                      }
                      searchPlaceholder="Search by name or matricule"
                      queryKey={inventoryKeys.recipientPicker(
                        warehouse?.region.id ?? '',
                        kind === 'return',
                      )}
                      search={(term, signal) =>
                        searchRecipients(
                          warehouse?.region.id ?? '',
                          term,
                          signal,
                          { includeInactive: kind === 'return' },
                        )
                      }
                      value={person}
                      onChange={(option) => {
                        setPerson(option);
                        setErrors((current) => ({
                          ...current,
                          fields: { ...current.fields, employee_id: '' },
                        }));
                      }}
                    />
                  )}
                </Field>
              )}
            </>
          )}
          <Field
            label="Notes"
            required={kind === 'return' && !issue}
            error={errors.fields.notes || undefined}
            className="sm:col-span-2"
          >
            {(control) => (
              <textarea
                rows={2}
                className={TEXTAREA}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                {...control}
              />
            )}
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{copy.linesTitle}</CardTitle>
          <CardDescription>{itemsHelp}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-3">
            {lines.map((line, index) => {
              const problems = errors.lines[line.key] ?? {};
              return (
                <div
                  key={line.key}
                  role="group"
                  aria-label={`Line ${index + 1}`}
                  className={
                    withCondition
                      ? 'grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] sm:items-start'
                      : 'grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-start'
                  }
                >
                  <Field label="Item" required error={problems.item}>
                    {(control) =>
                      issue ? (
                        <SelectField
                          {...control}
                          placeholder="Choose an item"
                          value={line.item?.id ?? ''}
                          onChange={(id) => {
                            const issued = issue.lines.find(
                              (candidate) => candidate.item.id === id,
                            );
                            if (issued) {
                              const places = {
                                decimalPlaces: issued.item.decimal_places,
                              };
                              found.current.set(id, {
                                item: issued.item,
                                hint: `Issued ${formatQuantity(issued.quantity, places)}, returned ${formatQuantity(issued.returned_quantity, places)}`,
                              });
                            }
                            chooseItem(line.key, id);
                          }}
                          options={outstandingLines(issue).map((issued) => ({
                            value: issued.item.id,
                            label: `${issued.item.name} (${issued.item.code})`,
                          }))}
                        />
                      ) : (
                        <EntityPicker
                          {...control}
                          disabled={!warehouse}
                          placeholder="Choose an item"
                          searchPlaceholder="Search by code or name"
                          queryKey={
                            kind === 'issue'
                              ? inventoryKeys.stockPicker(warehouse?.id ?? '')
                              : inventoryKeys.itemPicker(
                                  warehouse?.type ?? 'GENERAL',
                                  kind === 'return',
                                )
                          }
                          search={(term, signal) =>
                            kind === 'issue'
                              ? searchStock(
                                  warehouse?.id ?? '',
                                  term,
                                  signal,
                                  (balance) =>
                                    found.current.set(balance.item.id, {
                                      item: balance.item,
                                      hint: `${formatQuantity(balance.available, { decimalPlaces: balance.item.decimal_places })} available`,
                                    }),
                                )
                              : searchItems(
                                  warehouse?.type ?? 'GENERAL',
                                  term,
                                  signal,
                                  (item) =>
                                    found.current.set(item.id, {
                                      item,
                                      hint: null,
                                    }),
                                  { includeInactive: kind === 'return' },
                                )
                          }
                          value={
                            line.item
                              ? {
                                  value: line.item.id,
                                  label: `${line.item.name} (${line.item.code})`,
                                }
                              : null
                          }
                          onChange={(option) =>
                            chooseItem(line.key, option?.value ?? null)
                          }
                        />
                      )
                    }
                  </Field>
                  {withCondition ? (
                    <Field label="Condition" required>
                      {(control) => (
                        <SelectField
                          {...control}
                          value={line.condition}
                          onChange={(condition) =>
                            changeLine(line.key, {
                              condition:
                                condition === 'DAMAGED' ? 'DAMAGED' : 'GOOD',
                            })
                          }
                          options={CONDITION_OPTIONS}
                        />
                      )}
                    </Field>
                  ) : null}
                  <Field
                    label={
                      line.item ? `Quantity (${line.item.unit})` : 'Quantity'
                    }
                    required
                    description={
                      line.item?.tracks_units
                        ? ['The number of units named below.', line.hint]
                            .filter(Boolean)
                            .join(' ')
                        : (line.hint ?? undefined)
                    }
                    error={problems.quantity}
                  >
                    {(control) =>
                      line.item?.tracks_units ? (
                        <Input
                          readOnly
                          className="tabular-nums"
                          value={
                            bySerial
                              ? parseSerials(line.serials).length
                              : line.units.length
                          }
                          {...control}
                        />
                      ) : (
                        <Input
                          inputMode="decimal"
                          autoComplete="off"
                          className="tabular-nums"
                          value={line.quantity}
                          onChange={(event) =>
                            changeLine(line.key, {
                              quantity: event.target.value,
                            })
                          }
                          {...control}
                        />
                      )
                    }
                  </Field>
                  <div className="flex justify-end sm:pt-5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={lines.length === 1}
                      aria-label={`Remove line ${index + 1}`}
                      onClick={() =>
                        setLines((current) =>
                          current.filter((other) => other.key !== line.key),
                        )
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  {line.item?.tracks_units ? (
                    bySerial ? (
                      <SerialsInput
                        label={`Serial numbers of ${line.item.name}`}
                        description="Scan or type each unit's serial number on its own line."
                        value={line.serials}
                        onChange={(serials) =>
                          changeLine(line.key, { serials })
                        }
                        error={problems.serials}
                      />
                    ) : (
                      <UnitChooser
                        label={`Units of ${line.item.name}`}
                        description={
                          issue
                            ? `Units that left on ${issue.reference} and are still out.`
                            : 'Units in stock in this warehouse.'
                        }
                        filters={unitFilters(line.item)}
                        value={line.units}
                        onChange={(units) => changeLine(line.key, { units })}
                        error={problems.serials}
                      />
                    )
                  ) : null}
                  {line.item?.tracks_units && line.crossReason !== null ? (
                    <Field
                      label="Why these are different units"
                      required
                      description="These serial numbers are already recorded under another item. If they really are other units, say why; the reason is kept in the audit log."
                      className="sm:col-span-full"
                    >
                      {(control) => (
                        <Input
                          autoComplete="off"
                          maxLength={500}
                          value={line.crossReason ?? ''}
                          onChange={(event) =>
                            changeLine(line.key, {
                              crossReason: event.target.value,
                            })
                          }
                          {...control}
                        />
                      )}
                    </Field>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  { key: nextKey.current++, ...EMPTY_LINE },
                ])
              }
            >
              <Plus aria-hidden />
              Add a line
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {kind === 'return' && !issue ? (
          <Button asChild variant="ghost" className="sm:mr-auto">
            <Link href="/inventory/issues">Find the issue instead</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href={issue ? `/inventory/issues/${issue.id}` : copy.listHref}>
            Cancel
          </Link>
        </Button>
        <Button type="submit">Review {copy.noun}</Button>
      </div>
    </form>
  );
}
