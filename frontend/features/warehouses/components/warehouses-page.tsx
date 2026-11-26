'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Can } from '@/components/shared/can';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROW_LINK } from '@/features/accounts/components/shared';
import {
  useOfficeChoices,
  useRegionChoices,
} from '@/features/organization/components/shared';
import { ACTIVE_OPTIONS } from '@/features/organization/types';
import { useListParams } from '@/lib/url/list-params';

import { useWarehouseList } from '../api';
import {
  KEEPER_OPTIONS,
  TYPE_LABELS,
  TYPE_OPTIONS,
  type Warehouse,
} from '../types';
import { WarehouseDialog } from './warehouse-dialog';

const FILTERS = [
  'region',
  'office',
  'type',
  'has_store_keeper',
  'is_active',
] as const;

export function KeeperCell({ warehouse }: { warehouse: Warehouse }) {
  if (warehouse.type === 'IT') {
    return <span className="text-neutral-600">Regional IT staff</span>;
  }
  if (!warehouse.store_keeper) {
    return <Badge variant="secondary">No Store Keeper</Badge>;
  }
  return <>{warehouse.store_keeper.name}</>;
}

const COLUMNS: Column<Warehouse>[] = [
  {
    id: 'code',
    header: 'Code',
    sortField: 'code',
    cell: (warehouse) => warehouse.code,
  },
  {
    id: 'name',
    header: 'Name',
    sortField: 'name',
    primary: true,
    cell: (warehouse) => (
      <Link href={`/warehouses/${warehouse.id}`} className={ROW_LINK}>
        {warehouse.name}
      </Link>
    ),
  },
  {
    id: 'type',
    header: 'Type',
    cell: (warehouse) =>
      `${TYPE_LABELS[warehouse.type] ?? warehouse.type}${warehouse.is_regional_store ? ' · regional store' : ''}`,
  },
  {
    id: 'office',
    header: 'Office',
    cell: (warehouse) => warehouse.office.name,
  },
  {
    id: 'region',
    header: 'Region',
    cell: (warehouse) => warehouse.region.name,
  },
  {
    id: 'keeper',
    header: 'Store Keeper',
    cell: (warehouse) => <KeeperCell warehouse={warehouse} />,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (warehouse) => <ActiveBadge active={warehouse.is_active} />,
  },
];

export function WarehousesPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useWarehouseList(
    list.query,
  );
  const filters = list.state.filters;
  const regions = useRegionChoices();
  const offices = useOfficeChoices({ region: filters.region || undefined });
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Warehouses"
        description="Each warehouse keeps its own stock; nothing moves between warehouses. You see the ones in your scope and the ones you keep."
        actions={
          <Can anyOf={['WAREHOUSE_MANAGE']}>
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New warehouse
            </Button>
          </Can>
        }
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search warehouses"
            placeholder="Search by code or name"
            value={list.state.search}
            onChange={(search) => list.update({ search })}
          />
        }
      >
        <FilterSlot>
          <SelectField
            aria-label="Region"
            noneLabel="All regions"
            value={filters.region}
            onChange={(region) =>
              list.update({ filters: { region, office: '' } })
            }
            options={regions.options}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Office"
            noneLabel="All offices"
            value={filters.office}
            onChange={(office) => list.update({ filters: { office } })}
            options={offices.options}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Type"
            noneLabel="Any type"
            value={filters.type}
            onChange={(type) => list.update({ filters: { type } })}
            options={TYPE_OPTIONS}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Store Keeper"
            noneLabel="With or without a Store Keeper"
            value={filters.has_store_keeper}
            onChange={(has_store_keeper) =>
              list.update({ filters: { has_store_keeper } })
            }
            options={KEEPER_OPTIONS}
          />
        </FilterSlot>
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
        caption="Warehouses"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(warehouse) => warehouse.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No warehouses match"
              description="Try a different search or filter."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No warehouses to show"
              description="There are none in your scope, and you keep none."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="warehouses"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {creating ? (
        <WarehouseDialog warehouse={null} onClose={() => setCreating(false)} />
      ) : null}
    </div>
  );
}
