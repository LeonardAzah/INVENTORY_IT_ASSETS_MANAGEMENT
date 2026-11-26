'use client';

import Link from 'next/link';

import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/states';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROW_LINK } from '@/features/accounts/components/shared';
import {
  EVENT_LABELS,
  statusLabel,
  type EventType,
} from '@/features/assets/types';
// import { AccessSummary } from '@/features/auth/components/access-summary';
import { useCurrentUser } from '@/features/auth/session';
import {
  TRANSACTION_TYPE_LABELS,
  type TransactionType,
} from '@/features/inventory/types';
import { formatQuantity } from '@/lib/format/quantity';
import { can } from '@/lib/permissions/codes';

import { useDashboard, type Dashboard } from '../api';

/** "2026-10-12 09:44", as the backend sends it in local time, shown like every other date here. */
function when(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}` : value;
}

type TileProps = {
  label: string;
  value: number;
  href: string;
  note?: string;
  attention?: boolean;
};

/** One figure, linking to the list it counts. The whole tile is the link, so it is an easy target. */
function Tile({ label, value, href, note, attention }: TileProps) {
  return (
    <li>
      <Link
        href={href}
        className="bg-card hover:bg-accent focus-visible:ring-ring flex h-full flex-col gap-1 rounded-lg border p-4 shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span className="text-sm text-neutral-600">{label}</span>
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {value}
        </span>
        {note ? (
          <span
            className={
              attention && value > 0
                ? 'text-sm font-medium'
                : 'text-sm text-neutral-600'
            }
          >
            {note}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export function DashboardPage() {
  const me = useCurrentUser();
  const stock = can(me, 'INVENTORY_VIEW');
  const assets = can(me, 'IT_ASSET_VIEW');
  const { data, error, isLoading, isFetching, refetch } = useDashboard();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Welcome, ${me.name}`}
        description="Where things stand in what you can see."
      />
      {!stock && !assets ? null : isLoading ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          role="status"
          aria-label="Loading the dashboard"
        >
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : !data ? (
        <div className="bg-card rounded-lg border">
          <ErrorState
            title="The dashboard could not be loaded"
            error={error}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        </div>
      ) : (
        <Figures
          data={data}
          stock={stock}
          assets={assets}
          register={can(me, 'IT_ASSET_REGISTER')}
        />
      )}
      {/* <AccessSummary /> */}
    </div>
  );
}

type FiguresProps = {
  data: Dashboard;
  stock: boolean;
  assets: boolean;
  register: boolean;
};

function Figures({ data, stock, assets, register }: FiguresProps) {
  const statuses = Object.entries(data.assets.by_status).filter(
    ([, count]) => count > 0,
  );

  return (
    <>
      <ul
        aria-label="Key figures"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {stock ? (
          <>
            <Tile
              label="Warehouses"
              value={data.warehouses.active}
              href="/warehouses"
              note={
                data.warehouses.total > data.warehouses.active
                  ? `active, of ${data.warehouses.total}`
                  : 'active'
              }
            />
            <Tile
              label="Items in stock"
              value={data.stock.items_in_stock}
              href="/inventory/balances"
              note="with something on hand"
            />
            <Tile
              label="Low on stock"
              value={data.stock.low_stock}
              href="/inventory/balances?below_threshold=true"
              note={
                data.stock.low_stock > 0
                  ? 'at or below their threshold'
                  : 'nothing below its threshold'
              }
              attention
            />
            <Tile
              label="With unavailable stock"
              value={data.stock.with_unavailable}
              href="/inventory/balances?has_unavailable=true"
              note={
                data.stock.with_unavailable > 0
                  ? 'damaged units to write off or restore'
                  : 'no damaged units held'
              }
              attention
            />
          </>
        ) : null}
        {assets ? (
          <Tile
            label="IT assets"
            value={data.assets.total}
            href="/it/assets"
            note="registered"
          />
        ) : null}
        {register ? (
          <Tile
            label="Pending registration"
            value={data.assets.pending_registration}
            href="/it/pending-registration"
            note={
              data.assets.pending_registration > 0
                ? 'units received but not yet registered'
                : 'every unit is registered'
            }
            attention
          />
        ) : null}
      </ul>
      <div className="grid gap-6 lg:grid-cols-2">
        {assets ? (
          <Card>
            <CardHeader>
              <CardTitle>Assets by status</CardTitle>
              <CardDescription>
                Each status opens the register filtered to it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statuses.length === 0 ? (
                <p className="text-sm text-neutral-600">
                  No asset is registered where you can see it.
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {statuses.map(([status, count]) => (
                    <li
                      key={status}
                      className="flex items-center justify-between gap-4 py-1 first:pt-0 last:pb-0"
                    >
                      <Link
                        href={`/it/assets?status=${status}`}
                        className={ROW_LINK}
                      >
                        {statusLabel(status)}
                      </Link>
                      <span className="font-medium tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
        {assets ? (
          <Card>
            <CardHeader>
              <CardTitle>Latest asset events</CardTitle>
              <CardDescription>
                The ten most recent, newest first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.recent_asset_events.length === 0 ? (
                <p className="text-sm text-neutral-600">
                  Nothing has happened yet.
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {data.recent_asset_events.map((event, index) => (
                    <li
                      key={`${event.asset_tag}-${event.occurred_at}-${index}`}
                      className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0"
                    >
                      <p className="text-sm">
                        <span className="font-medium">{event.asset_tag}</span> ·{' '}
                        {EVENT_LABELS[event.event_type as EventType] ??
                          event.event_type}
                        {event.to_status
                          ? ` · ${statusLabel(event.to_status)}`
                          : ''}
                      </p>
                      <p className="text-xs wrap-break-word text-neutral-600">
                        {when(event.occurred_at)} · {event.by}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
        {stock ? (
          <Card className={assets ? 'lg:col-span-2' : undefined}>
            <CardHeader>
              <CardTitle>Latest stock movements</CardTitle>
              <CardDescription>
                The ten most recent, newest first.{' '}
                <Link
                  href="/inventory/transactions"
                  className={`${ROW_LINK} underline`}
                >
                  Open the ledger
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.recent_movements.length === 0 ? (
                <p className="text-sm text-neutral-600">
                  Nothing has moved yet.
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {data.recent_movements.map((movement, index) => (
                    <li
                      key={`${movement.reference}-${movement.item}-${index}`}
                      className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                    >
                      <p className="min-w-0 text-sm wrap-break-word">
                        <span className="font-medium">{movement.item}</span> ·{' '}
                        {TRANSACTION_TYPE_LABELS[
                          movement.type as TransactionType
                        ] ?? movement.type}{' '}
                        · {movement.warehouse}
                        <span className="block text-xs text-neutral-600">
                          {when(movement.occurred_at)} · {movement.reference}
                        </span>
                      </p>
                      {/* The sign carries the direction, so the meaning does not depend on colour. */}
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {formatQuantity(movement.quantity, { signed: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
