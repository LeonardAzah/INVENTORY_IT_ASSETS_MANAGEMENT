'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormDialog } from './form-dialog';
import { Field } from './form-field';

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Give a reason.')
    .max(255, 'Use at most 255 characters.'),
});

type ReasonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  isSubmitting: boolean;
  error?: string | null;
  children?: React.ReactNode;
};

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  isSubmitting,
  error,
  children,
}: ReasonDialogProps) {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '' },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onSubmit={form.handleSubmit((values) => onConfirm(values.reason))}
      submitLabel={confirmLabel}
      submittingLabel="Working…"
      isSubmitting={isSubmitting}
      error={error}
    >
      <Field
        label="Reason"
        required
        description="Recorded in the audit log."
        error={form.formState.errors.reason?.message}
      >
        {(control) => (
          <textarea
            rows={3}
            className="border-input bg-card placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 aria-invalid:border-destructive w-full min-w-0 rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-2 md:text-sm"
            {...control}
            {...form.register('reason')}
          />
        )}
      </Field>
      {children}
    </FormDialog>
  );
}
