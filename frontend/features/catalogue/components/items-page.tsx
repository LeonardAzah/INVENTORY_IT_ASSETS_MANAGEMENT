'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { DataTable, type Column } from '@/components/shared/data-table';
import {
  FilterBar,
  FilterSlot,
  Pagination,
  SearchInput,
} from '@/components/shared/list-controls';
import { PageHeader } from '@/components/shared/page-header';
import { SelectField } from '@/components/shared/select-field';
import { ActiveBadge, EmptyState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { ROW_LINK } from '@/features/accounts/components/shared';
import { useCurrentUser } from '@/features/auth/session';
import { ACTIVE_OPTIONS } from '@/features/organization/types';
import { TYPE_OPTIONS } from '@/features/warehouses/types';
import { manageableTypes } from '@/lib/permissions/catalogue';
import { useListParams } from '@/lib/url/list-params';

import { useCatalogueList, useCatalogueOptions } from '../api';
import {
  ASSET_CLASS_LABELS,
  ASSET_CLASS_OPTIONS,
  typeLabel,
  type Item,
} from '../types';
import { ItemDialog } from './item-dialog';

const FILTERS = [
  'warehouse_type',
  'category',
  'asset_class',
  'is_active',
] as const;

const COLUMNS: Column<Item>[] = [
  {
    id: 'code',
    header: 'Code',
    sortField: 'code',
    cell: (item) => item.code,
    className: 'whitespace-nowrap',
  },
  {
    id: 'name',
    header: 'Name',
    sortField: 'name',
    primary: true,
    cell: (item) => (
      <Link href={`/catalogue/items/${item.id}`} className={ROW_LINK}>
        {item.name}
      </Link>
    ),
  },
  {
    id: 'type',
    header: 'Type',
    cell: (item) => typeLabel(item.warehouse_type),
  },
  { id: 'category', header: 'Category', cell: (item) => item.category.name },
  { id: 'unit', header: 'Unit', cell: (item) => item.unit.code },
  {
    id: 'class',
    header: 'Asset class',
    cell: (item) =>
      item.asset_class
        ? (ASSET_CLASS_LABELS[item.asset_class] ?? item.asset_class)
        : '–',
  },
  {
    id: 'status',
    header: 'Status',
    cell: (item) => <ActiveBadge active={item.is_active} />,
  },
];

export function ItemsPage() {
  const me = useCurrentUser();
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useCatalogueList(
    'items',
    list.query,
  );
  const filters = list.state.filters;
  const categories = useCatalogueOptions('categories', {
    warehouse_type: filters.warehouse_type || undefined,
  });
  const [creating, setCreating] = useState(false);
  const types = manageableTypes(me, 'ITEM_MANAGE');

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Items"
        description="The catalogue of things kept in stock. General items are counted by quantity; IT items are serialized, and each unit becomes its own asset."
        actions={
          types.length > 0 ? (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New item
            </Button>
          ) : null
        }
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search items"
            placeholder="Search by code, name, brand or model"
            value={list.state.search}
            onChange={(search) => list.update({ search })}
          />
        }
      >
        <FilterSlot>
          <SelectField
            aria-label="Type"
            noneLabel="General and IT"
            value={filters.warehouse_type}
            // Categories and asset classes belong to a type: a new type clears them.
            onChange={(warehouse_type) =>
              list.update({
                filters: { warehouse_type, category: '', asset_class: '' },
              })
            }
            options={TYPE_OPTIONS}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Category"
            noneLabel="All categories"
            value={filters.category}
            onChange={(category) => list.update({ filters: { category } })}
            options={(categories.data?.records ?? []).map((category) => ({
              value: category.id,
              label: filters.warehouse_type
                ? category.name
                : `${category.name} · ${typeLabel(category.warehouse_type)}`,
            }))}
          />
        </FilterSlot>
        {filters.warehouse_type === 'GENERAL' ? null : (
          <FilterSlot>
            <SelectField
              aria-label="Asset class"
              noneLabel="Any asset class"
              value={filters.asset_class}
              onChange={(asset_class) =>
                list.update({ filters: { asset_class } })
              }
              options={ASSET_CLASS_OPTIONS}
            />
          </FilterSlot>
        )}
        <FilterSlot>
          <SelectField
            aria-label="Status"
            noneLabel="Any status"
            value={filters.is_active}
            onChange={(is_active) => list.update({ filters: { is_active } })}
            options={ACTIVE_OPTIONS}
          />
        </FilterSlot>
      </FilterBar>
      <DataTable
        caption="Items"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(item) => item.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No items match"
              description="Try a different search or filter."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No items yet"
              description="Add units and categories first, then the items."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="items"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {creating ? (
        <ItemDialog
          item={null}
          types={types}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}
