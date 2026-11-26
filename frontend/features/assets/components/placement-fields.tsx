'use client';

import {
  EntityPicker,
  type PickerOption,
} from '@/components/shared/entity-picker';
import { Field } from '@/components/shared/form-field';
import { SelectField } from '@/components/shared/select-field';
import type { Ref } from '@/features/auth/types';
import { inventoryKeys, searchRecipients } from '@/features/inventory/api';
import { useOrganizationOptions } from '@/features/organization/api';

import { assetKeys, searchLocations, type Placement } from '../api';
import { ASSIGNEE_OPTIONS, type AssigneeType } from '../types';

export type PlacementState = {
  assigneeType: AssigneeType;
  employee: PickerOption | null;
  departmentId: string;
  location: PickerOption | null;
};

export const EMPTY_PLACEMENT: PlacementState = {
  assigneeType: 'EMPLOYEE',
  employee: null,
  departmentId: '',
  location: null,
};

export type PlacementErrors = { assignee?: string; location?: string };

export function checkPlacement(state: PlacementState): PlacementErrors {
  const problems: PlacementErrors = {};
  if (state.assigneeType === 'EMPLOYEE' && !state.employee) {
    problems.assignee = 'Choose the employee who has it.';
  }
  if (state.assigneeType === 'DEPARTMENT' && !state.departmentId) {
    problems.assignee = 'Choose the department that has it.';
  }
  if (!state.location) {
    problems.location = 'Choose where it is.';
  }
  return problems;
}

export function toPlacement(state: PlacementState): Placement {
  const placement: Placement = {
    assignee_type: state.assigneeType,
    location_id: state.location?.value ?? '',
  };
  if (state.assigneeType === 'EMPLOYEE' && state.employee) {
    placement.employee_id = state.employee.value;
  }
  if (state.assigneeType === 'DEPARTMENT') {
    placement.department_id = state.departmentId;
  }
  return placement;
}

export function placementError(
  code: string | undefined,
  message: string,
): PlacementErrors | null {
  if (
    code === 'ASSIGNEE_INACTIVE' ||
    code === 'ASSIGNEE_NOT_IN_REGION' ||
    code === 'ASSIGNEE_MISMATCH'
  ) {
    return { assignee: message };
  }
  if (code === 'LOCATION_INACTIVE' || code === 'LOCATION_NOT_IN_REGION') {
    return { location: message };
  }
  return null;
}

type PlacementFieldsProps = {
  region: Ref;
  value: PlacementState;
  onChange: (value: PlacementState) => void;
  errors: PlacementErrors;
  onClearError: (field: keyof PlacementErrors) => void;
};

export function PlacementFields({
  region,
  value,
  onChange,
  errors,
  onClearError,
}: PlacementFieldsProps) {
  const departments = useOrganizationOptions(
    'departments',
    { region: region.id, is_active: true },
    value.assigneeType === 'DEPARTMENT',
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Who has it" required className="sm:col-span-2">
        {(control) => (
          <SelectField
            {...control}
            value={value.assigneeType}
            onChange={(next) => {
              onChange({
                ...value,
                assigneeType:
                  next === 'DEPARTMENT'
                    ? 'DEPARTMENT'
                    : next === 'LOCATION'
                      ? 'LOCATION'
                      : 'EMPLOYEE',
              });
              onClearError('assignee');
            }}
            options={ASSIGNEE_OPTIONS}
          />
        )}
      </Field>
      {value.assigneeType === 'EMPLOYEE' ? (
        <Field
          label="Employee"
          required
          error={errors.assignee}
          description={`An active employee of ${region.name}.`}
        >
          {(control) => (
            <EntityPicker
              {...control}
              placeholder="Choose an employee"
              searchPlaceholder="Search by name or matricule"
              queryKey={inventoryKeys.recipientPicker(region.id)}
              search={(term, signal) =>
                searchRecipients(region.id, term, signal)
              }
              value={value.employee}
              onChange={(employee) => {
                onChange({ ...value, employee });
                onClearError('assignee');
              }}
            />
          )}
        </Field>
      ) : null}
      {value.assigneeType === 'DEPARTMENT' ? (
        <Field
          label="Department"
          required
          error={errors.assignee}
          description={
            departments.data?.truncated
              ? 'Only the first 100 departments are listed.'
              : undefined
          }
        >
          {(control) => (
            <SelectField
              {...control}
              placeholder={
                departments.isLoading ? 'Loading…' : 'Choose a department'
              }
              value={value.departmentId}
              onChange={(departmentId) => {
                onChange({ ...value, departmentId });
                onClearError('assignee');
              }}
              options={(departments.data?.records ?? []).map((department) => ({
                value: department.id,
                label: `${department.name} (${department.code})`,
              }))}
            />
          )}
        </Field>
      ) : null}
      <Field
        label="Where it is"
        required
        error={errors.location}
        className={
          value.assigneeType === 'LOCATION' ? 'sm:col-span-2' : undefined
        }
      >
        {(control) => (
          <EntityPicker
            {...control}
            placeholder="Choose a location"
            searchPlaceholder="Search by name"
            queryKey={assetKeys.locationPicker(region.id)}
            search={(term, signal) => searchLocations(region.id, term, signal)}
            value={value.location}
            onChange={(location) => {
              onChange({ ...value, location });
              onClearError('location');
            }}
          />
        )}
      </Field>
    </div>
  );
}
