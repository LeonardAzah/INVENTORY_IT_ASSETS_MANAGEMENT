'use client';

import { Pencil, Plus } from 'lucide-react';

import { Can } from '@/components/shared/can';
import type { Option } from '@/components/shared/select-field';
import { Button } from '@/components/ui/button';
import type { PermissionCode } from '@/lib/permissions/codes';

import { useOrganizationOptions } from '../api';
import {
  OFFICE_KIND_LABELS,
  refLabel,
  type Department,
  type Location,
  type Office,
  type OfficeKind,
  type Region,
} from '../types';

export const STRUCTURE: readonly PermissionCode[] = ['ORG_STRUCTURE_MANAGE'];
export const LOCATIONS: readonly PermissionCode[] = ['LOCATION_MANAGE'];

export function NewButton({
  label,
  anyOf,
  onClick,
}: {
  label: string;
  anyOf: readonly PermissionCode[];
  onClick: () => void;
}) {
  return (
    <Can anyOf={anyOf}>
      <Button onClick={onClick}>
        <Plus aria-hidden />
        {label}
      </Button>
    </Can>
  );
}

export function EditButton({
  name,
  anyOf,
  onClick,
}: {
  name: string;
  anyOf: readonly PermissionCode[];
  onClick: () => void;
}) {
  return (
    <Can anyOf={anyOf}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        aria-label={`Edit ${name}`}
      >
        <Pencil aria-hidden />
        Edit
      </Button>
    </Can>
  );
}

const TRUNCATED_NOTE = 'Only the first 100 are listed.';

type Choices<T> = {
  options: Option[];
  records: T[];
  isLoading: boolean;
  note: string | undefined;
};

function choices<T extends { id: string }>(
  data: { records: T[]; truncated: boolean } | undefined,
  isLoading: boolean,
  label: (record: T) => string,
): Choices<T> {
  const records = data?.records ?? [];
  return {
    records,
    options: records.map((record) => ({
      value: record.id,
      label: label(record),
    })),
    isLoading,
    note: data?.truncated ? TRUNCATED_NOTE : undefined,
  };
}

/** Regions for a dropdown. `activeOnly` for forms: nothing can be created under an inactive region. */
export function useRegionChoices(activeOnly = false): Choices<Region> {
  const { data, isLoading } = useOrganizationOptions(
    'regions',
    activeOnly ? { is_active: true } : {},
  );
  return choices(data, isLoading, refLabel);
}

/** Offices for a dropdown, optionally those of one region. Disabled until `enabled`. */
export function useOfficeChoices(
  filter: { region?: string; kind?: OfficeKind; activeOnly?: boolean } = {},
  enabled = true,
): Choices<Office> {
  const { data, isLoading } = useOrganizationOptions(
    'offices',
    {
      region: filter.region,
      kind: filter.kind,
      is_active: filter.activeOnly ? true : undefined,
    },
    enabled,
  );
  return choices(
    data,
    isLoading && enabled,
    (office) => `${refLabel(office)} · ${OFFICE_KIND_LABELS[office.kind]}`,
  );
}

/**
 * Departments for a dropdown, optionally those of one office. With `withOffice` each is
 * named with its office, for lists that span offices: department names repeat across them.
 */
export function useDepartmentChoices(
  filter: { office?: string; activeOnly?: boolean; withOffice?: boolean } = {},
  enabled = true,
): Choices<Department> {
  const { data, isLoading } = useOrganizationOptions(
    'departments',
    { office: filter.office, is_active: filter.activeOnly ? true : undefined },
    enabled,
  );
  return choices(data, isLoading && enabled, (department) =>
    filter.withOffice
      ? `${refLabel(department)} · ${department.office.name}`
      : refLabel(department),
  );
}

/** Locations for a dropdown, optionally those of one region or office. */
export function useLocationChoices(
  filter: { region?: string; office?: string; activeOnly?: boolean } = {},
  enabled = true,
): Choices<Location> {
  const { data, isLoading } = useOrganizationOptions(
    'locations',
    {
      region: filter.region,
      office: filter.office,
      is_active: filter.activeOnly ? true : undefined,
    },
    enabled,
  );
  return choices(
    data,
    isLoading && enabled,
    (location) => `${location.name} · ${location.office.name}`,
  );
}
