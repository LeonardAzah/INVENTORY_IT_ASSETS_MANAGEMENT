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
import { Input } from '@/components/ui/input';
import { isApiError } from '@/lib/api/errors';
import { applyServerErrors } from '@/lib/forms/server-errors';

import {
  accountKeys,
  searchCandidates,
  useAppointItAssetManager,
} from '../api';

const schema = z.object({
  account_id: z.string().min(1, 'Choose who to appoint.'),
  reason: z.string().trim().max(255, 'Use at most 255 characters.'),
});
type Values = z.infer<typeof schema>;

type AppointDialogProps = {
  region: { id: string; name: string };
  account?: { id: string; name: string };
  current?: { name: string } | null;
  onClose: () => void;
};

export function AppointDialog({
  region,
  account,
  current,
  onClose,
}: AppointDialogProps) {
  const appoint = useAppointItAssetManager();
  const [picked, setPicked] = useState<PickerOption | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [mustReplace, setMustReplace] = useState(false);
  const replacing = Boolean(current) || mustReplace;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { account_id: account?.id ?? '', reason: '' },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    appoint.mutate(
      {
        accountId: values.account_id,
        regionId: region.id,
        reason: values.reason,
        replace: replacing,
      },
      {
        onSuccess: (response) => {
          toast.success(response.message);
          onClose();
        },
        onError: (error) => {
          if (
            isApiError(error) &&
            error.errorCode === 'REGION_HAS_IT_ASSET_MANAGER'
          ) {
            setMustReplace(true);
            return;
          }
          setFormError(
            applyServerErrors(error, form.setError, ['account_id', 'reason']),
          );
        },
      },
    );
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`IT Asset Manager for ${region.name}`}
      description={
        account
          ? `Appoint ${account.name} to register, assign and maintain the region's IT assets.`
          : "The IT Asset Manager registers, assigns and maintains the region's IT assets."
      }
      onSubmit={submit}
      submitLabel={replacing ? 'Replace and appoint' : 'Appoint'}
      submittingLabel="Appointing…"
      isSubmitting={appoint.isPending}
      error={formError}
    >
      {replacing ? (
        <Alert variant="default">
          <TriangleAlert aria-hidden />
          <AlertTitle>This replaces the current IT Asset Manager</AlertTitle>
          <AlertDescription>
            {current
              ? `${current.name}'s appointment ends when the new one starts.`
              : 'The region already has one. Their appointment ends when the new one starts.'}
          </AlertDescription>
        </Alert>
      ) : null}
      {account ? null : (
        <Field
          label="Appoint"
          required
          description="Accounts of this region that can hold the post."
          error={errors.account_id?.message}
        >
          {(control) => (
            <EntityPicker
              {...control}
              value={picked}
              onChange={(option) => {
                setPicked(option);
                form.setValue('account_id', option?.value ?? '', {
                  shouldValidate: true,
                });
              }}
              queryKey={accountKeys.candidates(region.id)}
              search={searchCandidates(region.id)}
              placeholder="Choose a person"
              searchPlaceholder="Search by name, email or matricule"
            />
          )}
        </Field>
      )}
      <Field
        label="Reason"
        description="Required when an administrator makes the appointment. The region's Chief of Service of Computing is told."
        error={errors.reason?.message}
      >
        {(control) => (
          <Input autoComplete="off" {...control} {...form.register('reason')} />
        )}
      </Field>
    </FormDialog>
  );
}
