'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type Option = {
  value: string;
  label: string;
};

const NONE = '__none__';

type SelectFieldProps = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  required?: boolean;
};

export function SelectField({
  value,
  onChange,
  options,
  placeholder,
  noneLabel,
  disabled,
  className,
  required,
  ...trigger
}: SelectFieldProps) {
  return (
    <Select
      value={value || (noneLabel ? NONE : '')}
      onValueChange={(next) => onChange(next === NONE ? '' : (next as string))}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn('w-full min-w-0', className)}
        aria-required={required || undefined}
        {...trigger}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-w-[calc(100vw-2rem)]">
        {noneLabel ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
