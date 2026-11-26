'use client';

import { CircleAlert, Info, LoaderCircle, Send } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { DataTable, type Column } from '@/components/shared/data-table';
import {
  DateFilter,
  FilterBar,
  FilterSlot,
  Pagination,
  SearchInput,
} from '@/components/shared/list-controls';
import { PageHeader } from '@/components/shared/page-header';
import { SelectField } from '@/components/shared/select-field';
import { EmptyState, errorMessage } from '@/components/shared/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDateTime, today } from '@/lib/format/date';
import { useSubmitLock } from '@/lib/forms/submit-lock';
import { useListParams } from '@/lib/url/list-params';

import {
  canRetry,
  EMAIL_KIND_LABELS,
  EMAIL_KIND_OPTIONS,
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_OPTIONS,
  useEmailLog,
  useRetryEmail,
  type EmailRecord,
  type EmailStatus,
} from '../api';

const FILTERS = ['kind', 'status', 'created_at_from', 'created_at_to'] as const;

const STATUS_VARIANT: Record<
  EmailStatus,
  'default' | 'outline' | 'destructive'
> = {
  SENT: 'default',
  QUEUED: 'outline',
  FAILED: 'destructive',
};

/** Whether an email went out, in words as well as colour. */
function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'warning'}>
      {EMAIL_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const COLUMNS: Column<EmailRecord>[] = [
  {
    id: 'created',
    header: 'Created',
    sortField: 'created_at',
    className: 'whitespace-nowrap',
    cell: (email) => formatDateTime(email.created_at),
  },
  {
    id: 'subject',
    header: 'Email',
    primary: true,
    cell: (email) => (
      <span className="flex flex-col">
        <span className="wrap-break-word">{email.subject}</span>
        <span className="text-xs font-normal text-neutral-600">
          {EMAIL_KIND_LABELS[email.kind] ?? email.kind}
        </span>
      </span>
    ),
  },
  {
    id: 'to',
    header: 'To',
    className: 'wrap-anywhere',
    cell: (email) => email.recipient_email,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (email) => <EmailStatusBadge status={email.status} />,
  },
  {
    id: 'attempts',
    header: 'Attempts',
    className: 'text-right tabular-nums',
    cell: (email) => email.attempts,
  },
  {
    id: 'sent',
    header: 'Sent',
    className: 'whitespace-nowrap',
    cell: (email) => formatDateTime(email.sent_at),
  },
];

export function EmailLogPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useEmailLog(
    list.query,
  );
  const filters = list.state.filters;
  const [openId, setOpenId] = useState<string | null>(null);
  const open = data?.results.find((email) => email.id === openId) ?? null;
  const latest = today();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Email log"
        description="Every email the system sent or tried to send, newest first. One-time links, such as invitations, are never kept: their place in the text is marked."
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search the email log"
            placeholder="Search by recipient"
            value={list.state.search}
            onChange={(search) => list.update({ search })}
          />
        }
      >
        <FilterSlot>
          <SelectField
            aria-label="Status"
            noneLabel="Any status"
            value={filters.status}
            onChange={(status) => list.update({ filters: { status } })}
            options={EMAIL_STATUS_OPTIONS}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Kind"
            noneLabel="Any kind"
            value={filters.kind}
            onChange={(kind) => list.update({ filters: { kind } })}
            options={EMAIL_KIND_OPTIONS}
          />
        </FilterSlot>
        <DateFilter
          label="Created from"
          value={filters.created_at_from}
          max={filters.created_at_to || latest}
          onChange={(created_at_from) =>
            list.update({ filters: { created_at_from } })
          }
        />
        <DateFilter
          label="Created to"
          value={filters.created_at_to}
          min={filters.created_at_from || undefined}
          max={latest}
          onChange={(created_at_to) =>
            list.update({ filters: { created_at_to } })
          }
        />
      </FilterBar>
      <DataTable
        caption="Email log"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(email) => email.id}
        actions={(email) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpenId(email.id)}
            aria-label={`Open “${email.subject}” to ${email.recipient_email}`}
          >
            Open
          </Button>
        )}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No emails match"
              description="Try a different search, status or period."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No emails yet"
              description="The system has not tried to send anything."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="emails"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {open ? (
        <EmailDialog email={open} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  );
}

/** One email as it was stored, and, when it did not go out, a way to send it again. */
function EmailDialog({
  email,
  onClose,
}: {
  email: EmailRecord;
  onClose: () => void;
}) {
  const retry = useRetryEmail();
  const once = useSubmitLock(retry.isPending);
  const pending = email.status !== 'SENT';

  return (
    <Dialog
      open
      onOpenChange={(next) => (next || retry.isPending ? undefined : onClose())}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="wrap-break-word">{email.subject}</DialogTitle>
          <DialogDescription className="wrap-anywhere">
            {EMAIL_KIND_LABELS[email.kind] ?? email.kind} · to{' '}
            {email.recipient_email} · created {formatDateTime(email.created_at)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <EmailStatusBadge status={email.status} />
          <span className="text-neutral-600">
            {email.status === 'SENT'
              ? `Sent ${formatDateTime(email.sent_at)}`
              : `${email.attempts} ${email.attempts === 1 ? 'attempt' : 'attempts'} so far`}
          </span>
        </div>
        {retry.error ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertTitle>Not sent again</AlertTitle>
            <AlertDescription>{errorMessage(retry.error)}</AlertDescription>
          </Alert>
        ) : null}
        {pending && email.last_error ? (
          <Alert variant="default">
            <CircleAlert aria-hidden />
            <AlertTitle>Why it did not go out</AlertTitle>
            <AlertDescription className="wrap-anywhere">
              {email.last_error}
            </AlertDescription>
          </Alert>
        ) : null}
        {pending && email.redacted ? (
          <Alert variant="default">
            <Info aria-hidden />
            <AlertTitle>This email cannot be sent again from here</AlertTitle>
            <AlertDescription>
              It held a one-time link, which is never stored. Issue a new one
              instead: for an invitation, send a new invitation from the
              person&apos;s account; for a password reset, ask them to request
              one again.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-1">
          <p className="text-sm text-neutral-600">
            Text{email.redacted ? ' (the one-time link is left out)' : ''}
          </p>
          <pre
            tabIndex={0}
            aria-label="Text of the email"
            className="focus-visible:ring-ring max-h-72 overflow-auto rounded-lg border bg-neutral-50 p-3 font-sans text-sm wrap-anywhere whitespace-pre-wrap focus-visible:ring-2 focus-visible:outline-none"
          >
            {email.body_text}
          </pre>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={retry.isPending}
            onClick={onClose}
          >
            Close
          </Button>
          {canRetry(email) ? (
            <Button
              disabled={retry.isPending}
              onClick={once(() =>
                retry.mutate(email.id, {
                  onSuccess: (response) => {
                    toast.success(response.message);
                    onClose();
                  },
                }),
              )}
            >
              {retry.isPending ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : (
                <Send aria-hidden />
              )}
              {retry.isPending ? 'Sending…' : 'Send again'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
