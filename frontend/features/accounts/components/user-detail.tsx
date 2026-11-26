'use client';

import {
  ArrowLeft,
  MailPlus,
  MailX,
  PackageCheck,
  Plus,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { Can } from '@/components/shared/can';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import {
  EmptyState,
  ErrorState,
  errorMessage,
} from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/session';
import {
  RESPONSIBILITY_LABELS,
  roleLabel,
  type Jurisdiction,
  type Responsibility,
} from '@/features/auth/types';
import { isApiError } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format/date';

import {
  useAccount,
  useEndJurisdiction,
  useGrantStoreKeeper,
  useResendInvitation,
  useRevokeInvitation,
  useRevokeResponsibility,
  useSetAccountActive,
} from '../api';
import { accountName, jurisdictionLabel, type AccountDetail } from '../types';
import { JurisdictionDialog, RoleDialog } from './account-dialogs';
import { AppointDialog } from './appoint-dialog';
import { AccountStatusBadge, ROW_LINK } from './shared';

const BACK_LINK =
  'inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

function BackLink() {
  return (
    <Link href="/users" className={BACK_LINK}>
      <ArrowLeft className="size-4" aria-hidden />
      Users
    </Link>
  );
}

function Detail({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm text-neutral-600">{term}</dt>
      <dd className="text-sm wrap-break-word">{children}</dd>
    </div>
  );
}

function HeldRow({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="font-medium wrap-break-word">{title}</p>
        <p className="text-sm text-neutral-600">{detail}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}

export function UserDetail({ id }: { id: string }) {
  const {
    data: account,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useAccount(id);

  if (isLoading) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="Loading user"
      >
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!account) {
    const missing = isApiError(error) && error.kind === 'not_found';
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <div className="bg-card rounded-lg border">
          {missing ? (
            <EmptyState
              title="User not found"
              description="This account does not exist, or is outside what you can manage."
            />
          ) : (
            <ErrorState
              title="The user could not be loaded"
              error={error}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          )}
        </div>
      </div>
    );
  }
  return <Loaded account={account} />;
}

type OpenDialog =
  | {
      kind:
        | 'role'
        | 'status'
        | 'resend'
        | 'revoke-invitation'
        | 'grant'
        | 'appoint'
        | 'grant-store-keeper';
    }
  | { kind: 'end-jurisdiction'; jurisdiction: Jurisdiction }
  | { kind: 'end-responsibility'; responsibility: Responsibility }
  | null;

function Loaded({ account }: { account: AccountDetail }) {
  const me = useCurrentUser();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const close = () => setDialog(null);
  const name = accountName(account);
  const isSelf = account.id === me.id;
  const deactivated = account.status === 'DEACTIVATED';
  const holdsItPost = account.responsibilities.some(
    (held) => held.code === 'IT_ASSET_MANAGER',
  );
  const keepsStores = account.responsibilities.some(
    (held) => held.code === 'STORE_KEEPER',
  );

  const canBeAppointed =
    !deactivated && !holdsItPost && !account.is_computing_chief;

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        title={name}
        description={account.email}
        actions={
          isSelf ? null : (
            <Can anyOf={['USER_MANAGE']}>
              <Button
                variant="outline"
                onClick={() => setDialog({ kind: 'status' })}
              >
                {deactivated ? (
                  <UserCheck aria-hidden />
                ) : (
                  <UserX aria-hidden />
                )}
                {deactivated ? 'Reactivate' : 'Deactivate'}
              </Button>
            </Can>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Account
            <AccountStatusBadge status={account.status} />
          </CardTitle>
          <CardDescription>
            {isSelf
              ? 'This is your own account. You cannot change your own role or deactivate yourself.'
              : 'Who signs in, and with which role.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail term="Login email">{account.email}</Detail>
            <Detail term="Role">
              {roleLabel({ ...account, is_superuser: false })}
              {account.role_region ? ` · ${account.role_region.name}` : ''}
            </Detail>
            <Detail term="Created">{formatDateTime(account.created_at)}</Detail>
            <Detail term="Employee">
              <Link
                href={`/employees/${account.employee.id}`}
                className={ROW_LINK}
              >
                {name}
              </Link>{' '}
              · {account.employee.matricule}
            </Detail>
            <Detail term="Department">
              {account.employee.department.name}
            </Detail>
            <Detail term="Office and region">
              {account.employee.office.name}, {account.employee.region.name}
            </Detail>
          </dl>
          {isSelf || deactivated ? null : (
            <Can
              anyOf={[
                'ROLE_GRANT',
                'ROLE_GRANT_REGIONAL',
                'ROLE_GRANT_PRIVILEGED',
              ]}
            >
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog({ kind: 'role' })}
                >
                  <UserCog aria-hidden />
                  Change role
                </Button>
              </div>
            </Can>
          )}
        </CardContent>
      </Card>

      {account.status === 'INVITED' ? (
        <Card>
          <CardHeader>
            <CardTitle>Invitation</CardTitle>
            <CardDescription>
              This person has not chosen a password yet, so they cannot sign in.
              The emailed link works once and expires after 72 hours.
            </CardDescription>
          </CardHeader>
          <Can anyOf={['USER_MANAGE']}>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog({ kind: 'resend' })}
              >
                <MailPlus aria-hidden />
                Send a new invitation
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog({ kind: 'revoke-invitation' })}
              >
                <MailX aria-hidden />
                Revoke the invitation
              </Button>
            </CardContent>
          </Can>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Management scope</CardTitle>
          <CardDescription>
            Where this person&apos;s management actions apply. The role alone
            gives no scope, and a scope gives no right to operate a warehouse.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {account.jurisdictions.length === 0 ? (
            <p className="text-sm text-neutral-600">No management scope.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {account.jurisdictions.map((jurisdiction) => (
                <HeldRow
                  key={jurisdiction.id}
                  title={jurisdictionLabel(jurisdiction)}
                  detail={`Since ${formatDateTime(jurisdiction.granted_at)}`}
                  action={
                    <Can anyOf={['JURISDICTION_MANAGE']}>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`End scope: ${jurisdictionLabel(jurisdiction)}`}
                        onClick={() =>
                          setDialog({ kind: 'end-jurisdiction', jurisdiction })
                        }
                      >
                        End
                      </Button>
                    </Can>
                  }
                />
              ))}
            </ul>
          )}
          {deactivated ? null : (
            <Can anyOf={['JURISDICTION_MANAGE']}>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog({ kind: 'grant' })}
                >
                  <Plus aria-hidden />
                  Grant a scope
                </Button>
              </div>
            </Can>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Responsibilities</CardTitle>
          <CardDescription>
            What this person operates. The Store Keeper responsibility is
            granted here; the warehouses they keep are then assigned on each
            warehouse&apos;s page. Stock operations need both.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {account.responsibilities.length === 0 ? (
            <p className="text-sm text-neutral-600">None.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {account.responsibilities.map((responsibility) => (
                <HeldRow
                  key={`${responsibility.code}-${responsibility.region?.id ?? ''}`}
                  title={`${RESPONSIBILITY_LABELS[responsibility.code] ?? responsibility.code}${responsibility.region ? ` · ${responsibility.region.name}` : ''}`}
                  detail={`Since ${formatDateTime(responsibility.granted_at)}`}
                  action={
                    <Can
                      anyOf={[
                        responsibility.code === 'STORE_KEEPER'
                          ? 'STORE_KEEPER_GRANT'
                          : 'IT_ASSET_MANAGER_APPOINT',
                      ]}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`End ${RESPONSIBILITY_LABELS[responsibility.code] ?? responsibility.code}`}
                        onClick={() =>
                          setDialog({
                            kind: 'end-responsibility',
                            responsibility,
                          })
                        }
                      >
                        End
                      </Button>
                    </Can>
                  }
                />
              ))}
            </ul>
          )}
          {!deactivated && !keepsStores ? (
            <Can anyOf={['STORE_KEEPER_GRANT']}>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog({ kind: 'grant-store-keeper' })}
                >
                  <PackageCheck aria-hidden />
                  Make Store Keeper
                </Button>
              </div>
            </Can>
          ) : null}
          {canBeAppointed ? (
            <Can anyOf={['IT_ASSET_MANAGER_APPOINT']}>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog({ kind: 'appoint' })}
                >
                  <ShieldCheck aria-hidden />
                  Appoint as IT Asset Manager
                </Button>
              </div>
            </Can>
          ) : null}
        </CardContent>
      </Card>

      {dialog?.kind === 'role' ? (
        <RoleDialog account={account} onClose={close} />
      ) : null}
      {dialog?.kind === 'grant-store-keeper' ? (
        <GrantStoreKeeperDialog account={account} onClose={close} />
      ) : null}
      {dialog?.kind === 'grant' ? (
        <JurisdictionDialog account={account} onClose={close} />
      ) : null}
      {dialog?.kind === 'appoint' ? (
        <AppointDialog
          region={account.employee.region}
          account={{ id: account.id, name }}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === 'status' ? (
        <StatusDialog account={account} onClose={close} />
      ) : null}
      {dialog?.kind === 'resend' || dialog?.kind === 'revoke-invitation' ? (
        <InvitationDialog
          account={account}
          action={dialog.kind}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === 'end-jurisdiction' ? (
        <EndJurisdictionDialog
          account={account}
          jurisdiction={dialog.jurisdiction}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === 'end-responsibility' ? (
        <EndResponsibilityDialog
          account={account}
          responsibility={dialog.responsibility}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

type DialogProps = { account: AccountDetail; onClose: () => void };

const done = (onClose: () => void) => ({
  onSuccess: (response: { message: string }) => {
    toast.success(response.message);
    onClose();
  },
});

function GrantStoreKeeperDialog({ account, onClose }: DialogProps) {
  const grant = useGrantStoreKeeper(account.id);
  return (
    <ReasonDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Make ${accountName(account)} a Store Keeper`}
      description="Gives the Store Keeper responsibility. It allows no stock operation on its own: assign the person to a warehouse, on that warehouse's page, to put it to use."
      confirmLabel="Grant"
      isSubmitting={grant.isPending}
      error={grant.error ? errorMessage(grant.error) : null}
      onConfirm={(reason) => grant.mutate({ reason }, done(onClose))}
    />
  );
}

function StatusDialog({ account, onClose }: DialogProps) {
  const change = useSetAccountActive(account.id);
  const activating = account.status === 'DEACTIVATED';
  const name = accountName(account);
  return (
    <ReasonDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={activating ? `Reactivate ${name}` : `Deactivate ${name}`}
      description={
        activating
          ? 'The person can sign in again. Their responsibilities and management scope are not restored: grant them again if needed.'
          : 'The person is signed out everywhere and can no longer sign in. Their responsibilities, management scope and warehouse assignments end. History is kept.'
      }
      confirmLabel={activating ? 'Reactivate' : 'Deactivate'}
      isSubmitting={change.isPending}
      error={change.error ? errorMessage(change.error) : null}
      onConfirm={(reason) =>
        change.mutate({ active: activating, reason }, done(onClose))
      }
    />
  );
}

function InvitationDialog({
  account,
  action,
  onClose,
}: DialogProps & { action: 'resend' | 'revoke-invitation' }) {
  const resend = useResendInvitation(account.id);
  const revoke = useRevokeInvitation(account.id);
  const mutation = action === 'resend' ? resend : revoke;
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={
        action === 'resend' ? 'Send a new invitation' : 'Revoke the invitation'
      }
      description={
        action === 'resend'
          ? `A new link is emailed to ${account.email}. The previous link stops working.`
          : `The link sent to ${account.email} stops working. The account stays invited until a new invitation is sent.`
      }
      confirmLabel={
        action === 'resend' ? 'Send invitation' : 'Revoke invitation'
      }
      isSubmitting={mutation.isPending}
      error={mutation.error ? errorMessage(mutation.error) : null}
      onConfirm={() => mutation.mutate(undefined, done(onClose))}
    />
  );
}

function EndJurisdictionDialog({
  account,
  jurisdiction,
  onClose,
}: DialogProps & { jurisdiction: Jurisdiction }) {
  const end = useEndJurisdiction(account.id);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="End this management scope"
      description={`${accountName(account)} will no longer manage ${jurisdictionLabel(jurisdiction)}. The record is kept as history.`}
      confirmLabel="End scope"
      isSubmitting={end.isPending}
      error={end.error ? errorMessage(end.error) : null}
      onConfirm={() => end.mutate(jurisdiction.id, done(onClose))}
    />
  );
}

function EndResponsibilityDialog({
  account,
  responsibility,
  onClose,
}: DialogProps & { responsibility: Responsibility }) {
  const revoke = useRevokeResponsibility(account.id);
  const storeKeeper = responsibility.code === 'STORE_KEEPER';
  const label =
    RESPONSIBILITY_LABELS[responsibility.code] ?? responsibility.code;
  return (
    <ReasonDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`End ${label} for ${accountName(account)}`}
      description={
        storeKeeper
          ? 'Every warehouse this person keeps becomes vacant, and nobody can record stock movements there until a new Store Keeper is assigned.'
          : `${responsibility.region?.name ?? 'The region'} will have no IT Asset Manager until another is appointed.`
      }
      confirmLabel={`End ${label}`}
      isSubmitting={revoke.isPending}
      error={revoke.error ? errorMessage(revoke.error) : null}
      onConfirm={(reason) =>
        revoke.mutate({ code: responsibility.code, reason }, done(onClose))
      }
    />
  );
}
