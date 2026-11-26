'use client';

import { ArrowLeft, Pencil, ScanBarcode } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/shared/page-header';
import {
  ActiveBadge,
  EmptyState,
  ErrorState,
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
import { useCurrentUser } from '@/features/auth/session';
import { StockSummary } from '@/features/inventory/components/stock-summary';
import { isApiError } from '@/lib/api/errors';
import { EMPTY, formatDateTime } from '@/lib/format/date';
import { manageableTypes } from '@/lib/permissions/catalogue';
import { can } from '@/lib/permissions/codes';

import { useItem, useTemplate } from '../api';
import { formatSpecValue, missingRequired } from '../specifications';
import {
  ASSET_CLASS_LABELS,
  precisionLabel,
  TRACKING_LABELS,
  typeLabel,
  type Item,
} from '../types';
import { ItemDialog } from './item-dialog';
import { useRouter } from 'next/navigation';

const BACK_LINK =
  'inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

function BackLink() {
  return (
    <Link href="/catalogue/items" className={BACK_LINK}>
      <ArrowLeft className="size-4" aria-hidden />
      Items
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

export function ItemDetail({ id }: { id: string }) {
  const { data: item, error, isLoading, isFetching, refetch } = useItem(id);

  if (isLoading) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="Loading item"
      >
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!item) {
    const missing = isApiError(error) && error.kind === 'not_found';
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <div className="bg-card rounded-lg border">
          {missing ? (
            <EmptyState
              title="Item not found"
              description="This item does not exist."
            />
          ) : (
            <ErrorState
              title="The item could not be loaded"
              error={error}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          )}
        </div>
      </div>
    );
  }
  return <Loaded item={item} />;
}

function Loaded({ item }: { item: Item }) {
  const me = useCurrentUser();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const types = manageableTypes(me, 'ITEM_MANAGE');
  const isIT = item.warehouse_type === 'IT';
  const serialized = item.tracking === 'SERIALIZED';
  const seesStock = can(me, 'INVENTORY_VIEW');

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        title={item.name}
        description={`Item ${item.code}`}
        actions={
          <>
            {serialized && !isIT && seesStock ? (
              <Button
                variant="outline"
                onClick={() => router.push(`/inventory/units?item=${item.id}`)}
              >
                <ScanBarcode aria-hidden />
                Serial numbers
              </Button>
            ) : null}
            {types.includes(item.warehouse_type) ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                Edit
              </Button>
            ) : null}
          </>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Catalogue entry
            <ActiveBadge active={item.is_active} />
          </CardTitle>
          <CardDescription>
            {isIT
              ? 'A serialized item. Units arrive in an IT warehouse as a quantity, then each one is registered as an individual asset with its own tag and serial number.'
              : serialized
                ? 'A serialized general item. Each unit is received with its serial number and followed through issues and returns. It is stock, never an IT asset.'
                : 'An item counted by quantity. Each general warehouse keeps its own balance of it.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail term="Code">{item.code}</Detail>
            <Detail term="Type">{typeLabel(item.warehouse_type)}</Detail>
            <Detail term="Tracked">
              {TRACKING_LABELS[item.tracking] ?? item.tracking}
            </Detail>
            <Detail term="Category">{item.category.name}</Detail>
            <Detail term="Unit">
              {item.unit.name} ({item.unit.code}) ·{' '}
              {precisionLabel(item.unit.decimal_places).toLowerCase()}
            </Detail>
            {isIT ? (
              <Detail term="Asset class">
                {item.asset_class
                  ? (ASSET_CLASS_LABELS[item.asset_class] ?? item.asset_class)
                  : EMPTY}
              </Detail>
            ) : null}
            <Detail term="Brand">{item.brand || EMPTY}</Detail>
            <Detail term="Model">{item.model || EMPTY}</Detail>
            <Detail term="Last changed">
              {formatDateTime(item.updated_at)}
            </Detail>
            <Detail term="Description" className="sm:col-span-2 lg:col-span-3">
              {item.description || EMPTY}
            </Detail>
          </dl>
        </CardContent>
      </Card>
      {item.category.specification_template_id ? (
        <SpecificationsCard
          item={item}
          templateId={item.category.specification_template_id}
        />
      ) : null}
      <StockSummary by="item" id={item.id} />
      {editing ? (
        <ItemDialog
          item={item}
          types={types}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}

/** The item's technical specifications, in the order of its category's template. */
function SpecificationsCard({
  item,
  templateId,
}: {
  item: Item;
  templateId: string;
}) {
  const {
    data: template,
    error,
    isFetching,
    refetch,
  } = useTemplate(templateId);
  const missing = template
    ? missingRequired(template, item.specifications)
    : [];
  // Fields no longer offered still show the value the item holds for them.
  const shown = (template?.fields ?? []).filter(
    (field) => field.is_active || field.key in item.specifications,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Specifications
          {missing.length > 0 ? (
            <Badge variant="outline">Incomplete</Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          {template
            ? `As described by the template ${template.name}.`
            : "As described by the category's template."}
          {missing.length > 0
            ? ` Still to fill in: ${missing.join(', ')}.`
            : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {template ? (
          shown.length > 0 ? (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((field) => {
                const value = item.specifications[field.key];
                const text =
                  value === undefined ? EMPTY : formatSpecValue(field, value);
                return (
                  <Detail
                    key={field.id}
                    term={
                      field.is_active
                        ? field.label
                        : `${field.label} (no longer used)`
                    }
                  >
                    {text}
                  </Detail>
                );
              })}
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">
              The template has no specifications yet.
            </p>
          )
        ) : error ? (
          <ErrorState
            title="The specifications could not be loaded"
            error={error}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </CardContent>
    </Card>
  );
}
