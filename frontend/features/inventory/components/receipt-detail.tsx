'use client';

import { ArrowLeft, History } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/states';
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
import { isApiError } from '@/lib/api/errors';
import { formatDate, formatDateTime } from '@/lib/format/date';
import { formatQuantity, isZeroQuantity } from '@/lib/format/quantity';

import { useReceipt } from '../api';
import type { Receipt } from '../types';
import { SerialLinks } from './unit-fields';

const BACK_LINK =
  'inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

function BackLink() {
  return (
    <Link href="/inventory/receipts" className={BACK_LINK}>
      <ArrowLeft className="size-4" aria-hidden />
      Receipts
    </Link>
  );
}

function Detail({
  term,
  children,
  className,
}: {
  term: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        className
          ? `flex min-w-0 flex-col gap-1 ${className}`
          : 'flex min-w-0 flex-col gap-1'
      }
    >
      <dt className="text-sm text-neutral-600">{term}</dt>
      <dd className="text-sm wrap-break-word">{children}</dd>
    </div>
  );
}

export function ReceiptDetail({ id }: { id: string }) {
  const {
    data: receipt,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useReceipt(id);

  if (isLoading) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="Loading receipt"
      >
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!receipt) {
    const missing = isApiError(error) && error.kind === 'not_found';
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <div className="bg-card rounded-lg border">
          {missing ? (
            <EmptyState
              title="Receipt not found"
              description="This receipt does not exist, or it belongs to a warehouse you cannot see."
            />
          ) : (
            <ErrorState
              title="The receipt could not be loaded"
              error={error}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          )}
        </div>
      </div>
    );
  }
  return <Loaded receipt={receipt} />;
}

function Loaded({ receipt }: { receipt: Receipt }) {
  const registered = receipt.lines.some(
    (line) => !isZeroQuantity(line.registered_quantity),
  );

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        title={receipt.reference}
        description="A recorded receipt. It cannot be changed or deleted: a mistake is corrected by an adjustment."
        actions={
          <Button asChild variant="outline">
            <Link
              href={`/inventory/transactions?search=${encodeURIComponent(receipt.reference)}`}
            >
              <History aria-hidden />
              Movements
            </Link>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Delivery</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail term="Warehouse">
              <Link
                href={`/warehouses/${receipt.warehouse.id}`}
                className={ROW_LINK}
              >
                {receipt.warehouse.name}
              </Link>{' '}
              ({receipt.warehouse.code})
            </Detail>
            <Detail term="Receipt date">
              {formatDate(receipt.receipt_date)}
            </Detail>
            <Detail term="Received from">{receipt.source}</Detail>
            <Detail term="Recorded by">{receipt.created_by}</Detail>
            <Detail term="Recorded">
              {formatDateTime(receipt.created_at)}
            </Detail>
            {receipt.notes ? (
              <Detail term="Notes" className="sm:col-span-2 lg:col-span-3">
                <span className="whitespace-pre-line">{receipt.notes}</span>
              </Detail>
            ) : null}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Items received</CardTitle>
          <CardDescription>
            {receipt.lines.length === 1
              ? 'One line, added'
              : `${receipt.lines.length} lines, each added`}{' '}
            to the stock of the warehouse.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <caption className="sr-only">Items received</caption>
            <thead>
              <tr className="border-b text-left text-neutral-600">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Item
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Quantity
                </th>
                {registered ? (
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    Registered as assets
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((line) => (
                <tr key={line.id} className="border-b last:border-b-0">
                  <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                    <Link
                      href={`/catalogue/items/${line.item.id}`}
                      className={`${ROW_LINK} font-medium wrap-break-word`}
                    >
                      {line.item.name}
                    </Link>
                    <span className="block text-xs text-neutral-600">
                      {line.item.code}
                    </span>
                    <SerialLinks units={line.units} />
                  </th>
                  <td className="py-2.5 text-right font-medium whitespace-nowrap tabular-nums">
                    {formatQuantity(line.quantity, {
                      decimalPlaces: line.item.decimal_places,
                    })}{' '}
                    {line.item.unit}
                  </td>
                  {registered ? (
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap tabular-nums">
                      {formatQuantity(line.registered_quantity, {
                        decimalPlaces: line.item.decimal_places,
                      })}{' '}
                      of{' '}
                      {formatQuantity(line.quantity, {
                        decimalPlaces: line.item.decimal_places,
                      })}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
