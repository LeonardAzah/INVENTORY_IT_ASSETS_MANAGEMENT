'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, LoaderCircle, Search } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import { errorMessage } from './states';

export type PickerOption = {
  value: string;
  label: string;
  description?: string;
};

export type PickerResult = {
  options: PickerOption[];
  total: number;
};

type EntityPickerProps = {
  value: PickerOption | null;
  onChange: (option: PickerOption | null) => void;
  queryKey: readonly unknown[];
  search: (term: string, signal: AbortSignal) => Promise<PickerResult>;
  placeholder: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  required?: boolean;
};

const SEARCH_DELAY_MS = 300;

export function EntityPicker({
  value,
  onChange,
  queryKey,
  search,
  placeholder,
  searchPlaceholder = 'Type to search',
  disabled,
  required,
  ...trigger
}: EntityPickerProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setTerm(draft.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  const { data, error, isFetching } = useQuery({
    queryKey: [...queryKey, term],
    queryFn: ({ signal }) => search(term, signal),
    enabled: open,
  });
  const options = data?.options ?? [];
  const highlighted = Math.min(active, Math.max(options.length - 1, 0));

  const choose = (option: PickerOption) => {
    onChange(option);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(Math.min(highlighted + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(Math.max(highlighted - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[highlighted];
      if (option) {
        choose(option);
      }
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft('');
          setTerm('');
          setActive(0);
        }
      }}
    >
      <PopoverTrigger>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-required={required || undefined}
          disabled={disabled}
          className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 aria-invalid:border-destructive flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-left text-sm shadow-xs outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-11"
          {...trigger}
        >
          <span
            className={cn(
              'min-w-0 truncate',
              !value && 'text-muted-foreground',
            )}
          >
            {value ? value.label : placeholder}
          </span>
          <ChevronsUpDown
            className="size-4 shrink-0 text-neutral-500"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) max-w-[calc(100vw-2rem)] min-w-64 p-0"
      >
        <div className="flex items-center gap-2 border-b px-3">
          {isFetching ? (
            <LoaderCircle
              className="size-4 shrink-0 animate-spin text-neutral-500 motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <Search className="size-4 shrink-0 text-neutral-500" aria-hidden />
          )}
          <input
            autoFocus
            type="text"
            role="searchbox"
            aria-label={searchPlaceholder}
            aria-controls={listId}
            aria-activedescendant={
              options[highlighted] ? `${listId}-${highlighted}` : undefined
            }
            placeholder={searchPlaceholder}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="placeholder:text-muted-foreground h-10 w-full min-w-0 bg-transparent text-base outline-none md:text-sm pointer-coarse:h-11"
          />
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label={placeholder}
          className="max-h-64 overflow-y-auto p-1"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value?.value}
              // Chosen on mousedown, before the search box loses focus and the list closes.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setActive(index)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm pointer-coarse:min-h-11',
                index === highlighted && 'bg-accent',
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{option.label}</span>
                {option.description ? (
                  <span className="truncate text-xs text-neutral-600">
                    {option.description}
                  </span>
                ) : null}
              </span>
              {option.value === value?.value ? (
                <Check className="size-4 shrink-0" aria-hidden />
              ) : null}
            </li>
          ))}
        </ul>
        <p
          aria-live="polite"
          className="border-t px-3 py-2 text-xs text-neutral-600 empty:hidden"
        >
          {error
            ? errorMessage(error)
            : !data
              ? 'Searching…'
              : options.length === 0
                ? 'No matches.'
                : data.total > options.length
                  ? `Showing ${options.length} of ${data.total}. Type to narrow the list.`
                  : null}
        </p>
      </PopoverContent>
    </Popover>
  );
}
