'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';

import { Can } from '@/components/shared/can';
import { DataTable, type Column } from '@/components/shared/data-table';
import {
  EntityPicker,
  type PickerOption,
} from '@/components/shared/entity-picker';
import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import {
  DateFilter,
  FilterBar,
  Pagination,
  SearchInput,
} from '@/components/shared/list-controls';
import { PageHeader } from '@/components/shared/page-header';
import { SelectField } from '@/components/shared/select-field';
import { EmptyState } from '@/components/shared/states';
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
import { ROW_LINK } from '@/features/accounts/components/shared';
import { useCurrentUser } from '@/features/auth/session';
import { ASSET_CLASS_LABELS } from '@/features/catalogue/types';
import { inventoryKeys, searchItems } from '@/features/inventory/api';
import {
  BackLink,
  Detail,
  DocumentShell,
} from '@/features/inventory/components/document-detail';
import { isUncertainOutcome } from '@/features/inventory/document-errors';
import { useOrganizationOptions } from '@/features/organization/api';
import { isApiError } from '@/lib/api/errors';
import { formatDate, formatDateTime, today } from '@/lib/format/date';
import { applyServerErrors } from '@/lib/forms/server-errors';
import { can } from '@/lib/permissions/codes';
import { useListParams } from '@/lib/url/list-params';

import {
  useAcquisition,
  useAcquisitionList,
  useRecordAcquisition,
} from '../api';
import type { Acquisition } from '../types';
import { RegisterDialog, type RegisterSource } from './register-dialog';

const FILTERS = [
  'region',
  'item',
  'acquisition_date_from',
  'acquisition_date_to',
] as const;

const NUMBER = 'text-right tabular-nums whitespace-nowrap';
const TEXTAREA =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive md:text-sm';

const COLUMNS: Column<Acquisition>[] = [
  {
    id: 'reference',
    header: 'Reference',
    primary: true,
    className: 'whitespace-nowrap',
    cell: (acquisition) => (
      <Link href={`/it/acquisitions/${acquisition.id}`} className={ROW_LINK}>
        {acquisition.reference}
      </Link>
    ),
  },
  {
    id: 'date',
    header: 'Acquired',
    sortField: 'acquisition_date',
    className: 'whitespace-nowrap',
    cell: (acquisition) => formatDate(acquisition.acquisition_date),
  },
  {
    id: 'region',
    header: 'Region',
    cell: (acquisition) => acquisition.region.name,
  },
  {
    id: 'item',
    header: 'Item',
    cell: (acquisition) => (
      <span className="flex flex-col">
        {acquisition.item.name}
        <span className="text-xs text-neutral-600">
          {acquisition.item.code}
        </span>
      </span>
    ),
  },
  {
    id: 'source',
    header: 'Came from',
    cell: (acquisition) => acquisition.source,
  },
  {
    id: 'quantity',
    header: 'Units',
    className: NUMBER,
    cell: (acquisition) => acquisition.quantity,
  },
  {
    id: 'remaining',
    header: 'Still to register',
    className: NUMBER,
    cell: (acquisition) =>
      acquisition.remaining > 0 ? (
        <span className="font-medium">{acquisition.remaining}</span>
      ) : (
        'None'
      ),
  },
  {
    id: 'by',
    header: 'Recorded by',
    cell: (acquisition) => acquisition.recorded_by,
  },
];

export function AcquisitionsPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useAcquisitionList(
    list.query,
  );
  const filters = list.state.filters;
  const [recording, setRecording] = useState(false);
  const latest = today();
  const record = (
    <Can anyOf={['IT_ACQUISITION_RECORD']}>
      <Button onClick={() => setRecording(true)}>
        <Plus aria-hidden />
        Record an acquisition
      </Button>
    </Can>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Acquisitions"
        description="IT equipment that arrived outside the IT warehouse's receipts, such as a donation or a direct purchase. Its units are then registered like any others."
        actions={record}
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search acquisitions"
            placeholder="Search by reference or source"
            value={list.state.search}
            onChange={(search) => list.update({ search })}
          />
        }
      >
        <DateFilter
          label="Acquired from"
          value={filters.acquisition_date_from}
          max={filters.acquisition_date_to || latest}
          onChange={(acquisition_date_from) =>
            list.update({ filters: { acquisition_date_from } })
          }
        />
        <DateFilter
          label="Acquired to"
          value={filters.acquisition_date_to}
          min={filters.acquisition_date_from || undefined}
          max={latest}
          onChange={(acquisition_date_to) =>
            list.update({ filters: { acquisition_date_to } })
          }
        />
        {filters.item ? (
          <Badge variant="outline" className="self-start sm:self-end">
            One item only
          </Badge>
        ) : null}
      </FilterBar>
      <DataTable
        caption="Acquisitions"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(acquisition) => acquisition.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No acquisitions match"
              description="Try a different search or period."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No acquisitions yet"
              description="None has been recorded in the regions you can see."
              action={record}
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="acquisitions"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {recording ? (
        <AcquisitionDialog onClose={() => setRecording(false)} />
      ) : null}
    </div>
  );
}

const schema = z.object({
  region_id: z.string().min(1, 'Choose the region.'),
  item_id: z.string().min(1, 'Choose the item.'),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Enter a whole number of units.')
    .refine(
      (value) => Number(value) >= 1 && Number(value) <= 100_000,
      'Enter a number from 1 to 100,000.',
    ),
  acquisition_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date.')
    .refine(
      (value) => value <= today(),
      'The acquisition date cannot be in the future.',
    ),
  source: z
    .string()
    .trim()
    .min(1, 'Say where the equipment came from.')
    .max(255, 'Use at most 255 characters.'),
  notes: z.string(),
});
type Values = z.infer<typeof schema>;

function AcquisitionDialog({ onClose }: { onClose: () => void }) {
  const me = useCurrentUser();
  const record = useRecordAcquisition();
  const regions = useOrganizationOptions('regions', { is_active: true });
  const mine = (regions.data?.records ?? []).filter((region) =>
    me.it_regions.includes(region.id),
  );
  const [item, setItem] = useState<PickerOption | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      region_id: me.it_regions.length === 1 ? me.it_regions[0] : '',
      item_id: '',
      quantity: '',
      acquisition_date: today(),
      source: '',
      notes: '',
    },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    setUncertain(false);
    record.mutate(
      {
        ...values,
        quantity: Number(values.quantity),
        source: values.source.trim(),
        notes: values.notes.trim(),
        client_request_id: requestId,
      },
      {
        onSuccess: (response) => {
          toast.success(
            `${response.message} ${response.data.reference}: ${response.data.quantity} to register.`,
          );
          onClose();
        },
        onError: (error) => {
          if (isUncertainOutcome(error)) {
            setUncertain(true);
            return;
          }
          const code = isApiError(error) ? error.errorCode : undefined;
          if (code === 'ITEM_NOT_SERIALIZED' || code === 'ITEM_INACTIVE') {
            form.setError('item_id', {
              type: 'server',
              message: isApiError(error) ? error.message : '',
            });
          } else if (code === 'FUTURE_DATE') {
            form.setError('acquisition_date', {
              type: 'server',
              message: isApiError(error) ? error.message : '',
            });
          } else {
            setFormError(
              applyServerErrors(error, form.setError, [
                'region_id',
                'item_id',
                'quantity',
                'acquisition_date',
                'source',
                'notes',
              ]),
            );
          }
        },
      },
    );
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Record an acquisition"
      description="For equipment that did not come through a receipt into the IT warehouse. Recording it makes its units available to register."
      onSubmit={submit}
      submitLabel="Record the acquisition"
      submittingLabel="Recording…"
      isSubmitting={record.isPending}
      error={formError}
    >
      {uncertain ? (
        <Alert variant="default">
          <TriangleAlert aria-hidden />
          <AlertTitle>
            We could not confirm that the acquisition was recorded
          </AlertTitle>
          <AlertDescription>
            The server did not answer, so it may or may not have been recorded.
            Try again: it is safe, because the same acquisition is never
            recorded twice. If it was already recorded, you will get that one
            back.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Region" required error={errors.region_id?.message}>
          {(control) => (
            <Controller
              control={form.control}
              name="region_id"
              render={({ field }) => (
                <SelectField
                  {...control}
                  placeholder={
                    regions.isLoading ? 'Loading…' : 'Choose a region'
                  }
                  value={field.value}
                  onChange={field.onChange}
                  options={mine.map((region) => ({
                    value: region.id,
                    label: region.name,
                  }))}
                />
              )}
            />
          )}
        </Field>
        <Field
          label="Acquired on"
          required
          error={errors.acquisition_date?.message}
        >
          {(control) => (
            <Input
              type="date"
              max={today()}
              {...control}
              {...form.register('acquisition_date')}
            />
          )}
        </Field>
      </div>
      <Field
        label="Item"
        required
        description="An active IT item. Add it to the catalogue first if it is new."
        error={errors.item_id?.message}
      >
        {(control) => (
          <EntityPicker
            {...control}
            placeholder="Choose an item"
            searchPlaceholder="Search by code or name"
            queryKey={inventoryKeys.itemPicker('IT')}
            search={(term, signal) =>
              searchItems('IT', term, signal, () => undefined)
            }
            value={item}
            onChange={(option) => {
              setItem(option);
              form.setValue('item_id', option?.value ?? '', {
                shouldValidate: form.formState.isSubmitted,
              });
            }}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Number of units"
          required
          error={errors.quantity?.message}
        >
          {(control) => (
            <Input
              inputMode="numeric"
              autoComplete="off"
              className="tabular-nums"
              {...control}
              {...form.register('quantity')}
            />
          )}
        </Field>
        <Field
          label="Came from"
          required
          description="A donor, a supplier, another office."
          error={errors.source?.message}
        >
          {(control) => (
            <Input
              autoComplete="off"
              maxLength={255}
              {...control}
              {...form.register('source')}
            />
          )}
        </Field>
      </div>
      <Field label="Notes" error={errors.notes?.message}>
        {(control) => (
          <textarea
            rows={2}
            className={TEXTAREA}
            {...control}
            {...form.register('notes')}
          />
        )}
      </Field>
    </FormDialog>
  );
}

export function AcquisitionDetail({ id }: { id: string }) {
  const query = useAcquisition(id);
  return (
    <DocumentShell
      query={query}
      found={Boolean(query.data)}
      noun="acquisition"
      back={{ href: '/it/acquisitions', label: 'Acquisitions' }}
    >
      {query.data ? <Loaded acquisition={query.data} /> : null}
    </DocumentShell>
  );
}

function Loaded({ acquisition }: { acquisition: Acquisition }) {
  const me = useCurrentUser();
  const [registering, setRegistering] = useState<RegisterSource | null>(null);
  const mayRegister =
    can(me, 'IT_ASSET_REGISTER') &&
    me.it_regions.includes(acquisition.region.id);
  const { item } = acquisition;

  return (
    <>
      <BackLink href="/it/acquisitions" label="Acquisitions" />
      <PageHeader
        title={acquisition.reference}
        description="A recorded acquisition. It cannot be changed or deleted."
        actions={
          mayRegister && acquisition.remaining > 0 ? (
            <Button
              onClick={() =>
                setRegistering({
                  kind: 'ALTERNATIVE_ACQUISITION',
                  id: acquisition.id,
                  reference: acquisition.reference,
                  item: { id: item.id, code: item.code, name: item.name },
                  region: acquisition.region,
                  remaining: acquisition.remaining,
                })
              }
            >
              <Plus aria-hidden />
              Register a unit
            </Button>
          ) : null
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {item.name}
            {acquisition.remaining > 0 ? (
              <Badge variant="outline">
                {acquisition.remaining} still to register
              </Badge>
            ) : (
              <Badge variant="default">All registered</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {acquisition.registered_quantity} of {acquisition.quantity}{' '}
            {acquisition.quantity === 1 ? 'unit' : 'units'} registered as
            assets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail term="Item">
              <Link href={`/catalogue/items/${item.id}`} className={ROW_LINK}>
                {item.name}
              </Link>{' '}
              ({item.code})
            </Detail>
            <Detail term="Class">
              {ASSET_CLASS_LABELS[item.asset_class] ?? item.asset_class}
            </Detail>
            <Detail term="Brand and model">
              {[item.brand, item.model].filter(Boolean).join(' ') || '–'}
            </Detail>
            <Detail term="Region">{acquisition.region.name}</Detail>
            <Detail term="Acquired on">
              {formatDate(acquisition.acquisition_date)}
            </Detail>
            <Detail term="Came from">{acquisition.source}</Detail>
            <Detail term="Recorded by">{acquisition.recorded_by}</Detail>
            <Detail term="Recorded">
              {formatDateTime(acquisition.recorded_at)}
            </Detail>
            {acquisition.notes ? (
              <Detail term="Notes" className="sm:col-span-2 lg:col-span-3">
                <span className="whitespace-pre-line">{acquisition.notes}</span>
              </Detail>
            ) : null}
          </dl>
        </CardContent>
      </Card>
      {registering ? (
        <RegisterDialog
          source={registering}
          onClose={() => setRegistering(null)}
        />
      ) : null}
    </>
  );
}
