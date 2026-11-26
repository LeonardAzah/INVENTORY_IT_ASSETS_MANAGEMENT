'use client';

import { Field } from '@/components/shared/form-field';
import { SelectField } from '@/components/shared/select-field';
import type { Role } from '@/features/auth/types';
import {
  useDepartmentChoices,
  useOfficeChoices,
  useRegionChoices,
} from '@/features/organization/components/shared';

import type { JurisdictionInput } from '../api';
import type { GrantableRole, JurisdictionLevel } from '../types';

/** The role and jurisdiction part of a form (authorization-requirements). */
export type RoleScope = {
  role: string;
  region_id: string;
  office_id: string;
  department_id: string;
};

export const EMPTY_SCOPE = { region_id: '', office_id: '', department_id: '' };

const LEVEL_TEXT: Record<JurisdictionLevel, string> = {
  region:
    'A Regional Representative acts in one region: the region they represent.',
  office: 'A Manager heads one commercial branch.',
  department:
    "A Chief of Service heads one department. For a region's computing department, they become its Chief of Service of Computing.",
};

export function levelOf(
  roles: GrantableRole[] | undefined,
  role: string,
): JurisdictionLevel | null {
  return roles?.find((option) => option.role === role)?.jurisdiction ?? null;
}

export function toJurisdiction(
  level: JurisdictionLevel | null,
  scope: Omit<RoleScope, 'role'>,
): {
  jurisdiction?: JurisdictionInput;
  missing?: keyof Omit<RoleScope, 'role'>;
} {
  if (level === null) {
    return {};
  }
  if (level === 'region') {
    return scope.region_id
      ? { jurisdiction: { region_id: scope.region_id } }
      : { missing: 'region_id' };
  }
  if (level === 'office') {
    return scope.office_id
      ? { jurisdiction: { office_id: scope.office_id } }
      : { missing: 'office_id' };
  }
  return scope.department_id
    ? { jurisdiction: { department_id: scope.department_id } }
    : { missing: 'department_id' };
}

type Props = {
  roles: GrantableRole[];
  value: RoleScope;
  onChange: (value: RoleScope) => void;
  errors: Partial<Record<keyof RoleScope, string | undefined>>;
};

export function RoleFields({ roles, value, onChange, errors }: Props) {
  const level = levelOf(roles, value.role);
  const regions = useRegionChoices(true);
  const offices = useOfficeChoices(
    {
      region: value.region_id,
      kind: level === 'office' ? 'COMMERCIAL_CENTER' : undefined,
      activeOnly: true,
    },
    Boolean(value.region_id) && (level === 'office' || level === 'department'),
  );
  const departments = useDepartmentChoices(
    { office: value.office_id, activeOnly: true },
    Boolean(value.office_id) && level === 'department',
  );
  const set = (patch: Partial<RoleScope>) => onChange({ ...value, ...patch });

  return (
    <>
      <Field
        label="Role"
        required
        description="Only the roles you may give are offered."
        error={errors.role}
      >
        {(control) => (
          <SelectField
            {...control}
            value={value.role}
            onChange={(role) => onChange({ role, ...EMPTY_SCOPE })}
            options={roles.map((option) => ({
              value: option.role,
              label: option.label,
            }))}
          />
        )}
      </Field>
      {level ? (
        <>
          <p className="text-sm text-neutral-600">{LEVEL_TEXT[level]}</p>
          <Field
            label="Region"
            required
            description={regions.note}
            error={errors.region_id}
          >
            {(control) => (
              <SelectField
                {...control}
                placeholder="Choose a region"
                value={value.region_id}
                onChange={(region_id) =>
                  set({ region_id, office_id: '', department_id: '' })
                }
                options={regions.options}
              />
            )}
          </Field>
          {level === 'office' || level === 'department' ? (
            <Field
              label={level === 'office' ? 'Commercial branch' : 'Office'}
              required
              description={offices.note}
              error={errors.office_id}
            >
              {(control) => (
                <SelectField
                  {...control}
                  placeholder={
                    level === 'office'
                      ? 'Choose a commercial branch'
                      : 'Choose an office'
                  }
                  value={value.office_id}
                  onChange={(office_id) =>
                    set({ office_id, department_id: '' })
                  }
                  options={offices.options}
                  disabled={!value.region_id}
                />
              )}
            </Field>
          ) : null}
          {level === 'department' ? (
            <Field
              label="Department"
              required
              description={departments.note}
              error={errors.department_id}
            >
              {(control) => (
                <SelectField
                  {...control}
                  placeholder="Choose a department"
                  value={value.department_id}
                  onChange={(department_id) => set({ department_id })}
                  options={departments.options}
                  disabled={!value.office_id}
                />
              )}
            </Field>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** For an account's current role, as a starting value. */
export function scopeOf(role: Role): RoleScope {
  return { role, ...EMPTY_SCOPE };
}
