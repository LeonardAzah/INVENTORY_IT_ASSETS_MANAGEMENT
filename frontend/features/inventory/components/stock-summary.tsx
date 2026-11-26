'use client';

import Link from 'next/link';

import { ErrorState } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
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
import { formatQuantity } from '@/lib/format/quantity';
import { can } from '@/lib/permissions/codes';

import { useBalanceList } from '../api';

const SHOWN = 10;

type StockSummaryProps =
  { by: 'warehouse'; id: string } | { by: 'item'; id: string };

export function StockSummary(props: StockSummaryProps) {
  const me = useCurrentUser();
  const allowed = can(me, 'INVENTORY_VIEW');
  const { data, error, isLoading, isFetching, refetch } = useBalanceList(
    { [props.by]: props.id, page_size: SHOWN },
    allowed,
  );
  if (!allowed) {
    return null;
  }
  const all = `/inventory/balances?${props.by}=${props.id}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock</CardTitle>
        <CardDescription>
          {props.by === 'warehouse'
            ? 'What this warehouse holds now.'
            : 'Where this item is held, among the warehouses you can see.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !data ? (
          <ErrorState
            title="The stock could not be loaded"
            error={error}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : data.results.length === 0 ? (
          <p className="text-sm text-neutral-600">
            {props.by === 'warehouse'
              ? 'Nothing has been received here yet.'
              : 'None, in the warehouses you can see.'}
          </p>
        ) : (
          <>
            <ul className="flex flex-col divide-y">
              {data.results.map((balance) => (
                <li
                  key={balance.id}
                  className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium wrap-break-word">
                      {props.by === 'warehouse'
                        ? balance.item.name
                        : balance.warehouse.name}
                    </p>
                    <p className="text-xs text-neutral-600">
                      {props.by === 'warehouse'
                        ? balance.item.code
                        : balance.warehouse.code}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                    <span className="font-medium tabular-nums">
                      {formatQuantity(balance.available, {
                        decimalPlaces: balance.item.decimal_places,
                      })}{' '}
                      {balance.item.unit}{' '}
                      <span className="font-normal text-neutral-600">
                        available
                      </span>
                    </span>
                    {balance.below_threshold ? (
                      <Badge variant="outline">Low stock</Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-sm">
              <Link href={all} className={ROW_LINK}>
                {data.pagination.count > data.results.length
                  ? `All ${data.pagination.count} balances`
                  : 'Open in stock balances'}
              </Link>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
