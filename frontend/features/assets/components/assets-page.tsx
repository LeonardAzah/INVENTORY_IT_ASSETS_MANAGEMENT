'use client';

import { Plus, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { Can } from '@/components/shared/can';
import { DataTable, type Column } from '@/components/shared/data-table';
import {
  EntityPicker,
  type PickerOption,
} from '@/components/shared/entity-picker';
import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import {
  FilterBar,
  FilterSlot,
  Pagination,
  SearchInput,
} from '@/components/shared/list-controls';
import { PageHeader } from '@/components/shared/page-header';
import { SelectField } from '@/components/shared/select-field';
import { EmptyState } from '@/components/shared/states';
import { SwitchField } from '@/components/shared/switch-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ROW_LINK } from '@/features/accounts/components/shared';
import { useCurrentUser } from '@/features/auth/session';
import {
  ASSET_CLASS_LABELS,
  ASSET_CLASS_OPTIONS,
} from '@/features/catalogue/types';
import { inventoryKeys, searchItems } from '@/features/inventory/api';
import { isUncertainOutcome } from '@/features/inventory/document-errors';
import { useOrganizationOptions } from '@/features/organization/api';
import { isApiError } from '@/lib/api/errors';
import { formatDate } from '@/lib/format/date';
import { useListParams } from '@/lib/url/list-params';

import {
  assetKeys,
  searchLocations,
  useAssetList,
  useDiscoverAsset,
  usePendingRegistration,
} from '../api';
import {
  holderOf,
  SOURCE_OPTIONS,
  STATUS_LABELS,
  STATUS_OPTIONS,
  type Asset,
  type AssetStatus,
} from '../types';

const LINKED = [
  'region',
  'item',
  'location',
  'custody_warehouse',
  'employee',
  'department',
] as const;
const FILTERS = ['status', 'asset_class', 'source', ...LINKED] as const;

const TEXTAREA =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive md:text-sm';

const STATUS_VARIANT: Record<
  AssetStatus,
  'default' | 'outline' | 'ghost' | 'destructive' | 'secondary'
> = {
  UNKNOWN: 'secondary',
  AVAILABLE: 'default',
  ASSIGNED: 'outline',
  RETURNED: 'secondary',
  MAINTENANCE: 'secondary',
  DAMAGED: 'destructive',
  LOST: 'destructive',
  RETIRED: 'ghost',
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const COLUMNS: Column<Asset>[] = [
  {
    id: 'tag',
    header: 'Asset tag',
    sortField: 'asset_tag',
    primary: true,
    className: 'whitespace-nowrap',
    cell: (asset) => (
      <Link href={`/it/assets/${asset.id}`} className={ROW_LINK}>
        {asset.asset_tag}
      </Link>
    ),
  },
  {
    id: 'item',
    header: 'Item',
    cell: (asset) => (
      <span className="flex flex-col">
        {asset.item.name}
        <span className="text-xs text-neutral-600">
          {ASSET_CLASS_LABELS[asset.item.asset_class] ?? asset.item.asset_class}
        </span>
      </span>
    ),
  },
  {
    id: 'serial',
    header: 'Serial number',
    className: 'whitespace-nowrap',
    cell: (asset) => asset.serial_number || '–',
  },
  {
    id: 'status',
    header: 'Status',
    sortField: 'status',
    cell: (asset) => <AssetStatusBadge status={asset.status} />,
  },
  {
    id: 'holder',
    header: 'With',
    cell: (asset) => (
      <span className="flex flex-col">
        {holderOf(asset)}
        {asset.assignment &&
        (asset.assignment.employee || asset.assignment.department) ? (
          <span className="text-xs text-neutral-600">
            {asset.assignment.location.name}
          </span>
        ) : asset.custody_warehouse ? (
          <span className="text-xs text-neutral-600">In the IT warehouse</span>
        ) : null}
      </span>
    ),
  },
  { id: 'region', header: 'Region', cell: (asset) => asset.region.name },
  {
    id: 'registered',
    header: 'Registered',
    sortField: 'registered_at',
    className: 'whitespace-nowrap',
    cell: (asset) => formatDate(asset.registered_at.slice(0, 10)),
  },
];

export function AssetsPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useAssetList(
    list.query,
  );
  const filters = list.state.filters;
  const [discovering, setDiscovering] = useState(false);
  const narrowed = LINKED.some((key) => filters[key]);
  const discover = (
    <Can anyOf={['IT_ASSET_REGISTER']}>
      <Button variant="outline" onClick={() => setDiscovering(true)}>
        <Plus aria-hidden />
        Record a discovery
      </Button>
    </Can>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Asset register"
        description="Every unit of IT equipment, each with its own tag. New units are registered from Pending registration; equipment found without a record is recorded as a discovery."
        actions={discover}
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search assets"
            placeholder="Search by tag, serial number or item"
            value={list.state.search}
            onChange={(search) => list.update({ search })}
          />
        }
      >
        <FilterSlot>
          <SelectField
            aria-label="Status"
            noneLabel="Any status"
            value={filters.status}
            onChange={(status) => list.update({ filters: { status } })}
            options={STATUS_OPTIONS}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Class"
            noneLabel="Any class"
            value={filters.asset_class}
            onChange={(asset_class) =>
              list.update({ filters: { asset_class } })
            }
            options={ASSET_CLASS_OPTIONS}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Came in by"
            noneLabel="Any source"
            value={filters.source}
            onChange={(source) => list.update({ filters: { source } })}
            options={SOURCE_OPTIONS}
          />
        </FilterSlot>
        {narrowed ? (
          <Badge variant="outline" className="self-start sm:self-auto">
            Narrowed by a link
          </Badge>
        ) : null}
      </FilterBar>
      <DataTable
        caption="Assets"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(asset) => asset.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No assets match"
              description="Try a different search or filter."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No assets to show"
              description="No IT equipment is registered where you can see it. IT staff see their region; managers see what is located in their scope."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="assets"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {discovering ? (
        <DiscoverDialog onClose={() => setDiscovering(false)} />
      ) : null}
    </div>
  );
}

/**
 * Records equipment that exists but has no record. It starts as "Unknown" and is then
 * verified. If it is really one of the units still waiting to be registered, it can be
 * counted against that receipt or acquisition, so no extra unit appears.
 */
function DiscoverDialog({ onClose }: { onClose: () => void }) {
  const me = useCurrentUser();
  const router = useRouter();
  const discover = useDiscoverAsset();
  const regions = useOrganizationOptions('regions', { is_active: true });
  const mine = (regions.data?.records ?? []).filter((region) =>
    me.it_regions.includes(region.id),
  );
  const [regionId, setRegionId] = useState(
    me.it_regions.length === 1 ? me.it_regions[0] : '',
  );
  const [item, setItem] = useState<PickerOption | null>(null);
  const [serial, setSerial] = useState('');
  const [lot, setLot] = useState('');
  const [location, setLocation] = useState<PickerOption | null>(null);
  const [intoCustody, setIntoCustody] = useState(false);
  const [notes, setNotes] = useState('');
  const [candidate, setCandidate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [known, setKnown] = useState<{
    id: string;
    tag: string;
    lost: boolean;
  } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const waiting = usePendingRegistration(
    { region: regionId, item: item?.value, page_size: 100 },
    Boolean(regionId && item),
  );
  const candidates = regionId && item ? (waiting.data?.results ?? []) : [];

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (!regionId) {
      problems.region = 'Choose the region.';
    }
    if (!item) {
      problems.item = 'Choose the item.';
    }
    if (!location) {
      problems.location = 'Choose where it was found.';
    }
    if (notes.trim() === '') {
      problems.notes = 'Say where and how it was found.';
    }
    setErrors(problems);
    setGeneral(null);
    setKnown(null);
    setUncertain(false);
    if (!item || !location || Object.keys(problems).length > 0) {
      return;
    }
    const chosen = candidates.find(
      (row) => (row.receipt_line_id ?? row.acquisition_id) === candidate,
    );
    discover.mutate(
      {
        item_id: item.value,
        found_at_location_id: location.value,
        into_custody: intoCustody,
        notes: notes.trim(),
        ...(serial.trim() ? { serial_number: serial.trim() } : {}),
        ...(lot.trim() ? { lot_number: lot.trim() } : {}),
        ...(chosen?.receipt_line_id
          ? { candidate_receipt_line_id: chosen.receipt_line_id }
          : {}),
        ...(chosen?.acquisition_id
          ? { candidate_acquisition_id: chosen.acquisition_id }
          : {}),
        client_request_id: requestId,
      },
      {
        onSuccess: (response) => {
          toast.success(response.message);
          onClose();
          router.push(`/it/assets/${response.data.id}`);
        },
        onError: (error) => {
          if (isUncertainOutcome(error)) {
            setUncertain(true);
            return;
          }
          const code = isApiError(error) ? error.errorCode : undefined;
          const message = isApiError(error)
            ? error.message
            : 'Something went wrong. Please try again.';
          const context = isApiError(error) ? error.context : undefined;
          if (
            (code === 'USE_FOUND_FLOW' || code === 'DUPLICATE_SERIAL') &&
            typeof context?.asset_id === 'string'
          ) {
            setKnown({
              id: context.asset_id,
              tag: String(context.asset_tag ?? ''),
              lost: code === 'USE_FOUND_FLOW',
            });
            setErrors({ serial: message });
          } else if (code === 'LOCATION_INACTIVE') {
            setErrors({ location: message });
          } else if (code === 'ITEM_NOT_SERIALIZED') {
            setErrors({ item: message });
          } else if (
            code === 'CANDIDATE_ITEM_MISMATCH' ||
            code === 'CANDIDATE_REGION_MISMATCH' ||
            code === 'NOTHING_LEFT_TO_REGISTER'
          ) {
            setErrors({ candidate: message });
          } else {
            setGeneral(message);
          }
        },
      },
    );
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Record a discovery"
      description="For equipment that exists but has no record. It is registered as “Unknown (to be verified)”, then given its real status."
      onSubmit={submit}
      submitLabel="Record the discovery"
      submittingLabel="Recording…"
      isSubmitting={discover.isPending}
      error={general}
    >
      {uncertain ? (
        <Alert variant="default">
          <TriangleAlert aria-hidden />
          <AlertTitle>
            We could not confirm that the discovery was recorded
          </AlertTitle>
          <AlertDescription>
            The server did not answer, so it may or may not have gone through.
            Try again: it is safe, because the same request is never applied
            twice.
          </AlertDescription>
        </Alert>
      ) : null}
      {known ? (
        <Alert variant="default">
          <TriangleAlert aria-hidden />
          <AlertTitle>
            {known.lost
              ? 'This asset is recorded as lost'
              : 'This asset is already registered'}
          </AlertTitle>
          <AlertDescription>
            <Link href={`/it/assets/${known.id}`} className={ROW_LINK}>
              Open {known.tag}
            </Link>
            {known.lost
              ? ' and record it as found there.'
              : ' instead of recording a discovery.'}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Region" required error={errors.region || undefined}>
          {(control) => (
            <SelectField
              {...control}
              placeholder={regions.isLoading ? 'Loading…' : 'Choose a region'}
              value={regionId}
              onChange={(value) => {
                setRegionId(value);
                setLocation(null);
                setCandidate('');
              }}
              options={mine.map((region) => ({
                value: region.id,
                label: region.name,
              }))}
            />
          )}
        </Field>
        <Field label="Item" required error={errors.item || undefined}>
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
                setCandidate('');
                setErrors((current) => ({ ...current, item: '' }));
              }}
            />
          )}
        </Field>
        <Field label="Serial number" error={errors.serial || undefined}>
          {(control) => (
            <Input
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={100}
              value={serial}
              onChange={(event) => {
                setSerial(event.target.value);
                setKnown(null);
                setErrors((current) => ({ ...current, serial: '' }));
              }}
              {...control}
            />
          )}
        </Field>
        <Field label="Lot number">
          {(control) => (
            <Input
              autoComplete="off"
              maxLength={100}
              value={lot}
              onChange={(event) => setLot(event.target.value)}
              {...control}
            />
          )}
        </Field>
      </div>
      <Field label="Found at" required error={errors.location || undefined}>
        {(control) => (
          <EntityPicker
            {...control}
            disabled={!regionId}
            placeholder={
              regionId ? 'Choose a location' : 'Choose the region first'
            }
            searchPlaceholder="Search by name"
            queryKey={assetKeys.locationPicker(regionId)}
            search={(term, signal) => searchLocations(regionId, term, signal)}
            value={location}
            onChange={(option) => {
              setLocation(option);
              setErrors((current) => ({ ...current, location: '' }));
            }}
          />
        )}
      </Field>
      <SwitchField
        label="Brought into the IT warehouse"
        description="Turn on if the unit is now in the IT warehouse. Otherwise it is recorded at the place it was found."
        checked={intoCustody}
        onChange={setIntoCustody}
      />
      {candidates.length > 0 ? (
        <Field
          label="Count it against"
          description="If this is one of the units still waiting to be registered, choose where it came in. No extra unit is then added."
          error={errors.candidate || undefined}
        >
          {(control) => (
            <SelectField
              {...control}
              noneLabel="Nothing: it is a true discovery"
              value={candidate}
              onChange={(value) => {
                setCandidate(value);
                setErrors((current) => ({ ...current, candidate: '' }));
              }}
              options={candidates.map((row) => ({
                value: row.receipt_line_id ?? row.acquisition_id ?? '',
                label: `${row.reference} (${row.remaining} still to register)`,
              }))}
            />
          )}
        </Field>
      ) : null}
      <Field
        label="How it was found"
        required
        error={errors.notes || undefined}
      >
        {(control) => (
          <textarea
            rows={2}
            className={TEXTAREA}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              setErrors((current) => ({ ...current, notes: '' }));
            }}
            {...control}
          />
        )}
      </Field>
    </FormDialog>
  );
}
