'use client';

import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Pagination as PaginationData } from '@/lib/api/envelope';
import { PAGE_SIZES } from '@/lib/url/list-params';

import { SelectField } from './select-field';

const SEARCH_DELAY_MS = 300;

type SearchInputProps = {
  /** The search term currently applied (from the address bar). */
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
};

/** A search box that applies what was typed after a short pause, not on every keystroke. */
export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
}: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const [applied, setApplied] = useState(value);

  // The applied term changed from outside (back button, "Clear filters"): follow it.
  if (value !== applied) {
    setApplied(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === applied) {
      return;
    }
    const timer = setTimeout(() => onChange(draft.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, applied, onChange]);

  return (
    <div className="relative min-w-0 sm:max-w-xs sm:min-w-64 sm:flex-1">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500"
        aria-hidden
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder ?? 'Search'}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="pl-9"
      />
    </div>
  );
}

type FilterBarProps = {
  search: React.ReactNode;
  /** The filter dropdowns. They wrap onto more rows as the screen narrows. */
  children?: React.ReactNode;
  hasFilters: boolean;
  onClear: () => void;
};

/** Search and filters above a list. On a phone the controls stack to full width. */
export function FilterBar({
  search,
  children,
  hasFilters,
  onClear,
}: FilterBarProps) {
  return (
    <div
      role="search"
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
    >
      {search}
      {children}
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="self-start sm:self-auto"
        >
          <X aria-hidden />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

/** One dropdown in a filter bar: full width on a phone, a fixed width beside the others above that. */
export function FilterSlot({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 sm:w-48">{children}</div>;
}

type PaginationProps = {
  pagination: PaginationData | undefined;
  /** What is being counted, e.g. "regions". */
  noun: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

/** Where the user is in a paginated list, with previous and next. */
export function Pagination({
  pagination,
  noun,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const sizeId = useId();
  if (!pagination || pagination.count === 0) {
    return null;
  }
  const {
    count,
    page,
    page_size: pageSize,
    total_pages: totalPages,
  } = pagination;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, count);

  return (
    <nav
      aria-label={`${noun} pages`}
      className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p aria-live="polite" className="text-neutral-600">
        Showing {first}–{last} of {count} {noun}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor={sizeId} className="text-neutral-600">
            Per page
          </label>
          <SelectField
            id={sizeId}
            className="w-20"
            value={String(pageSize)}
            onChange={(value) => onPageSizeChange(Number(value))}
            options={PAGE_SIZES.map((size) => ({
              value: String(size),
              label: String(size),
            }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft aria-hidden />
            Previous
          </Button>
          <span className="whitespace-nowrap text-neutral-600">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
    </nav>
  );
}

type DateFilterProps = {
  label: string;
  /** `YYYY-MM-DD`, or empty. */
  value: string;
  onChange: (value: string) => void;
  /** The latest date that can be chosen, `YYYY-MM-DD`. */
  max?: string;
  min?: string;
};

/** A date in a filter bar. The browser's own date picker is used, which works well on touch screens. */
export function DateFilter({
  label,
  value,
  onChange,
  max,
  min,
}: DateFilterProps) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:w-44">
      <label htmlFor={id} className="text-xs text-neutral-600">
        {label}
      </label>
      <Input
        id={id}
        type="date"
        value={value}
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
