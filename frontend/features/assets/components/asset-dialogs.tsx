'use client';

import { CircleCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  EntityPicker,
  type PickerOption,
} from '@/components/shared/entity-picker';
import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import { SelectField } from '@/components/shared/select-field';
import { SwitchField } from '@/components/shared/switch-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { ROW_LINK } from '@/features/accounts/components/shared';
import { useCurrentUser } from '@/features/auth/session';
import { isUncertainOutcome } from '@/features/inventory/document-errors';
import { isApiError } from '@/lib/api/errors';
import { today } from '@/lib/format/date';
import { can } from '@/lib/permissions/codes';

import {
  assetKeys,
  searchAssets,
  searchLocations,
  useAssetActions,
} from '../api';
import {
  COMPUTER_TEXT_FIELDS,
  DEDICATED_STATUSES,
  DISPOSAL_STATUSES,
  NEXT_STATUSES,
  RELATIONSHIP_FROM,
  STATUS_LABELS,
  statusLabel,
  type Asset,
  type AssetRef,
  type AssetStatus,
  type Relationship,
  type RelationshipKind,
} from '../types';
import {
  checkPlacement,
  EMPTY_PLACEMENT,
  placementError,
  PlacementFields,
  toPlacement,
  type PlacementState,
} from './placement-fields';

const TEXTAREA =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive md:text-sm';

type DialogProps = { asset: Asset; onClose: () => void };

const refusal = (error: unknown) => ({
  code: isApiError(error) ? error.errorCode : undefined,
  message: isApiError(error)
    ? error.message
    : 'Something went wrong. Please try again.',
});

function Uncertain({ what }: { what: string }) {
  return (
    <Alert variant="default">
      <TriangleAlert aria-hidden />
      <AlertTitle>We could not confirm {what}</AlertTitle>
      <AlertDescription>
        The server did not answer, so it may or may not have gone through. Try
        again: it is safe, because the same request is never applied twice.
      </AlertDescription>
    </Alert>
  );
}

function useOutcome(
  onRefused?: (code: string | undefined, message: string) => boolean,
) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [general, setGeneral] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  return {
    requestId,
    general,
    uncertain,
    begin: () => {
      setGeneral(null);
      setUncertain(false);
    },
    fail: (error: unknown) => {
      if (isUncertainOutcome(error)) {
        setUncertain(true);
        return;
      }
      const { code, message } = refusal(error);
      if (!onRefused?.(code, message)) {
        setGeneral(message);
      }
    },
  };
}

const describe = (asset: Asset) =>
  `${asset.asset_tag} · ${asset.item.name}${asset.serial_number ? ` · ${asset.serial_number}` : ''}`;

export function AssignDialog({ asset, onClose }: DialogProps) {
  const { assign } = useAssetActions(asset.id);
  const reassigning = asset.status === 'ASSIGNED';
  const [placement, setPlacement] = useState<PlacementState>(EMPTY_PLACEMENT);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [peripherals, setPeripherals] = useState<AssetRef[] | null>(null);
  const outcome = useOutcome((code, message) => {
    const placed = placementError(code, message);
    if (placed) {
      setErrors({ ...placed });
    }
    return Boolean(placed);
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (peripherals) {
      onClose();
      return;
    }
    const problems = checkPlacement(placement);
    setErrors({ ...problems });
    outcome.begin();
    if (Object.keys(problems).length > 0) {
      return;
    }
    assign.mutate(
      {
        ...toPlacement(placement),
        notes: notes.trim(),
        client_request_id: outcome.requestId,
      },
      {
        onSuccess: (response) => {
          toast.success(response.message);
          if (response.data.linked_peripherals.length > 0) {
            setPeripherals(response.data.linked_peripherals);
          } else {
            onClose();
          }
        },
        onError: outcome.fail,
      },
    );
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={reassigning ? 'Reassign the asset' : 'Assign the asset'}
      description={
        peripherals
          ? describe(asset)
          : `${describe(asset)}. ${reassigning ? 'The current assignment ends and the new one begins.' : asset.custody_warehouse ? 'It leaves the IT warehouse.' : 'It is recorded with whoever has it.'}`
      }
      onSubmit={submit}
      submitLabel={peripherals ? 'Done' : reassigning ? 'Reassign' : 'Assign'}
      submittingLabel="Assigning…"
      isSubmitting={assign.isPending}
      error={outcome.general}
    >
      {peripherals ? (
        <Alert variant="default">
          <CircleCheck aria-hidden />
          <AlertTitle>Assigned. Its linked equipment was not moved</AlertTitle>
          <AlertDescription>
            <p>
              Each of these is its own asset. Assign or relocate them one by one
              if they went along.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {peripherals.map((peripheral) => (
                <li key={peripheral.id}>
                  <Link
                    href={`/it/assets/${peripheral.id}`}
                    className={ROW_LINK}
                  >
                    {peripheral.asset_tag}
                  </Link>{' '}
                  {peripheral.item} · {statusLabel(peripheral.status)}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {outcome.uncertain ? <Uncertain what="the assignment" /> : null}
          <PlacementFields
            region={asset.region}
            value={placement}
            onChange={setPlacement}
            errors={errors}
            onClearError={(field) =>
              setErrors((current) => ({ ...current, [field]: '' }))
            }
          />
          <Field label="Notes">
            {(control) => (
              <textarea
                rows={2}
                className={TEXTAREA}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                {...control}
              />
            )}
          </Field>
        </>
      )}
    </FormDialog>
  );
}

/** The holder hands the unit back to the IT warehouse. It must be inspected before it is used again. */
export function ReturnDialog({ asset, onClose }: DialogProps) {
  const { giveBack } = useAssetActions(asset.id);
  const [condition, setCondition] = useState('');
  const [missing, setMissing] = useState(false);
  const outcome = useOutcome();

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Record the return"
      description={`${describe(asset)}. It comes back into the IT warehouse as "Returned", to be inspected before it is assigned again.`}
      onSubmit={(event) => {
        event.preventDefault();
        setMissing(condition.trim() === '');
        outcome.begin();
        if (condition.trim() === '') {
          return;
        }
        giveBack.mutate(
          {
            condition_notes: condition.trim(),
            client_request_id: outcome.requestId,
          },
          {
            onSuccess: (response) => {
              toast.success(response.message);
              onClose();
            },
            onError: outcome.fail,
          },
        );
      }}
      submitLabel="Record the return"
      submittingLabel="Recording…"
      isSubmitting={giveBack.isPending}
      error={outcome.general}
    >
      {outcome.uncertain ? <Uncertain what="the return" /> : null}
      <Field
        label="Condition on return"
        required
        description="What state it came back in."
        error={missing ? 'Describe the condition it came back in.' : undefined}
      >
        {(control) => (
          <Input
            autoComplete="off"
            maxLength={255}
            value={condition}
            onChange={(event) => {
              setCondition(event.target.value);
              setMissing(false);
            }}
            {...control}
          />
        )}
      </Field>
    </FormDialog>
  );
}

/** Moves a deployed asset to another place in its region. Nothing changes in any warehouse. */
export function RelocateDialog({ asset, onClose }: DialogProps) {
  const { relocate } = useAssetActions(asset.id);
  const [location, setLocation] = useState<PickerOption | null>(null);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const outcome = useOutcome((code, message) => {
    if (
      code === 'SAME_LOCATION' ||
      code === 'LOCATION_INACTIVE' ||
      code === 'LOCATION_NOT_IN_REGION'
    ) {
      setErrors({ location: message });
      return true;
    }
    return false;
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Relocate the asset"
      description={`${describe(asset)}. Now at ${asset.location?.name ?? 'an unrecorded place'}. Whoever holds it stays the same.`}
      onSubmit={(event) => {
        event.preventDefault();
        const problems: Record<string, string> = {};
        if (!location) {
          problems.location = 'Choose where it is going.';
        }
        if (reason.trim() === '') {
          problems.reason = 'Say why it is being moved.';
        }
        setErrors(problems);
        outcome.begin();
        if (!location || Object.keys(problems).length > 0) {
          return;
        }
        relocate.mutate(
          {
            location_id: location.value,
            reason: reason.trim(),
            client_request_id: outcome.requestId,
          },
          {
            onSuccess: (response) => {
              toast.success(response.message);
              onClose();
            },
            onError: outcome.fail,
          },
        );
      }}
      submitLabel="Relocate"
      submittingLabel="Relocating…"
      isSubmitting={relocate.isPending}
      error={outcome.general}
    >
      {outcome.uncertain ? <Uncertain what="the move" /> : null}
      <Field
        label="New location"
        required
        error={errors.location || undefined}
        description={`An active location of ${asset.region.name}.`}
      >
        {(control) => (
          <EntityPicker
            {...control}
            placeholder="Choose a location"
            searchPlaceholder="Search by name"
            queryKey={assetKeys.locationPicker(asset.region.id)}
            search={(term, signal) =>
              searchLocations(asset.region.id, term, signal)
            }
            value={location}
            onChange={(option) => {
              setLocation(option);
              setErrors((current) => ({ ...current, location: '' }));
            }}
          />
        )}
      </Field>
      <Field label="Reason" required error={errors.reason || undefined}>
        {(control) => (
          <Input
            autoComplete="off"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setErrors((current) => ({ ...current, reason: '' }));
            }}
            {...control}
          />
        )}
      </Field>
    </FormDialog>
  );
}

const CUSTODY_OPTIONS = [
  { value: 'in', label: 'It was brought into the IT warehouse' },
  { value: 'out', label: 'It stays where it is' },
];

/** The statuses this user may give the asset through "change status" (the others have their own operation). */
export function statusChoices(
  asset: Asset,
  me: Parameters<typeof can>[0],
): AssetStatus[] {
  return NEXT_STATUSES[asset.status].filter(
    (status) =>
      !DEDICATED_STATUSES.includes(status) &&
      can(
        me,
        DISPOSAL_STATUSES.includes(status)
          ? 'IT_ASSET_DISPOSE'
          : 'IT_ASSET_MAINTAIN',
      ),
  );
}

/** Inspection, maintenance, damage, loss and retirement, each with its reason. */
export function StatusDialog({ asset, onClose }: DialogProps) {
  const me = useCurrentUser();
  const { changeStatus } = useAssetActions(asset.id);
  const choices = statusChoices(asset, me);
  const [target, setTarget] = useState<AssetStatus | ''>(
    choices.length === 1 ? choices[0] : '',
  );
  const [reason, setReason] = useState('');
  const [custody, setCustody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const outcome = useOutcome((code, message) => {
    if (code === 'REASON_REQUIRED') {
      setErrors({ reason: message });
      return true;
    }
    if (code === 'CUSTODY_DECISION_REQUIRED' || code === 'NOT_IN_CUSTODY') {
      setErrors({
        custody: 'Say whether the unit was brought into the IT warehouse.',
      });
      return true;
    }
    return false;
  });

  const inWarehouse = asset.custody_warehouse !== null;
  // Mirrors assets/services/lifecycle.py::change_status: where the unit physically is matters
  // only when it is outside the warehouse and is not being lost or retired.
  const repair = target === 'MAINTENANCE' || target === 'DAMAGED';
  const asksCustody = !inWarehouse && repair;
  const mustEnter = !inWarehouse && target === 'AVAILABLE';
  const disposal = target !== '' && DISPOSAL_STATUSES.includes(target);

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Change the status"
      description={`${describe(asset)}. Now: ${STATUS_LABELS[asset.status]}. The change is kept on its history with your reason.`}
      onSubmit={(event) => {
        event.preventDefault();
        const problems: Record<string, string> = {};
        if (!target) {
          problems.target = 'Choose the new status.';
        }
        if (reason.trim() === '') {
          problems.reason = 'Say why the status is changing.';
        }
        // For an assigned asset the backend insists on an answer; otherwise staying put is the default.
        if (asksCustody && asset.status === 'ASSIGNED' && !custody) {
          problems.custody =
            'Say whether the unit was brought into the IT warehouse.';
        }
        if (mustEnter && custody !== 'in') {
          problems.custody =
            'Only a unit that is in the IT warehouse can be made available. Confirm that it was brought in.';
        }
        setErrors(problems);
        outcome.begin();
        if (!target || Object.keys(problems).length > 0) {
          return;
        }
        changeStatus.mutate(
          {
            to_status: target,
            reason: reason.trim(),
            ...(mustEnter || (asksCustody && custody)
              ? { into_custody: custody === 'in' }
              : {}),
            client_request_id: outcome.requestId,
          },
          {
            onSuccess: (response) => {
              toast.success(response.message);
              onClose();
            },
            onError: outcome.fail,
          },
        );
      }}
      submitLabel="Change the status"
      submittingLabel="Saving…"
      isSubmitting={changeStatus.isPending}
      error={outcome.general}
    >
      {outcome.uncertain ? <Uncertain what="the change" /> : null}
      <Field
        label="New status"
        required
        error={errors.target || undefined}
        description={
          disposal
            ? target === 'RETIRED'
              ? 'A retired asset is closed for good: nothing more can be done with it.'
              : 'A lost asset leaves the stock. If it turns up, it is recorded as found.'
            : asset.status === 'ASSIGNED' && target
              ? 'Its current assignment ends.'
              : undefined
        }
      >
        {(control) => (
          <SelectField
            {...control}
            placeholder="Choose a status"
            value={target}
            onChange={(value) => {
              setTarget(value as AssetStatus);
              setCustody('');
              setErrors({});
            }}
            options={choices.map((status) => ({
              value: status,
              label: STATUS_LABELS[status],
            }))}
          />
        )}
      </Field>
      {asksCustody || mustEnter ? (
        <Field
          label="Where is the unit now"
          required={mustEnter || asset.status === 'ASSIGNED'}
          error={errors.custody || undefined}
        >
          {(control) => (
            <SelectField
              {...control}
              placeholder="Choose"
              value={custody}
              onChange={(value) => {
                setCustody(value);
                setErrors((current) => ({ ...current, custody: '' }));
              }}
              options={
                mustEnter ? CUSTODY_OPTIONS.slice(0, 1) : CUSTODY_OPTIONS
              }
            />
          )}
        </Field>
      ) : null}
      <Field label="Reason" required error={errors.reason || undefined}>
        {(control) => (
          <textarea
            rows={2}
            className={TEXTAREA}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setErrors((current) => ({ ...current, reason: '' }));
            }}
            {...control}
          />
        )}
      </Field>
    </FormDialog>
  );
}

/** A lost asset turns up. It becomes "Unknown" and is then verified like a discovery. */
export function FoundDialog({ asset, onClose }: DialogProps) {
  const { found } = useAssetActions(asset.id);
  const [location, setLocation] = useState<PickerOption | null>(null);
  const [intoCustody, setIntoCustody] = useState(false);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const outcome = useOutcome((code, message) => {
    if (code === 'LOCATION_INACTIVE' || code === 'LOCATION_NOT_IN_REGION') {
      setErrors({ location: message });
      return true;
    }
    if (code === 'NOTE_REQUIRED') {
      setErrors({ notes: message });
      return true;
    }
    return false;
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Record the asset as found"
      description={`${describe(asset)}. It becomes "Unknown (to be verified)"; the time it was lost stays on its history.`}
      onSubmit={(event) => {
        event.preventDefault();
        const problems: Record<string, string> = {};
        if (!location) {
          problems.location = 'Choose where it was found.';
        }
        if (notes.trim() === '') {
          problems.notes = 'Say where and how it was found.';
        }
        setErrors(problems);
        outcome.begin();
        if (!location || Object.keys(problems).length > 0) {
          return;
        }
        found.mutate(
          {
            found_at_location_id: location.value,
            into_custody: intoCustody,
            notes: notes.trim(),
            client_request_id: outcome.requestId,
          },
          {
            onSuccess: (response) => {
              toast.success(response.message);
              onClose();
            },
            onError: outcome.fail,
          },
        );
      }}
      submitLabel="Record as found"
      submittingLabel="Recording…"
      isSubmitting={found.isPending}
      error={outcome.general}
    >
      {outcome.uncertain ? <Uncertain what="that it was recorded" /> : null}
      <Field label="Found at" required error={errors.location || undefined}>
        {(control) => (
          <EntityPicker
            {...control}
            placeholder="Choose a location"
            searchPlaceholder="Search by name"
            queryKey={assetKeys.locationPicker(asset.region.id)}
            search={(term, signal) =>
              searchLocations(asset.region.id, term, signal)
            }
            value={location}
            onChange={(option) => {
              setLocation(option);
              setErrors((current) => ({ ...current, location: '' }));
            }}
          />
        )}
      </Field>
      <SwitchField
        label="Brought into the IT warehouse"
        description="Turn on if the unit is now in the IT warehouse. Otherwise it is recorded at the place it was found."
        checked={intoCustody}
        onChange={setIntoCustody}
      />
      <Field
        label="How it was found"
        required
        error={errors.notes || undefined}
      >
        {(control) => (
          <textarea
            rows={2}
            className={TEXTAREA}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              setErrors((current) => ({ ...current, notes: '' }));
            }}
            {...control}
          />
        )}
      </Field>
    </FormDialog>
  );
}

/** Edits what describes the unit. Saving the same values again changes nothing, so this needs no request id. */
export function EditAssetDialog({ asset, onClose }: DialogProps) {
  const { update } = useAssetActions(asset.id);
  const [lot, setLot] = useState(asset.lot_number);
  const [observations, setObservations] = useState(asset.critical_observations);
  const [details, setDetails] = useState<Record<string, string>>(() =>
    asset.computer_details
      ? Object.fromEntries(
          Object.entries(asset.computer_details).map(([key, value]) => [
            key,
            value ?? '',
          ]),
        )
      : {},
  );
  const outcome = useOutcome();

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Edit the details"
      description={`${describe(asset)}. Each change is kept on its history with the values before and after. The serial number cannot be changed.`}
      onSubmit={(event) => {
        event.preventDefault();
        outcome.begin();
        update.mutate(
          {
            lot_number: lot.trim(),
            critical_observations: observations.trim(),
            // Always sent: empty for anything but a computer.
            computer_details: asset.computer_details
              ? {
                  ...Object.fromEntries(
                    COMPUTER_TEXT_FIELDS.map((field) => [
                      field.name,
                      (details[field.name] ?? '').trim(),
                    ]),
                  ),
                  deployment_date: details.deployment_date || null,
                }
              : {},
          },
          {
            onSuccess: (response) => {
              toast.success(response.message);
              onClose();
            },
            onError: outcome.fail,
          },
        );
      }}
      submitLabel="Save changes"
      isSubmitting={update.isPending}
      error={outcome.general}
    >
      {outcome.uncertain ? (
        <Uncertain what="that the details were saved" />
      ) : null}
      <Field label="Lot number">
        {(control) => (
          <Input
            autoComplete="off"
            maxLength={100}
            value={lot}
            onChange={(event) => setLot(event.target.value)}
            {...control}
          />
        )}
      </Field>
      <Field
        label="Critical observations"
        description="Anything the next person handling this unit must know."
      >
        {(control) => (
          <textarea
            rows={3}
            className={TEXTAREA}
            value={observations}
            onChange={(event) => setObservations(event.target.value)}
            {...control}
          />
        )}
      </Field>
      {asset.computer_details ? (
        <fieldset className="flex flex-col gap-4 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Computer details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {COMPUTER_TEXT_FIELDS.map((field) => (
              <Field key={field.name} label={field.label}>
                {(control) => (
                  <Input
                    autoComplete="off"
                    maxLength={field.max}
                    value={details[field.name] ?? ''}
                    onChange={(event) =>
                      setDetails((current) => ({
                        ...current,
                        [field.name]: event.target.value,
                      }))
                    }
                    {...control}
                  />
                )}
              </Field>
            ))}
            <Field label="Deployment date">
              {(control) => (
                <Input
                  type="date"
                  max={today()}
                  value={details.deployment_date ?? ''}
                  onChange={(event) =>
                    setDetails((current) => ({
                      ...current,
                      deployment_date: event.target.value,
                    }))
                  }
                  {...control}
                />
              )}
            </Field>
          </div>
        </fieldset>
      ) : null}
    </FormDialog>
  );
}

const LINK_KIND_OPTIONS = [
  {
    value: 'PERIPHERAL_OF',
    label: 'A peripheral (keyboard, mouse, monitor or UPS)',
  },
  { value: 'SHARED_PRINTER_FOR', label: 'A shared printer' },
];

/** The kind of link an asset of this class takes part in as the peripheral or printer; null for a computer or anything else. */
export function linkKindOf(asset: Asset): RelationshipKind | null {
  return (
    (Object.keys(RELATIONSHIP_FROM) as RelationshipKind[]).find((kind) =>
      RELATIONSHIP_FROM[kind].includes(asset.item.asset_class),
    ) ?? null
  );
}

/**
 * Links a peripheral or a shared printer to a computer. A link is information only:
 * linked assets are still assigned and moved one by one. From a peripheral's page the
 * computer is chosen; from a computer's page, the peripheral or printer.
 */
export function LinkDialog({ asset, onClose }: DialogProps) {
  const { link } = useAssetActions(asset.id);
  const isComputer = asset.item.asset_class === 'COMPUTER';
  const [kind, setKind] = useState<RelationshipKind>(
    linkKindOf(asset) ?? 'PERIPHERAL_OF',
  );
  const [other, setOther] = useState<PickerOption | null>(null);
  const [missing, setMissing] = useState(false);
  const outcome = useOutcome();
  // From a computer, printers can be asked for by class; peripherals are four classes, so the backend checks the choice.
  const wantedClass = isComputer
    ? kind === 'SHARED_PRINTER_FOR'
      ? 'PRINTER'
      : ''
    : 'COMPUTER';

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={
        isComputer ? 'Link equipment to this computer' : 'Link to a computer'
      }
      description={`${describe(asset)}. A link only records what goes together: each asset is still assigned and moved on its own.`}
      onSubmit={(event) => {
        event.preventDefault();
        setMissing(!other);
        outcome.begin();
        if (!other) {
          return;
        }
        // The peripheral or printer is always the first of the two; the computer the second.
        link.mutate(
          isComputer
            ? { asset_id: other.value, related_asset_id: asset.id, kind }
            : { asset_id: asset.id, related_asset_id: other.value, kind },
          {
            onSuccess: (response) => {
              toast.success(response.message);
              onClose();
            },
            onError: outcome.fail,
          },
        );
      }}
      submitLabel="Link"
      submittingLabel="Linking…"
      isSubmitting={link.isPending}
      error={outcome.general}
    >
      {outcome.uncertain ? <Uncertain what="the link" /> : null}
      {isComputer ? (
        <Field label="What to link" required>
          {(control) => (
            <SelectField
              {...control}
              value={kind}
              onChange={(value) => {
                setKind(
                  value === 'SHARED_PRINTER_FOR'
                    ? 'SHARED_PRINTER_FOR'
                    : 'PERIPHERAL_OF',
                );
                setOther(null);
              }}
              options={LINK_KIND_OPTIONS}
            />
          )}
        </Field>
      ) : null}
      <Field
        label={isComputer ? 'Asset' : 'Computer'}
        required
        description={`An asset of ${asset.region.name}.`}
        error={missing ? 'Choose the asset to link.' : undefined}
      >
        {(control) => (
          <EntityPicker
            {...control}
            placeholder={isComputer ? 'Choose an asset' : 'Choose a computer'}
            searchPlaceholder="Search by tag, serial number or item"
            queryKey={assetKeys.assetPicker(asset.region.id, wantedClass)}
            search={(term, signal) =>
              searchAssets(asset.region.id, wantedClass, term, signal)
            }
            value={other}
            onChange={(option) => {
              setOther(option);
              setMissing(false);
            }}
          />
        )}
      </Field>
    </FormDialog>
  );
}

/** Ends a link, after asking. The two assets are otherwise untouched. */
export function UnlinkDialog({
  asset,
  relationship,
  onClose,
}: DialogProps & { relationship: Relationship }) {
  const { unlink } = useAssetActions(asset.id);
  const other =
    relationship.asset.id === asset.id
      ? relationship.related_asset
      : relationship.asset;
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="End this link?"
      description={`${asset.asset_tag} and ${other.asset_tag} (${other.item}) will no longer be shown as going together. Neither asset is moved or changed.`}
      confirmLabel="End the link"
      isSubmitting={unlink.isPending}
      error={unlink.error ? refusal(unlink.error).message : null}
      onConfirm={() =>
        unlink.mutate(relationship.id, {
          onSuccess: (response) => {
            toast.success(response.message);
            onClose();
          },
        })
      }
    />
  );
}
