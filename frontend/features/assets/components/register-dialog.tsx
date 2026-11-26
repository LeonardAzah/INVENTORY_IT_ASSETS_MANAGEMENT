'use client';

import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import { SwitchField } from '@/components/shared/switch-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import type { Ref } from '@/features/auth/types';
import { useItem } from '@/features/catalogue/api';
import { isUncertainOutcome } from '@/features/inventory/document-errors';
import { isApiError } from '@/lib/api/errors';
import { today } from '@/lib/format/date';

import {
  useRegisterAsset,
  useRegisterBulk,
  type RegisterInput,
  type UnitInput,
} from '../api';
import { COMPUTER_TEXT_FIELDS, type Asset } from '../types';
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

const SERIAL_MAX = 100;
const BULK_MAX = 500;

export type RegisterSource = {
  kind: 'RECEIPT' | 'ALTERNATIVE_ACQUISITION';
  id: string;
  reference: string;
  item: Ref;
  region: Ref;
  remaining: number;
};

const sourceId = (source: RegisterSource) =>
  source.kind === 'RECEIPT'
    ? { receipt_line_id: source.id }
    : { acquisition_id: source.id };

const UNCERTAIN =
  'The server did not answer, so the registration may or may not have gone through. Try again: it is safe, because the same request is never registered twice. If it already went through, you will get the same result.';

function messageOf(error: unknown): string {
  return isApiError(error)
    ? error.message
    : 'Something went wrong. Please try again.';
}

const normalizeSerial = (serial: string) =>
  serial.replace(/\s+/g, '').toUpperCase();

type DialogProps = { source: RegisterSource; onClose: () => void };

export function RegisterDialog({ source, onClose }: DialogProps) {
  const register = useRegisterAsset();
  const item = useItem(source.item.id);
  const isComputer = item.data?.asset_class === 'COMPUTER';
  const [serial, setSerial] = useState('');
  const [lot, setLot] = useState('');
  const [details, setDetails] = useState<Record<string, string>>({});
  const [inUse, setInUse] = useState(false);
  const [placement, setPlacement] = useState<PlacementState>(EMPTY_PLACEMENT);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [crossItem, setCrossItem] = useState<string | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [done, setDone] = useState<Asset[]>([]);
  const [next, setNext] = useState(true);

  const left = source.remaining - done.length;
  const last = done[done.length - 1];
  const showingResult = Boolean(last) && !next;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (showingResult) {
      if (left > 0) {
        setNext(true);
      } else {
        onClose();
      }
      return;
    }
    const problems: Record<string, string> = {};
    if (serial.trim().length > SERIAL_MAX) {
      problems.serial = `Use at most ${SERIAL_MAX} characters.`;
    }
    if (inUse) {
      Object.assign(problems, checkPlacement(placement));
    }
    if (crossItem && confirmReason.trim() === '') {
      problems.confirm = 'Say why this is a different device.';
    }
    setErrors(problems);
    setGeneral(null);
    setUncertain(false);
    if (Object.keys(problems).length > 0) {
      return;
    }

    const input: RegisterInput = {
      ...sourceId(source),
      client_request_id: requestId,
    };
    if (serial.trim()) {
      input.serial_number = serial.trim();
    }
    if (lot.trim()) {
      input.lot_number = lot.trim();
    }
    if (isComputer) {
      const filled = Object.fromEntries(
        Object.entries(details)
          .filter(([, value]) => value.trim() !== '')
          .map(([key, value]) => [key, value.trim()]),
      );
      if (Object.keys(filled).length > 0) {
        input.computer_details = filled;
      }
    }
    if (inUse) {
      input.deployed = toPlacement(placement);
    }
    if (crossItem) {
      input.confirm_cross_item_serial = confirmReason.trim();
    }

    register.mutate(input, {
      onSuccess: (response) => {
        toast.success(response.message);
        setDone((current) => [...current, response.data]);
        setNext(false);
        setSerial('');
        setCrossItem(null);
        setConfirmReason('');
        setInUse(false);
        setPlacement(EMPTY_PLACEMENT);
        setRequestId(crypto.randomUUID());
      },
      onError: (error) => {
        if (isUncertainOutcome(error)) {
          setUncertain(true);
          return;
        }
        const code = isApiError(error) ? error.errorCode : undefined;
        const message = messageOf(error);
        if (code === 'SERIAL_ON_OTHER_ITEM') {
          setCrossItem(message);
        } else if (code === 'DUPLICATE_SERIAL') {
          setErrors({ serial: message });
        } else if (placementError(code, message)) {
          setErrors({ ...placementError(code, message) });
        } else if (
          isApiError(error) &&
          error.kind === 'validation' &&
          typeof error.fieldErrors?.serial_number !== 'undefined'
        ) {
          setErrors({
            serial: [error.fieldErrors.serial_number].flat().join(' '),
          });
        } else {
          setGeneral(message);
        }
      },
    });
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Register a unit of ${source.item.name}`}
      description={`${source.reference} · ${left} of ${source.remaining} still to register in ${source.region.name}. Each unit becomes an asset with its own tag.`}
      onSubmit={submit}
      submitLabel={
        showingResult
          ? left > 0
            ? 'Register the next unit'
            : 'Done'
          : crossItem
            ? 'Register anyway'
            : 'Register the unit'
      }
      submittingLabel="Registering…"
      isSubmitting={register.isPending}
      error={general}
    >
      {showingResult && last ? (
        <Alert variant="default">
          <CircleCheck aria-hidden />
          <AlertTitle>Registered as {last.asset_tag}</AlertTitle>
          <AlertDescription>
            Write this tag on the unit
            {last.serial_number
              ? ` with serial number ${last.serial_number}`
              : ''}
            .{' '}
            {left > 0
              ? `${left} still to register from ${source.reference}.`
              : `Every unit of ${source.reference} is now registered.`}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {uncertain ? (
            <Alert variant="default">
              <TriangleAlert aria-hidden />
              <AlertTitle>
                We could not confirm that the unit was registered
              </AlertTitle>
              <AlertDescription>{UNCERTAIN}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Serial number"
              description="As printed on the unit. Leave empty if it has none."
              error={errors.serial}
            >
              {(control) => (
                <Input
                  autoComplete="off"
                  autoCapitalize="characters"
                  maxLength={SERIAL_MAX}
                  value={serial}
                  onChange={(event) => {
                    setSerial(event.target.value);
                    setErrors((current) => ({ ...current, serial: '' }));
                    setCrossItem(null);
                  }}
                  {...control}
                />
              )}
            </Field>
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
          </div>
          {crossItem ? (
            <>
              <Alert variant="default">
                <TriangleAlert aria-hidden />
                <AlertTitle>
                  This serial number is already registered under another item
                </AlertTitle>
                <AlertDescription>
                  {crossItem.replace(/ Send confirm_cross_item_serial.*$/, '')}{' '}
                  If this really is a different device, say why.
                </AlertDescription>
              </Alert>
              <Field
                label="Why this is a different device"
                required
                error={errors.confirm}
              >
                {(control) => (
                  <Input
                    autoComplete="off"
                    value={confirmReason}
                    onChange={(event) => {
                      setConfirmReason(event.target.value);
                      setErrors((current) => ({ ...current, confirm: '' }));
                    }}
                    {...control}
                  />
                )}
              </Field>
            </>
          ) : null}
          {isComputer ? (
            <fieldset className="flex flex-col gap-4 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">
                Computer details (optional)
              </legend>
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
          <SwitchField
            label="Already in use"
            description="Turn on if someone already has this unit. Otherwise it is registered as available in the IT warehouse."
            checked={inUse}
            onChange={setInUse}
          />
          {inUse ? (
            <PlacementFields
              region={source.region}
              value={placement}
              onChange={setPlacement}
              errors={errors}
              onClearError={(field) =>
                setErrors((current) => ({ ...current, [field]: '' }))
              }
            />
          ) : null}
        </>
      )}
    </FormDialog>
  );
}

/**
 * Registers several units of one receipt line in one go, all into the IT warehouse.
 * Either every unit is registered or none is.
 */
export function BulkRegisterDialog({ source, onClose }: DialogProps) {
  const register = useRegisterBulk();
  const [requestId] = useState(() => crypto.randomUUID());
  const most = Math.min(source.remaining, BULK_MAX);
  const [count, setCount] = useState(String(most));
  const [serials, setSerials] = useState('');
  const [lot, setLot] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: Record<string, string> = {};
    const units = /^\d+$/.test(count.trim()) ? Number(count.trim()) : 0;
    if (units < 1 || units > most) {
      problems.count =
        most === 1
          ? 'Only 1 unit is left.'
          : `Enter a whole number from 1 to ${most}.`;
    }
    const typed = serials
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (typed.length > 0) {
      const seen = new Set<string>();
      const repeated = typed.find((serial) => {
        const key = normalizeSerial(serial);
        if (seen.has(key)) {
          return true;
        }
        seen.add(key);
        return false;
      });
      if (repeated) {
        problems.serials = `${repeated} is listed twice.`;
      } else if (typed.some((serial) => serial.length > SERIAL_MAX)) {
        problems.serials = `A serial number has at most ${SERIAL_MAX} characters.`;
      } else if (!problems.count && typed.length !== units) {
        problems.serials = `You listed ${typed.length} serial ${typed.length === 1 ? 'number' : 'numbers'} for ${units} ${units === 1 ? 'unit' : 'units'}. Give one for each unit, or none at all.`;
      }
    }
    setErrors(problems);
    setGeneral(null);
    setUncertain(false);
    if (Object.keys(problems).length > 0) {
      return;
    }
    const shared: UnitInput = lot.trim() ? { lot_number: lot.trim() } : {};
    const payload =
      typed.length > 0
        ? typed.map((serial_number) => ({ ...shared, serial_number }))
        : Array.from({ length: units }, () => ({ ...shared }));
    register.mutate(
      {
        receipt_line_id: source.id,
        units: payload,
        client_request_id: requestId,
      },
      {
        onSuccess: (response) => {
          const tags = response.data.map((asset) => asset.asset_tag);
          toast.success(
            tags.length > 1
              ? `${response.message} Tags ${tags[0]} to ${tags[tags.length - 1]}.`
              : `${response.message} Tag ${tags[0] ?? ''}.`,
            {
              duration: 10_000,
            },
          );
          onClose();
        },
        onError: (error) => {
          if (isUncertainOutcome(error)) {
            setUncertain(true);
            return;
          }
          const code = isApiError(error) ? error.errorCode : undefined;
          setGeneral(
            code === 'SERIAL_ON_OTHER_ITEM'
              ? `${messageOf(error).replace(/ Send confirm_cross_item_serial.*$/, '')} Nothing was registered. Register that unit on its own, where you can confirm it, and leave it out of this list.`
              : code === 'DUPLICATE_SERIAL' ||
                  code === 'NOTHING_LEFT_TO_REGISTER'
                ? `${messageOf(error)} Nothing was registered.`
                : messageOf(error),
          );
        },
      },
    );
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Register several units of ${source.item.name}`}
      description={`${source.reference} · ${source.remaining} still to register in ${source.region.name}. All are registered as available in the IT warehouse, or none is.`}
      onSubmit={submit}
      submitLabel="Register the units"
      submittingLabel="Registering…"
      isSubmitting={register.isPending}
      error={general}
    >
      {uncertain ? (
        <Alert variant="default">
          <TriangleAlert aria-hidden />
          <AlertTitle>
            We could not confirm that the units were registered
          </AlertTitle>
          <AlertDescription>{UNCERTAIN}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Number of units"
          required
          error={errors.count}
          description={
            most < source.remaining
              ? `At most ${BULK_MAX} at a time.`
              : undefined
          }
        >
          {(control) => (
            <Input
              inputMode="numeric"
              autoComplete="off"
              className="tabular-nums"
              value={count}
              onChange={(event) => {
                setCount(event.target.value);
                setErrors((current) => ({ ...current, count: '' }));
              }}
              {...control}
            />
          )}
        </Field>
        <Field label="Lot number" description="The same for every unit.">
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
      </div>
      <Field
        label="Serial numbers"
        description="One per line, one for each unit. Leave empty for units without serial numbers. Computer details are added on each asset afterwards."
        error={errors.serials}
      >
        {(control) => (
          <textarea
            rows={5}
            className={`${TEXTAREA} font-mono`}
            autoCapitalize="characters"
            spellCheck={false}
            value={serials}
            onChange={(event) => {
              setSerials(event.target.value);
              setErrors((current) => ({ ...current, serials: '' }));
            }}
            {...control}
          />
        )}
      </Field>
    </FormDialog>
  );
}
