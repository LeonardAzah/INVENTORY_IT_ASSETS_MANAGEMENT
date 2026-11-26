'use client';

import { useId } from 'react';

import { Field } from '@/components/shared/form-field';
import { SelectField } from '@/components/shared/select-field';
import { Input } from '@/components/ui/input';

import {
  activeFields,
  describeField,
  type SpecFormValue,
  type SpecFormValues,
} from '../specifications';
import type { SpecificationField, SpecificationTemplate } from '../types';

const BOOLEAN_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

type SpecInputsProps = {
  template: SpecificationTemplate;
  values: SpecFormValues;
  errors: Record<string, string>;
  onChange: (key: string, value: SpecFormValue) => void;
};

export function SpecInputs({
  template,
  values,
  errors,
  onChange,
}: SpecInputsProps) {
  const fields = activeFields(template);
  if (fields.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        The template {template.name} has no specifications yet.
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <SpecInput
          key={field.id}
          field={field}
          value={
            values[field.key] ?? (field.data_type === 'MULTI_CHOICE' ? [] : '')
          }
          error={errors[field.key]}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
    </div>
  );
}

type SpecInputProps = {
  field: SpecificationField;
  value: SpecFormValue;
  error?: string;
  onChange: (value: SpecFormValue) => void;
};

function SpecInput({ field, value, error, onChange }: SpecInputProps) {
  const description = describeField(field);
  if (field.data_type === 'MULTI_CHOICE') {
    return (
      <ChoiceList
        field={field}
        value={value as string[]}
        error={error}
        description={description}
        onChange={onChange}
      />
    );
  }
  const text = value as string;
  return (
    <Field
      label={field.label}
      required={field.required}
      description={description}
      error={error}
    >
      {(control) => {
        if (field.data_type === 'CHOICE' || field.data_type === 'BOOLEAN') {
          return (
            <SelectField
              {...control}
              value={text}
              onChange={onChange}
              placeholder="Choose"
              // A value that is not required can be left unstated.
              noneLabel={field.required ? undefined : 'Not stated'}
              options={
                field.data_type === 'BOOLEAN'
                  ? BOOLEAN_OPTIONS
                  : field.choices.map((choice) => ({
                      value: choice,
                      label: choice,
                    }))
              }
            />
          );
        }
        const numeric = field.data_type !== 'TEXT';
        const whole =
          field.data_type === 'INTEGER' || field.decimal_places === 0;
        return (
          <Input
            {...control}
            value={text}
            onChange={(event) => onChange(event.target.value)}
            inputMode={numeric ? (whole ? 'numeric' : 'decimal') : undefined}
            autoComplete="off"
            maxLength={numeric ? 30 : 255}
          />
        );
      }}
    </Field>
  );
}

type ChoiceListProps = {
  field: SpecificationField;
  value: string[];
  error?: string;
  description?: string;
  onChange: (value: string[]) => void;
};

function ChoiceList({
  field,
  value,
  error,
  description,
  onChange,
}: ChoiceListProps) {
  const id = useId();
  const describedBy = [
    description ? `${id}-description` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <fieldset
      className="flex min-w-0 flex-col gap-1.5 sm:col-span-2"
      aria-describedby={describedBy || undefined}
      aria-invalid={Boolean(error)}
    >
      <legend className="mb-1.5 text-sm leading-none font-medium">
        {field.label}
        {field.required ? (
          <span aria-hidden className="text-destructive">
            *
          </span>
        ) : null}
      </legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {field.choices.map((choice) => (
          <label
            key={choice}
            className="inline-flex items-center gap-2 text-sm pointer-coarse:min-h-11"
          >
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={value.includes(choice)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, choice]
                    : value.filter((chosen) => chosen !== choice),
                )
              }
            />
            {choice}
          </label>
        ))}
      </div>
      {description ? (
        <p id={`${id}-description`} className="text-muted-foreground text-sm">
          {description}
        </p>
      ) : null}
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
