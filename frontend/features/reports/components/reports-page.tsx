'use client';

import {
  CircleAlert,
  Download,
  FileBarChart,
  LoaderCircle,
} from 'lucide-react';
import Link from 'next/link';

import { DataTable, type Column } from '@/components/shared/data-table';
import {
  DateFilter,
  FilterBar,
  FilterSlot,
  Pagination,
} from '@/components/shared/list-controls';
import { PageHeader } from '@/components/shared/page-header';
import { SelectField, type Option } from '@/components/shared/select-field';
import {
  EmptyState,
  ErrorState,
  errorMessage,
} from '@/components/shared/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EVENT_LABELS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
} from '@/features/assets/types';
import { useCatalogueOptions } from '@/features/catalogue/api';
import { ASSET_CLASS_OPTIONS } from '@/features/catalogue/types';
import { useWarehouseOptions } from '@/features/inventory/api';
import { BackLink } from '@/features/inventory/components/document-detail';
import {
  ADJUSTMENT_KIND_OPTIONS,
  TRANSACTION_TYPE_OPTIONS,
} from '@/features/inventory/types';
import { useOrganizationOptions } from '@/features/organization/api';
import { isApiError } from '@/lib/api/errors';
import { today } from '@/lib/format/date';
import { useListParams } from '@/lib/url/list-params';

import {
  useDownloadReport,
  useReport,
  useReportList,
  type ReportInfo,
} from '../api';

const BACK = { href: '/reports', label: 'Reports' };

export function ReportsIndex() {
  const { data, error, isLoading, isFetching, refetch } = useReportList();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reports"
        description="Each report shows only what you are allowed to see, on screen or as a PDF with the same rows."
      />
      {isLoading ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-label="Loading reports"
        >
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : !data ? (
        <div className="bg-card rounded-lg border">
          <ErrorState
            title="The reports could not be loaded"
            error={error}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        </div>
      ) : data.length === 0 ? (
        <div className="bg-card rounded-lg border">
          <EmptyState
            title="No report is available to you"
            description="Reports follow your permissions. Ask an administrator if you need one."
          />
        </div>
      ) : (
        <ul
          aria-label="Reports"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {data.map((report) => (
            <li key={report.name}>
              <Link
                href={`/reports/${report.name}`}
                className="bg-card hover:bg-accent focus-visible:ring-ring flex h-full flex-col gap-2 rounded-lg border p-4 shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <span className="flex items-center gap-2 font-medium">
                  <FileBarChart
                    className="size-4 shrink-0 text-neutral-600"
                    aria-hidden
                  />
                  {report.title}
                </span>
                <span className="text-sm text-neutral-600">
                  {report.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const BOOLEAN = (yes: string, no: string): Option[] => [
  { value: 'true', label: yes },
  { value: 'false', label: no },
];

const CHOICES: Record<
  string,
  { label: string; all: string; options: Option[] }
> = {
  type: {
    label: 'Movement type',
    all: 'Any type',
    options: TRANSACTION_TYPE_OPTIONS,
  },
  kind: { label: 'Kind', all: 'Any kind', options: ADJUSTMENT_KIND_OPTIONS },
  status: { label: 'Status', all: 'Any status', options: STATUS_OPTIONS },
  asset_class: {
    label: 'Class',
    all: 'Any class',
    options: ASSET_CLASS_OPTIONS,
  },
  source: { label: 'Came in by', all: 'Any source', options: SOURCE_OPTIONS },
  event_type: {
    label: 'Event',
    all: 'Any event',
    options: Object.entries(EVENT_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
  },
  below_threshold: {
    label: 'Stock level',
    all: 'Any stock level',
    options: BOOLEAN('Low on stock', 'Not low on stock'),
  },
  from_stock_take: {
    label: 'Origin',
    all: 'Any origin',
    options: BOOLEAN('From a stock-take', 'Not from a stock-take'),
  },
  active: {
    label: 'Assignment',
    all: 'Current and past',
    options: BOOLEAN('Current assignments', 'Past assignments'),
  },
};

const LOOKUPS = [
  'warehouse',
  'region',
  'category',
  'office',
  'department',
] as const;
const DATES = ['date_from', 'date_to'] as const;

const FILTERS = [
  ...Object.keys(CHOICES),
  ...LOOKUPS,
  ...DATES,
  'item',
  'employee',
  'location',
  'asset',
  'actor',
  'action',
  'object_type',
] as const;
const CONTROLLED = new Set<string>([
  ...Object.keys(CHOICES),
  ...LOOKUPS,
  ...DATES,
]);

const shown = (value: unknown) =>
  value === null || value === undefined || value === '' ? '–' : String(value);

export function ReportPage({ name }: { name: string }) {
  const reports = useReportList();
  const info = reports.data?.find((report) => report.name === name);

  if (reports.isLoading) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="Loading the report"
      >
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!info) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink {...BACK} />
        <div className="bg-card rounded-lg border">
          {reports.data ? (
            <EmptyState
              title="Report not found"
              description="This report does not exist, or you are not allowed to run it."
            />
          ) : (
            <ErrorState
              title="The report could not be loaded"
              error={reports.error}
              onRetry={() => reports.refetch()}
              retrying={reports.isFetching}
            />
          )}
        </div>
      </div>
    );
  }
  return <Loaded info={info} />;
}

function Loaded({ info }: { info: ReportInfo }) {
  const list = useListParams(FILTERS);
  const takes = (filter: string) => info.filters.includes(filter);

  const used = Object.fromEntries(
    Object.entries(list.state.filters).filter(
      ([key, value]) => value && takes(key),
    ),
  );
  const { data, error, isLoading, isFetching, refetch } = useReport(
    info.name,
    { ...used, page: list.state.page, page_size: list.state.pageSize },
    true,
  );
  const download = useDownloadReport(info.name);
  const filters = list.state.filters;
  const latest = today();

  const warehouses = useWarehouseOptions();
  const regions = useOrganizationOptions('regions', {}, takes('region'));
  const offices = useOrganizationOptions('offices', {}, takes('office'));
  const departments = useOrganizationOptions(
    'departments',
    {},
    takes('department'),
  );
  const categories = useCatalogueOptions('categories', {}, takes('category'));
  const lookups: Record<
    (typeof LOOKUPS)[number],
    { label: string; all: string; options: Option[] }
  > = {
    warehouse: {
      label: 'Warehouse',
      all: 'All warehouses',
      options: warehouses.data?.options ?? [],
    },
    region: {
      label: 'Region',
      all: 'All regions',
      options: (regions.data?.records ?? []).map((region) => ({
        value: region.id,
        label: region.name,
      })),
    },
    category: {
      label: 'Category',
      all: 'All categories',
      options: (categories.data?.records ?? []).map((category) => ({
        value: category.id,
        label: category.name,
      })),
    },
    office: {
      label: 'Office',
      all: 'All offices',
      options: (offices.data?.records ?? []).map((office) => ({
        value: office.id,
        label: office.name,
      })),
    },
    department: {
      label: 'Department',
      all: 'All departments',
      options: (departments.data?.records ?? []).map((department) => ({
        value: department.id,
        label: `${department.name} (${department.code})`,
      })),
    },
  };
  const selects = [
    ...LOOKUPS.filter(takes).map((key) => ({ key, ...lookups[key] })),
    ...Object.entries(CHOICES)
      .filter(([key]) => takes(key))
      .map(([key, choice]) => ({ key, ...choice })),
  ];
  const linked = Object.keys(used).filter((key) => !CONTROLLED.has(key));

  const columns: Column<Record<string, unknown>>[] = info.columns.map(
    (column, index) => ({
      id: column.key,
      header: column.label,
      primary: index === 0,
      className: 'whitespace-nowrap',
      cell: (row) => shown(row[column.key]),
    }),
  );
  const refusal = download.error;
  const tooMany = isApiError(refusal) && refusal.errorCode === 'TOO_MANY_ROWS';

  return (
    <div className="flex flex-col gap-4">
      <BackLink {...BACK} />
      <PageHeader
        title={info.title}
        description={info.description}
        actions={
          info.formats.includes('pdf') ? (
            <Button
              variant="outline"
              disabled={download.isPending}
              onClick={() => download.mutate(used)}
            >
              {download.isPending ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : (
                <Download aria-hidden />
              )}
              {download.isPending ? 'Preparing the PDF…' : 'Download as PDF'}
            </Button>
          ) : null
        }
      />
      {refusal ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>The PDF was not made</AlertTitle>
          <AlertDescription>
            {errorMessage(refusal)}
            {tooMany ? ' The rows are still shown here, page by page.' : ''}
          </AlertDescription>
        </Alert>
      ) : null}
      <FilterBar
        search={null}
        hasFilters={Object.keys(used).length > 0}
        onClear={list.clear}
      >
        {selects.map((select) => (
          <FilterSlot key={select.key}>
            <SelectField
              aria-label={select.label}
              noneLabel={select.all}
              value={filters[select.key as keyof typeof filters]}
              onChange={(value) =>
                list.update({ filters: { [select.key]: value } })
              }
              options={select.options}
            />
          </FilterSlot>
        ))}
        {takes('date_from') ? (
          <DateFilter
            label="From"
            value={filters.date_from}
            max={filters.date_to || latest}
            onChange={(date_from) => list.update({ filters: { date_from } })}
          />
        ) : null}
        {takes('date_to') ? (
          <DateFilter
            label="To"
            value={filters.date_to}
            min={filters.date_from || undefined}
            max={latest}
            onChange={(date_to) => list.update({ filters: { date_to } })}
          />
        ) : null}
        {linked.length > 0 ? (
          <Badge variant="outline" className="self-start sm:self-end">
            Narrowed by a link
          </Badge>
        ) : null}
      </FilterBar>
      <DataTable
        caption={info.title}
        columns={columns}
        rows={data?.results}
        rowId={(row) => JSON.stringify(row)}
        ordering=""
        onOrderingChange={() => undefined}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          Object.keys(used).length > 0 ? (
            <EmptyState
              title="No rows match"
              description="Try different filters."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="This report is empty"
              description="There is nothing to report in what you can see."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="rows"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
    </div>
  );
}
