'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type FieldProps = {
  label: string;
  error?: string;
  description?: string;
  required?: boolean;
  className?: string;
  children: (control: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
    required: boolean | undefined;
  }) => React.ReactNode;
};

export function Field({
  label,
  error,
  description,
  required,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy =
    [description ? descriptionId : null, error ? errorId : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
        required,
      })}
      {description ? (
        <p id={descriptionId} className="text-muted-foreground text-sm">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-destructive text-sm wrap-break-word">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        className={cn('pr-11', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="hover:text-foreground focus-visible:ring-ring absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-neutral-600 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
      >
        <Icon className="size-4" aria-hidden />
      </button>
    </div>
  );
}
