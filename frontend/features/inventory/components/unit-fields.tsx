'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';

import { Field } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { ROW_LINK } from '@/features/accounts/components/shared';
import type { QueryValue } from '@/lib/api/client';

import { useUnitList } from '../api';
import { parseSerials, unitCount } from '../serials';
import type { UnitRef } from '../types';

const TEXTAREA =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 font-mono text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive md:text-sm';

const CHOOSER_PAGE_SIZE = 50;

type SerialsInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  description?: string;
};

export function SerialsInput({
  label,
  value,
  onChange,
  error,
  description,
}: SerialsInputProps) {
  const count = parseSerials(value).length;
  return (
    <Field
      label={label}
      required
      description={[
        description,
        count > 0 ? `${unitCount(count)} entered.` : null,
      ]
        .filter(Boolean)
        .join(' ')}
      error={error}
      className="sm:col-span-full"
    >
      {(control) => (
        <textarea
          rows={Math.min(Math.max(3, count + 1), 10)}
          className={TEXTAREA}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder={'One serial number per line'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...control}
        />
      )}
    </Field>
  );
}

type UnitChooserProps = {
  label: string;
  filters: Record<string, QueryValue>;
  value: UnitRef[];
  onChange: (units: UnitRef[]) => void;
  error?: string;
  description?: string;
};

export function UnitChooser({
  label,
  filters,
  value,
  onChange,
  error,
  description,
}: UnitChooserProps) {
  const id = useId();
  const [term, setTerm] = useState('');
  const units = useUnitList({
    ...filters,
    search: term.trim() || undefined,
    page_size: CHOOSER_PAGE_SIZE,
  });
  const chosen = new Set(value.map((unit) => unit.id));
  const toggle = (unit: UnitRef, on: boolean) =>
    onChange(
      on ? [...value, unit] : value.filter((other) => other.id !== unit.id),
    );
  const results = units.data?.results ?? [];
  const total = units.data?.pagination.count ?? 0;
  const describedBy = [`${id}-description`, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <fieldset
      className="flex min-w-0 flex-col gap-2 sm:col-span-full"
      aria-describedby={describedBy}
      aria-invalid={Boolean(error)}
    >
      <legend className="mb-1.5 text-sm leading-none font-medium">
        {label}
        <span aria-hidden className="text-destructive">
          *
        </span>
      </legend>
      {value.length > 0 ? (
        <ul aria-label="Chosen units" className="flex flex-wrap gap-2">
          {value.map((unit) => (
            <li key={unit.id}>
              <span className="bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-sm">
                {unit.serial_number}
                <button
                  type="button"
                  aria-label={`Remove ${unit.serial_number}`}
                  className="hover:text-foreground focus-visible:ring-ring inline-flex items-center justify-center rounded-sm text-neutral-600 focus-visible:ring-2 focus-visible:outline-none pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  onClick={() => toggle(unit, false)}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        type="search"
        aria-label={`Search the units of ${label.toLowerCase()}`}
        placeholder="Search by serial number"
        autoComplete="off"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
      <div
        className="max-h-56 overflow-y-auto rounded-md border p-2"
        role="group"
        aria-label="Units to choose from"
      >
        {units.isLoading ? (
          <p className="text-muted-foreground text-sm" role="status">
            Loading the units…
          </p>
        ) : units.error ? (
          <p className="text-destructive text-sm" role="alert">
            The units could not be loaded.
          </p>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {term.trim() ? 'No unit matches.' : 'No unit can be chosen here.'}
          </p>
        ) : (
          <ul className="flex flex-col">
            {results.map((unit) => (
              <li key={unit.id}>
                <label className="flex items-center gap-2 py-1 font-mono text-sm pointer-coarse:min-h-11">
                  <input
                    type="checkbox"
                    className="accent-primary size-4"
                    checked={chosen.has(unit.id)}
                    onChange={(event) =>
                      toggle(
                        { id: unit.id, serial_number: unit.serial_number },
                        event.target.checked,
                      )
                    }
                  />
                  {unit.serial_number}
                </label>
              </li>
            ))}
          </ul>
        )}
        {total > results.length ? (
          <p className="text-muted-foreground pt-1 text-sm">
            Showing {results.length} of {total}. Search to find the others.
          </p>
        ) : null}
      </div>
      <p id={`${id}-description`} className="text-muted-foreground text-sm">
        {[description, `${unitCount(value.length)} chosen.`]
          .filter(Boolean)
          .join(' ')}
      </p>
      {error ? (
        <p
          id={`${id}-error`}
          className="text-destructive text-sm wrap-break-word"
        >
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function SerialLinks({ units }: { units: UnitRef[] }) {
  if (units.length === 0) {
    return null;
  }
  return (
    <span className="block text-xs text-neutral-600">
      Serial numbers:{' '}
      {units.map((unit, index) => (
        <span key={unit.id}>
          {index > 0 ? ', ' : null}
          <Link
            href={`/inventory/units/${unit.id}`}
            className={`${ROW_LINK} font-mono underline`}
          >
            {unit.serial_number}
          </Link>
        </span>
      ))}
    </span>
  );
}
