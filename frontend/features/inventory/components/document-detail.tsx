'use client';

import { ArrowLeft, History, Undo2 } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/states';
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
import { ROW_LINK } from '@/features/accounts/components/shared';
import { useCurrentUser } from '@/features/auth/session';
import { isApiError } from '@/lib/api/errors';
import { formatDate, formatDateTime } from '@/lib/format/date';
import { formatQuantity } from '@/lib/format/quantity';
import { can } from '@/lib/permissions/codes';

import { useIssue, useReturn } from '../api';
import {
  CONDITION_LABELS,
  employeeName,
  type EmployeeRef,
  type Issue,
  type ItemRef,
  type StockReturn,
  type UnitRef,
} from '../types';
import { SerialLinks } from './unit-fields';
import { useRouter } from 'next/navigation';

const BACK_LINK =
  'inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={BACK_LINK}>
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </Link>
  );
}

export function Detail({
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

type Shell = {
  query: {
    error: unknown;
    isLoading: boolean;
    isFetching: boolean;
    refetch: () => unknown;
  };
  found: boolean;
  noun: string;
  back: { href: string; label: string };
  children: React.ReactNode;
};

export function DocumentShell({ query, found, noun, back, children }: Shell) {
  if (query.isLoading) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label={`Loading ${noun}`}
      >
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!found) {
    const missing = isApiError(query.error) && query.error.kind === 'not_found';
    const title = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
    return (
      <div className="flex flex-col gap-4">
        <BackLink {...back} />
        <div className="bg-card rounded-lg border">
          {missing ? (
            <EmptyState
              title={`${title} not found`}
              description={`This ${noun} does not exist, or it belongs to a warehouse you cannot see.`}
            />
          ) : (
            <ErrorState
              title={`The ${noun} could not be loaded`}
              error={query.error}
              onRetry={() => query.refetch()}
              retrying={query.isFetching}
            />
          )}
        </div>
      </div>
    );
  }
  return <div className="flex flex-col gap-6">{children}</div>;
}

export function Movements({ reference }: { reference: string }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={() =>
        router.push(
          `/inventory/transactions?search=${encodeURIComponent(reference)}`,
        )
      }
    >
      <History aria-hidden />
      Movements
    </Button>
  );
}

function Person({ employee }: { employee: EmployeeRef }) {
  return (
    <>
      {employeeName(employee)}{' '}
      <span className="text-neutral-600">({employee.matricule})</span>
    </>
  );
}

function ItemCell({ item, units = [] }: { item: ItemRef; units?: UnitRef[] }) {
  return (
    <th scope="row" className="py-2.5 pr-3 text-left font-normal">
      <Link
        href={`/catalogue/items/${item.id}`}
        className={`${ROW_LINK} font-medium wrap-break-word`}
      >
        {item.name}
      </Link>
      <span className="block text-xs text-neutral-600">{item.code}</span>
      <SerialLinks units={units} />
    </th>
  );
}

const quantity = (value: string, item: ItemRef) =>
  formatQuantity(value, { decimalPlaces: item.decimal_places });

export function IssueDetail({ id }: { id: string }) {
  const query = useIssue(id);
  return (
    <DocumentShell
      query={query}
      found={Boolean(query.data)}
      noun="issue"
      back={{ href: '/inventory/issues', label: 'Issues' }}
    >
      {query.data ? <LoadedIssue issue={query.data} /> : null}
    </DocumentShell>
  );
}

function LoadedIssue({ issue }: { issue: Issue }) {
  const me = useCurrentUser();
  const router = useRouter();
  const outstanding = issue.lines.some(
    (line) => line.quantity !== line.returned_quantity,
  );
  const mayReturn =
    can(me, 'INVENTORY_RETURN') &&
    me.warehouse_ids.includes(issue.warehouse.id);

  return (
    <>
      <BackLink href="/inventory/issues" label="Issues" />
      <PageHeader
        title={issue.reference}
        description="A recorded issue. It cannot be changed or deleted: what comes back is recorded as a return."
        actions={
          <>
            <Movements reference={issue.reference} />
            {/* Stock issued to a store never comes back on a return (ISSUE_TO_A_STORE). */}
            {mayReturn && outstanding && issue.employee ? (
              <Button
                onClick={() =>
                  router.push(`/inventory/returns/new?issue=${issue.id}`)
                }
              >
                <Undo2 aria-hidden />
                Record a return
              </Button>
            ) : null}
          </>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Issue</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail term="Warehouse">
              <Link
                href={`/warehouses/${issue.warehouse.id}`}
                className={ROW_LINK}
              >
                {issue.warehouse.name}
              </Link>{' '}
              ({issue.warehouse.code})
            </Detail>
            <Detail term="Issue date">{formatDate(issue.issue_date)}</Detail>
            <Detail term="Issued to">
              {issue.employee ? (
                <Person employee={issue.employee} />
              ) : issue.recipient_store ? (
                <>
                  <Link
                    href={`/warehouses/${issue.recipient_store.id}`}
                    className={ROW_LINK}
                  >
                    {issue.recipient_store.name}
                  </Link>{' '}
                  ({issue.recipient_store.code}), a store
                </>
              ) : null}
            </Detail>
            <Detail term="Recorded by">{issue.created_by}</Detail>
            <Detail term="Recorded">{formatDateTime(issue.created_at)}</Detail>
            {issue.notes ? (
              <Detail term="Notes" className="sm:col-span-2 lg:col-span-3">
                <span className="whitespace-pre-line">{issue.notes}</span>
              </Detail>
            ) : null}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Items issued
            {outstanding ? null : <Badge variant="default">All returned</Badge>}
          </CardTitle>
          <CardDescription>
            Each line left the stock of the warehouse. &ldquo;Returned&rdquo;
            counts what came back on returns recorded against this issue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <caption className="sr-only">Items issued</caption>
            <thead>
              <tr className="border-b text-left text-neutral-600">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Item
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Issued
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">
                  Returned
                </th>
              </tr>
            </thead>
            <tbody>
              {issue.lines.map((line) => (
                <tr key={line.id} className="border-b last:border-b-0">
                  <ItemCell item={line.item} units={line.units} />
                  <td className="py-2.5 text-right font-medium whitespace-nowrap tabular-nums">
                    {quantity(line.quantity, line.item)} {line.item.unit}
                  </td>
                  <td className="py-2.5 pl-3 text-right whitespace-nowrap tabular-nums">
                    {quantity(line.returned_quantity, line.item)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

export function ReturnDetail({ id }: { id: string }) {
  const query = useReturn(id);
  return (
    <DocumentShell
      query={query}
      found={Boolean(query.data)}
      noun="return"
      back={{ href: '/inventory/returns', label: 'Returns' }}
    >
      {query.data ? <LoadedReturn stockReturn={query.data} /> : null}
    </DocumentShell>
  );
}

function LoadedReturn({ stockReturn }: { stockReturn: StockReturn }) {
  const damaged = stockReturn.lines.some(
    (line) => line.condition === 'DAMAGED',
  );

  return (
    <>
      <BackLink href="/inventory/returns" label="Returns" />
      <PageHeader
        title={stockReturn.reference}
        description="A recorded return. It cannot be changed or deleted: a mistake is corrected by an adjustment."
        actions={<Movements reference={stockReturn.reference} />}
      />
      <Card>
        <CardHeader>
          <CardTitle>Return</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail term="Warehouse">
              <Link
                href={`/warehouses/${stockReturn.warehouse.id}`}
                className={ROW_LINK}
              >
                {stockReturn.warehouse.name}
              </Link>{' '}
              ({stockReturn.warehouse.code})
            </Detail>
            <Detail term="Return date">
              {formatDate(stockReturn.return_date)}
            </Detail>
            <Detail term="Returned by">
              <Person employee={stockReturn.employee} />
            </Detail>
            <Detail term="Against issue">
              {stockReturn.issue ? (
                <Link
                  href={`/inventory/issues/${stockReturn.issue.id}`}
                  className={ROW_LINK}
                >
                  {stockReturn.issue.reference}
                </Link>
              ) : (
                'None'
              )}
            </Detail>
            <Detail term="Recorded by">{stockReturn.created_by}</Detail>
            <Detail term="Recorded">
              {formatDateTime(stockReturn.created_at)}
            </Detail>
            {stockReturn.notes ? (
              <Detail term="Notes" className="sm:col-span-2 lg:col-span-3">
                <span className="whitespace-pre-line">{stockReturn.notes}</span>
              </Detail>
            ) : null}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Items returned</CardTitle>
          <CardDescription>
            Each line went back into the stock of the warehouse.
            {damaged
              ? ' Damaged units are counted there but cannot be issued.'
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <caption className="sr-only">Items returned</caption>
            <thead>
              <tr className="border-b text-left text-neutral-600">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Item
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Condition
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Quantity
                </th>
              </tr>
            </thead>
            <tbody>
              {stockReturn.lines.map((line) => (
                <tr key={line.id} className="border-b last:border-b-0">
                  <ItemCell item={line.item} units={line.units} />
                  <td className="py-2.5 pr-3">
                    {line.condition === 'DAMAGED' ? (
                      <Badge variant="outline">Damaged</Badge>
                    ) : (
                      (CONDITION_LABELS[line.condition] ?? line.condition)
                    )}
                  </td>
                  <td className="py-2.5 text-right font-medium whitespace-nowrap tabular-nums">
                    {quantity(line.quantity, line.item)} {line.item.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
