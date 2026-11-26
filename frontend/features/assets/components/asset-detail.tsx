'use client';

import {
  Link2,
  MapPin,
  Pencil,
  RefreshCw,
  SearchCheck,
  TriangleAlert,
  Undo2,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROW_LINK } from '@/features/accounts/components/shared';
import { useCurrentUser } from '@/features/auth/session';
import { ASSET_CLASS_LABELS } from '@/features/catalogue/types';
import {
  BackLink,
  Detail,
  DocumentShell,
} from '@/features/inventory/components/document-detail';
import { formatDate, formatDateTime } from '@/lib/format/date';
import { can } from '@/lib/permissions/codes';

import { useAsset, useAssetHistory, useRelationships } from '../api';
import {
  COMPUTER_TEXT_FIELDS,
  EVENT_LABELS,
  SOURCE_LABELS,
  statusLabel,
  type Asset,
  type AssetEvent,
  type Relationship,
} from '../types';
import {
  AssignDialog,
  EditAssetDialog,
  FoundDialog,
  LinkDialog,
  linkKindOf,
  RelocateDialog,
  ReturnDialog,
  statusChoices,
  StatusDialog,
  UnlinkDialog,
} from './asset-dialogs';
import { AssetStatusBadge } from './assets-page';

const BACK = { href: '/it/assets', label: 'Asset register' };

type DialogName =
  'assign' | 'return' | 'relocate' | 'status' | 'found' | 'edit' | 'link';

export function AssetDetail({ id }: { id: string }) {
  const query = useAsset(id);
  return (
    <DocumentShell
      query={query}
      found={Boolean(query.data)}
      noun="asset"
      back={BACK}
    >
      {query.data ? <Loaded asset={query.data} /> : null}
    </DocumentShell>
  );
}

function Loaded({ asset }: { asset: Asset }) {
  const me = useCurrentUser();
  const [dialog, setDialog] = useState<{
    name: DialogName;
    asset: Asset;
  } | null>(null);
  const open = (name: DialogName) => setDialog({ name, asset });
  const [unlinking, setUnlinking] = useState<Relationship | null>(null);
  const mine = me.it_regions.includes(asset.region.id);
  const may = (code: Parameters<typeof can>[1]) => mine && can(me, code);
  const { status, item, assignment } = asset;
  const inWarehouse = asset.custody_warehouse !== null;
  const closed = status === 'RETIRED';
  const close = () => setDialog(null);

  const actions = [
    may('IT_ASSET_ASSIGN') &&
    ['UNKNOWN', 'AVAILABLE', 'ASSIGNED'].includes(status)
      ? {
          name: 'assign' as const,
          label: status === 'ASSIGNED' ? 'Reassign' : 'Assign',
          icon: UserPlus,
          primary: status !== 'ASSIGNED',
        }
      : null,
    may('IT_ASSET_RETURN') && status === 'ASSIGNED'
      ? {
          name: 'return' as const,
          label: 'Record the return',
          icon: Undo2,
          primary: true,
        }
      : null,
    may('IT_ASSET_MAINTAIN') && status === 'LOST'
      ? {
          name: 'found' as const,
          label: 'Record as found',
          icon: SearchCheck,
          primary: true,
        }
      : null,
    mine && statusChoices(asset, me).length > 0
      ? {
          name: 'status' as const,
          label: 'Change status',
          icon: RefreshCw,
          primary: false,
        }
      : null,
    may('IT_ASSET_RELOCATE') && !inWarehouse && status !== 'LOST' && !closed
      ? {
          name: 'relocate' as const,
          label: 'Relocate',
          icon: MapPin,
          primary: false,
        }
      : null,
    may('IT_ASSET_UPDATE') && !closed
      ? {
          name: 'edit' as const,
          label: 'Edit details',
          icon: Pencil,
          primary: false,
        }
      : null,
  ].filter((action) => action !== null);

  return (
    <>
      <BackLink {...BACK} />
      <PageHeader
        title={asset.asset_tag}
        description={`${item.name}${asset.serial_number ? ` · serial ${asset.serial_number}` : ' · no serial number'}`}
        actions={
          actions.length > 0 ? (
            <>
              {actions.map((action) => (
                <Button
                  key={action.name}
                  variant={action.primary ? 'default' : 'outline'}
                  onClick={() => open(action.name)}
                >
                  <action.icon aria-hidden />
                  {action.label}
                </Button>
              ))}
            </>
          ) : null
        }
      />
      {asset.critical_observations ? (
        <Alert variant="default">
          <TriangleAlert aria-hidden />
          <AlertTitle>Critical observations</AlertTitle>
          <AlertDescription>
            <span className="whitespace-pre-line">
              {asset.critical_observations}
            </span>
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {item.name}
            <AssetStatusBadge status={status} />
          </CardTitle>
          <CardDescription>
            {status === 'UNKNOWN'
              ? 'Not yet verified. Check the unit, then assign it or give it its real status.'
              : status === 'RETURNED'
                ? 'Back in the IT warehouse, to be inspected before it is used again.'
                : closed
                  ? 'Retired: its record is kept, and nothing more can be done with it.'
                  : inWarehouse
                    ? 'Held by the IT warehouse.'
                    : 'Outside the IT warehouse.'}
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
            <Detail term="Serial number">{asset.serial_number || '–'}</Detail>
            <Detail term="Lot number">{asset.lot_number || '–'}</Detail>
            <Detail term="Region">{asset.region.name}</Detail>
            <Detail term="Where it is">
              {asset.custody_warehouse ? (
                <>
                  <Link
                    href={`/warehouses/${asset.custody_warehouse.id}`}
                    className={ROW_LINK}
                  >
                    {asset.custody_warehouse.name}
                  </Link>{' '}
                  (IT warehouse)
                </>
              ) : (
                (asset.location?.name ?? 'Not recorded')
              )}
            </Detail>
            <Detail term="Came in by">
              {SOURCE_LABELS[asset.source] ?? asset.source}
            </Detail>
            <Detail term="Registered">
              {formatDateTime(asset.registered_at)}
            </Detail>
          </dl>
        </CardContent>
      </Card>
      {assignment ? (
        <Card>
          <CardHeader>
            <CardTitle>Current assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail term="Assigned to">
                {assignment.employee ? (
                  <>
                    <Link
                      href={`/employees/${assignment.employee.id}`}
                      className={ROW_LINK}
                    >
                      {assignment.employee.first_name}{' '}
                      {assignment.employee.last_name}
                    </Link>{' '}
                    <span className="text-neutral-600">
                      ({assignment.employee.matricule})
                    </span>
                  </>
                ) : assignment.department ? (
                  `${assignment.department.name} (department)`
                ) : (
                  'Nobody in particular: it serves a place'
                )}
              </Detail>
              <Detail term="Location">{assignment.location.name}</Detail>
              <Detail term="Since">
                {formatDateTime(assignment.assigned_at)}
              </Detail>
              {assignment.notes ? (
                <Detail term="Notes" className="sm:col-span-2 lg:col-span-3">
                  <span className="whitespace-pre-line">
                    {assignment.notes}
                  </span>
                </Detail>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      ) : null}
      {asset.computer_details ? (
        <Card>
          <CardHeader>
            <CardTitle>Computer details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {COMPUTER_TEXT_FIELDS.map((field) => (
                <Detail key={field.name} term={field.label}>
                  {asset.computer_details?.[field.name] || '–'}
                </Detail>
              ))}
              <Detail term="Deployment date">
                {asset.computer_details.deployment_date
                  ? formatDate(asset.computer_details.deployment_date)
                  : '–'}
              </Detail>
            </dl>
          </CardContent>
        </Card>
      ) : null}
      <Links
        asset={asset}
        mayChange={may('IT_ASSET_UPDATE') && !closed}
        onLink={() => open('link')}
        onUnlink={setUnlinking}
      />
      <History assetId={asset.id} />
      {dialog?.name === 'assign' ? (
        <AssignDialog asset={dialog.asset} onClose={close} />
      ) : null}
      {dialog?.name === 'return' ? (
        <ReturnDialog asset={dialog.asset} onClose={close} />
      ) : null}
      {dialog?.name === 'relocate' ? (
        <RelocateDialog asset={dialog.asset} onClose={close} />
      ) : null}
      {dialog?.name === 'status' ? (
        <StatusDialog asset={dialog.asset} onClose={close} />
      ) : null}
      {dialog?.name === 'found' ? (
        <FoundDialog asset={dialog.asset} onClose={close} />
      ) : null}
      {dialog?.name === 'edit' ? (
        <EditAssetDialog asset={dialog.asset} onClose={close} />
      ) : null}
      {dialog?.name === 'link' ? (
        <LinkDialog asset={dialog.asset} onClose={close} />
      ) : null}
      {unlinking ? (
        <UnlinkDialog
          asset={asset}
          relationship={unlinking}
          onClose={() => setUnlinking(null)}
        />
      ) : null}
    </>
  );
}

type LinksProps = {
  asset: Asset;
  mayChange: boolean;
  onLink: () => void;
  onUnlink: (relationship: Relationship) => void;
};

/** What goes with this asset: a computer's peripherals and printers, or the computer a peripheral belongs to. */
function Links({ asset, mayChange, onLink, onUnlink }: LinksProps) {
  const { data, error, isLoading, isFetching, refetch } = useRelationships(
    asset.id,
  );
  const isComputer = asset.item.asset_class === 'COMPUTER';
  // Only computers, their peripherals and printers take part in links.
  const linkable = isComputer || linkKindOf(asset) !== null;
  if (!linkable && (data ?? []).length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked equipment</CardTitle>
        <CardDescription>
          {isComputer
            ? 'The peripherals and shared printers of this computer.'
            : 'The computer this goes with.'}{' '}
          A link is information only: each asset is assigned and moved on its
          own.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : !data ? (
          <ErrorState
            title="The links could not be loaded"
            error={error}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : data.length === 0 ? (
          <p className="text-sm text-neutral-600">Nothing is linked.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {data.map((relationship) => {
              const other =
                relationship.asset.id === asset.id
                  ? relationship.related_asset
                  : relationship.asset;
              return (
                <li
                  key={relationship.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium wrap-break-word">
                      <Link
                        href={`/it/assets/${other.id}`}
                        className={ROW_LINK}
                      >
                        {other.asset_tag}
                      </Link>{' '}
                      {other.item}
                    </p>
                    <p className="text-sm text-neutral-600">
                      {relationship.asset.id !== asset.id
                        ? relationship.kind === 'SHARED_PRINTER_FOR'
                          ? 'Shared printer'
                          : 'Peripheral'
                        : relationship.kind === 'SHARED_PRINTER_FOR'
                          ? 'A computer it prints for'
                          : 'Its computer'}{' '}
                      · {statusLabel(other.status)}
                    </p>
                  </div>
                  {mayChange ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onUnlink(relationship)}
                      aria-label={`End the link with ${other.asset_tag}`}
                    >
                      End link
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {mayChange && linkable ? (
          <div>
            <Button variant="outline" size="sm" onClick={onLink}>
              <Link2 aria-hidden />
              {isComputer ? 'Link equipment' : 'Link to a computer'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

const DETAIL_LABELS: Record<string, string> = {
  lot_number: 'Lot number',
  critical_observations: 'Critical observations',
  ...Object.fromEntries(
    COMPUTER_TEXT_FIELDS.map((field) => [
      `computer.${field.name}`,
      field.label,
    ]),
  ),
  'computer.deployment_date': 'Deployment date',
};

const shown = (value: unknown) =>
  value === null || value === undefined || value === ''
    ? 'nothing'
    : String(value);

function summary(event: AssetEvent): string[] {
  const lines: string[] = [];
  if (
    event.from_status &&
    event.to_status &&
    event.from_status !== event.to_status
  ) {
    lines.push(
      `${statusLabel(event.from_status)} → ${statusLabel(event.to_status)}`,
    );
  } else if (event.to_status && event.event_type !== 'STATUS_CHANGED') {
    lines.push(statusLabel(event.to_status));
  }
  const { before, after } = event.details as {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  if (event.event_type === 'SPEC_CHANGED' && before && after) {
    for (const key of Object.keys(after)) {
      lines.push(
        `${DETAIL_LABELS[key] ?? key}: ${shown(before[key])} → ${shown(after[key])}`,
      );
    }
  }
  if (
    event.event_type === 'ASSIGNED' &&
    typeof event.details.assignee_type === 'string'
  ) {
    lines.push(
      {
        EMPLOYEE: 'To an employee',
        DEPARTMENT: 'To a department',
        LOCATION: 'To a place',
      }[event.details.assignee_type] ?? '',
    );
  }
  if (event.event_type === 'FOUND' || event.event_type === 'REGISTERED') {
    if (event.details.into_custody === true) {
      lines.push('Brought into the IT warehouse');
    }
  }
  return lines.filter(Boolean);
}

function History({ assetId }: { assetId: string }) {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, isFetching, refetch } = useAssetHistory(
    assetId,
    page,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>
          Everything that happened to this unit, newest first. Nothing here can
          be changed or removed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data ? (
          <ErrorState
            title="The history could not be loaded"
            error={error}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : (
          <>
            <ol aria-label="History" className="flex flex-col divide-y">
              {data.results.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-medium">
                      {EVENT_LABELS[event.event_type] ?? event.event_type}
                    </p>
                    <p className="text-sm text-neutral-600">
                      {formatDateTime(event.occurred_at)} · {event.actor}
                    </p>
                  </div>
                  {summary(event).map((line) => (
                    <p key={line} className="text-sm wrap-break-word">
                      {line}
                    </p>
                  ))}
                  {event.reason ? (
                    <p className="text-sm wrap-break-word text-neutral-600">
                      “{event.reason}”
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            {data.pagination.total_pages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <p className="text-sm text-neutral-600">
                  Page {data.pagination.page} of {data.pagination.total_pages} ·{' '}
                  {data.pagination.count} events
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || isFetching}
                    onClick={() => setPage(page - 1)}
                  >
                    Newer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.pagination.total_pages || isFetching}
                    onClick={() => setPage(page + 1)}
                  >
                    Older
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
