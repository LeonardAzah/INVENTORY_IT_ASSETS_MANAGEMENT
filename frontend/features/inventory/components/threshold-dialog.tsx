'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import { errorMessage } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatQuantity, parseQuantity } from '@/lib/format/quantity';

import { useSetThreshold } from '../api';
import type { Balance } from '../types';

export function ThresholdDialog({
  balance,
  onClose,
}: {
  balance: Balance;
  onClose: () => void;
}) {
  const save = useSetThreshold();
  const { item, warehouse } = balance;
  const places = item.decimal_places;
  const [text, setText] = useState(
    balance.threshold === null
      ? ''
      : formatQuantity(balance.threshold, {
          decimalPlaces: places,
          grouped: false,
        }),
  );
  const [fieldError, setFieldError] = useState<string | null>(null);

  const send = (threshold: string | null) =>
    save.mutate(
      { warehouse_id: warehouse.id, item_id: item.id, threshold },
      {
        onSuccess: (response) => {
          toast.success(response.message);
          onClose();
        },
      },
    );

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseQuantity(text, places, { allowZero: true });
    if (!parsed.ok) {
      setFieldError(parsed.message);
      return;
    }
    setFieldError(null);
    send(parsed.value);
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Low-stock threshold"
      description={`${item.name} (${item.code}) in ${warehouse.name}. Available now: ${formatQuantity(balance.available, { decimalPlaces: places })} ${item.unit}.`}
      onSubmit={submit}
      submitLabel="Save threshold"
      isSubmitting={save.isPending}
      error={save.error ? errorMessage(save.error) : null}
    >
      <Field
        label={`Alert when available stock is at or below (${item.unit})`}
        required
        description={
          places === 0
            ? 'A whole number. An email goes to the people responsible for the warehouse.'
            : `Up to ${places} decimal places. An email goes to the people responsible for the warehouse.`
        }
        error={fieldError ?? undefined}
      >
        {(control) => (
          <Input
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="tabular-nums"
            {...control}
          />
        )}
      </Field>
      {balance.threshold === null ? null : (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={save.isPending}
            onClick={() => send(null)}
          >
            Remove the threshold
          </Button>
        </div>
      )}
    </FormDialog>
  );
}
