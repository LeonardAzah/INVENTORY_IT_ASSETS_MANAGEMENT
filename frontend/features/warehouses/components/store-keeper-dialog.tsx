'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';

import {
  EntityPicker,
  type PickerOption,
} from '@/components/shared/entity-picker';
import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentUser } from '@/features/auth/session';
import { applyServerErrors } from '@/lib/forms/server-errors';
import { canAny } from '@/lib/permissions/codes';

import { searchAccounts, useAssignStoreKeeper, warehouseKeys } from '../api';
import type { Warehouse } from '../types';

const schema = z.object({
  user_id: z.string().min(1, 'Choose who will keep the warehouse.'),
  reason: z.string().trim().max(255, 'Use at most 255 characters.'),
});
type Values = z.infer<typeof schema>;

export function StoreKeeperDialog({
  warehouse,
  onClose,
}: {
  warehouse: Warehouse;
  onClose: () => void;
}) {
  const me = useCurrentUser();
  const assign = useAssignStoreKeeper(warehouse.id);
  const [picked, setPicked] = useState<PickerOption | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { user_id: '', reason: '' },
  });
  const { errors } = form.formState;
  const current = warehouse.store_keeper;
  const searches = canAny(me, ['USER_MANAGE', 'USER_VIEW']);
  const mayChooseSelf =
    me.responsibilities.some((held) => held.code === 'STORE_KEEPER') &&
    current?.account_id !== me.id;

  const choose = (option: PickerOption | null) => {
    setPicked(option);
    form.setValue('user_id', option?.value ?? '', { shouldValidate: true });
  };

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    assign.mutate(values, {
      onSuccess: (response) => {
        toast.success(response.message);
        onClose();
      },
      onError: (error) =>
        setFormError(
          applyServerErrors(error, form.setError, ['user_id', 'reason']),
        ),
    });
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Store Keeper of ${warehouse.name}`}
      description="The Store Keeper is the only person who can record receipts, issues, returns, adjustments and stock-takes in this warehouse."
      onSubmit={submit}
      submitLabel={current ? 'Replace Store Keeper' : 'Assign Store Keeper'}
      submittingLabel="Assigning…"
      isSubmitting={assign.isPending}
      error={formError}
    >
      {current ? (
        <Alert variant="default">
          <TriangleAlert aria-hidden />
          <AlertTitle>This replaces {current.name}</AlertTitle>
          <AlertDescription>
            Their assignment to this warehouse ends when the new one starts.
            They keep the Store Keeper responsibility and any other warehouse
            they keep.
          </AlertDescription>
        </Alert>
      ) : null}
      <Field
        label="Store Keeper"
        required
        description={
          searches
            ? 'Only people who hold the Store Keeper responsibility, within what you can see. Grant it on their account page first.'
            : undefined
        }
        error={errors.user_id?.message}
      >
        {(control) =>
          searches ? (
            <EntityPicker
              {...control}
              value={picked}
              onChange={choose}
              queryKey={warehouseKeys.keeperPicker}
              search={searchAccounts}
              placeholder="Choose a person"
              searchPlaceholder="Search by name, email or matricule"
            />
          ) : (
            <Input
              disabled
              readOnly
              value={picked?.label ?? ''}
              placeholder="Nobody chosen"
              {...control}
            />
          )
        }
      </Field>
      {mayChooseSelf ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => choose({ value: me.id, label: `${me.name} (you)` })}
          >
            Choose myself
          </Button>
        </div>
      ) : null}
      <Field
        label="Reason"
        description="Optional. Recorded in the audit log."
        error={errors.reason?.message}
      >
        {(control) => (
          <Input autoComplete="off" {...control} {...form.register('reason')} />
        )}
      </Field>
    </FormDialog>
  );
}
