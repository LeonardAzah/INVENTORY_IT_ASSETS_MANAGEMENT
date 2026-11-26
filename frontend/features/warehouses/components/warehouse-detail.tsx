'use client';

import { ArrowLeft, Pencil, UserMinus, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { PageHeader } from '@/components/shared/page-header';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import {
  ActiveBadge,
  EmptyState,
  ErrorState,
  errorMessage,
} from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountLink, ROW_LINK } from '@/features/accounts/components/shared';
import { useCurrentUser } from '@/features/auth/session';
import { StockSummary } from '@/features/inventory/components/stock-summary';
import { refLabel } from '@/features/organization/types';
import { isApiError } from '@/lib/api/errors';
import { EMPTY, formatDateTime } from '@/lib/format/date';
import { can, isAdministrator } from '@/lib/permissions/codes';

import { useAssignments, useRemoveStoreKeeper, useWarehouse } from '../api';
import { TYPE_LABELS, type Warehouse } from '../types';
import { StoreKeeperDialog } from './store-keeper-dialog';
import { WarehouseDialog } from './warehouse-dialog';

const BACK_LINK =
  'inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

function BackLink() {
  return (
    <Link href="/warehouses" className={BACK_LINK}>
      <ArrowLeft className="size-4" aria-hidden />
      Warehouses
    </Link>
  );
}

function Detail({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm text-neutral-600">{term}</dt>
      <dd className="text-sm wrap-break-word">{children}</dd>
    </div>
  );
}

export function WarehouseDetail({ id }: { id: string }) {
  const {
    data: warehouse,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useWarehouse(id);

  if (isLoading) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="Loading warehouse"
      >
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!warehouse) {
    const missing = isApiError(error) && error.kind === 'not_found';
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <div className="bg-card rounded-lg border">
          {missing ? (
            <EmptyState
              title="Warehouse not found"
              description="This warehouse does not exist, or is outside what you can see."
            />
          ) : (
            <ErrorState
              title="The warehouse could not be loaded"
              error={error}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          )}
        </div>
      </div>
    );
  }
  return <Loaded warehouse={warehouse} />;
}

function Loaded({ warehouse }: { warehouse: Warehouse }) {
  const me = useCurrentUser();
  const [dialog, setDialog] = useState<'edit' | 'assign' | 'remove' | null>(
    null,
  );
  const close = () => setDialog(null);
  const leadsItHere =
    me.is_computing_chief && me.role_region?.id === warehouse.region.id;
  const mayEdit =
    can(me, 'WAREHOUSE_MANAGE') &&
    (warehouse.type === 'GENERAL' || isAdministrator(me) || leadsItHere);
  const keeper = warehouse.store_keeper;

  const representsRegion = me.represented_regions.includes(warehouse.region.id);
  const mayAssign =
    can(me, 'STORE_KEEPER_ASSIGN') &&
    (isAdministrator(me) ||
      (warehouse.is_regional_store ? representsRegion : !representsRegion));

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        title={warehouse.name}
        description={`Warehouse ${warehouse.code}`}
        actions={
          mayEdit ? (
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil aria-hidden />
              Edit
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Details
            <ActiveBadge active={warehouse.is_active} />
            {warehouse.is_regional_store ? (
              <Badge variant="outline">Regional store</Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            {warehouse.type === 'IT'
              ? 'An IT warehouse holds serialized equipment. Each region has one.'
              : 'A general warehouse holds items counted by quantity.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail term="Code">{warehouse.code}</Detail>
            <Detail term="Type">
              {TYPE_LABELS[warehouse.type] ?? warehouse.type}
            </Detail>
            <Detail term="Created">
              {formatDateTime(warehouse.created_at)}
            </Detail>
            <Detail term="Region">{refLabel(warehouse.region)}</Detail>
            <Detail term="Office">{refLabel(warehouse.office)}</Detail>
            <Detail term="Department">
              {warehouse.department ? refLabel(warehouse.department) : EMPTY}
            </Detail>
          </dl>
        </CardContent>
      </Card>

      {warehouse.type === 'IT' ? (
        <Card>
          <CardHeader>
            <CardTitle>Who operates it</CardTitle>
            <CardDescription>
              It is operated by the region&apos;s Chief of Service of Computing
              and IT Asset Manager.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`/organization/regions/${warehouse.region.id}`}
              className={ROW_LINK}
            >
              IT staff of {warehouse.region.name}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Store Keeper
                {keeper ? null : <Badge variant="secondary">Vacant</Badge>}
              </CardTitle>
              <CardDescription>
                Only the Store Keeper can record stock movements here. Managing
                the warehouse, or having it in your scope, does not allow that.
                {warehouse.is_regional_store
                  ? ' As the regional store, its Store Keeper is appointed by the Regional Representative.'
                  : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {keeper ? (
                <div>
                  <p className="font-medium wrap-break-word">
                    <AccountLink
                      id={keeper.account_id}
                      name={keeper.name}
                      linked={can(me, 'USER_MANAGE')}
                      inline
                    />
                    <span className="font-normal text-neutral-600">
                      {' '}
                      · {keeper.email}
                    </span>
                  </p>
                  <p className="text-sm text-neutral-600">
                    Since {formatDateTime(keeper.assigned_at)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-neutral-600">
                  Nobody keeps this warehouse, so no stock movement can be
                  recorded in it.
                </p>
              )}
              {mayAssign ? (
                <div className="flex flex-wrap gap-2">
                  {warehouse.is_active ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDialog('assign')}
                    >
                      <UserPlus aria-hidden />
                      {keeper ? 'Replace' : 'Assign a Store Keeper'}
                    </Button>
                  ) : null}
                  {keeper ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog('remove')}
                    >
                      <UserMinus aria-hidden />
                      Remove
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
          <History warehouse={warehouse} />
        </>
      )}

      <StockSummary by="warehouse" id={warehouse.id} />

      {dialog === 'edit' ? (
        <WarehouseDialog warehouse={warehouse} onClose={close} />
      ) : null}
      {dialog === 'assign' ? (
        <StoreKeeperDialog warehouse={warehouse} onClose={close} />
      ) : null}
      {dialog === 'remove' && keeper ? (
        <RemoveDialog
          warehouse={warehouse}
          keeperName={keeper.name}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

function History({ warehouse }: { warehouse: Warehouse }) {
  const { data, error, isLoading, isFetching, refetch } = useAssignments(
    warehouse.id,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Store Keeper history</CardTitle>
        <CardDescription>
          Everyone who has kept this warehouse, newest first. Nothing here is
          ever deleted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !data ? (
          <ErrorState
            title="The history could not be loaded"
            error={error}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : data.results.length === 0 ? (
          <p className="text-sm text-neutral-600">
            Nobody has kept this warehouse yet.
          </p>
        ) : (
          <>
            <ul className="flex flex-col divide-y">
              {data.results.map((assignment) => (
                <li
                  key={assignment.id}
                  className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
                >
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="wrap-break-word">
                      {assignment.user.name}
                    </span>
                    {assignment.ended_at ? null : (
                      <Badge variant="default">Current</Badge>
                    )}
                  </p>
                  <p className="text-sm text-neutral-600">
                    {formatDateTime(assignment.assigned_at)} to{' '}
                    {assignment.ended_at
                      ? formatDateTime(assignment.ended_at)
                      : 'now'}
                    {' · '}assigned by {assignment.assigned_by.name}
                  </p>
                  {assignment.ended_at ? (
                    <p className="text-sm wrap-break-word text-neutral-600">
                      Ended by {assignment.ended_by?.name ?? EMPTY}
                      {assignment.end_reason
                        ? `: ${assignment.end_reason}`
                        : ''}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            {data.pagination.count > data.results.length ? (
              <p className="mt-3 text-sm text-neutral-600">
                Showing the latest {data.results.length} of{' '}
                {data.pagination.count}.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RemoveDialog({
  warehouse,
  keeperName,
  onClose,
}: {
  warehouse: Warehouse;
  keeperName: string;
  onClose: () => void;
}) {
  const remove = useRemoveStoreKeeper(warehouse.id);
  return (
    <ReasonDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Remove ${keeperName} as Store Keeper`}
      description={`${warehouse.name} will have no Store Keeper, and no stock movement can be recorded in it until one is assigned.`}
      confirmLabel="Remove Store Keeper"
      isSubmitting={remove.isPending}
      error={remove.error ? errorMessage(remove.error) : null}
      onConfirm={(reason) =>
        remove.mutate(reason, {
          onSuccess: (response) => {
            toast.success(response.message);
            onClose();
          },
        })
      }
    />
  );
}
