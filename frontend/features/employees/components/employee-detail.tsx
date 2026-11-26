'use client';

import { ArrowLeft, Pencil, UserCheck, UserX } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { Can } from '@/components/shared/can';
import { PageHeader } from '@/components/shared/page-header';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import {
  ActiveBadge,
  EmptyState,
  ErrorState,
  errorMessage,
} from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROW_LINK } from '@/features/accounts/components/shared';
import { statusLabel } from '@/features/assets/types';
import { useCurrentUser } from '@/features/auth/session';
import { refLabel } from '@/features/organization/types';
import { isApiError } from '@/lib/api/errors';
import { EMPTY, formatDateTime } from '@/lib/format/date';
import { can } from '@/lib/permissions/codes';

import { useEmployee, useEmployeeAssets, useSetEmployeeActive } from '../api';
import { fullName, type Employee, type HeldAsset } from '../types';
import { EmployeeDialog } from './employee-dialog';
import { MANAGE } from './employees-page';

const BACK_LINK =
  'inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

function BackLink() {
  return (
    <Link href="/employees" className={BACK_LINK}>
      <ArrowLeft className="size-4" aria-hidden />
      Employees
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

export function EmployeeDetail({ id }: { id: string }) {
  const {
    data: employee,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useEmployee(id);

  if (isLoading) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="Loading employee"
      >
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!employee) {
    // Out of scope and non-existent look the same: the backend answers 404 for both.
    const missing = isApiError(error) && error.kind === 'not_found';
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <div className="bg-card rounded-lg border">
          {missing ? (
            <EmptyState
              title="Employee not found"
              description="This employee does not exist, or is outside what you can see."
            />
          ) : (
            <ErrorState
              title="The employee could not be loaded"
              error={error}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          )}
        </div>
      </div>
    );
  }
  return <Loaded employee={employee} />;
}

function Loaded({ employee }: { employee: Employee }) {
  const user = useCurrentUser();
  const [editing, setEditing] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const seesAssets =
    can(user, 'IT_ASSET_VIEW') &&
    (can(user, 'EMPLOYEE_MANAGE') || user.it_regions.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        title={fullName(employee)}
        description={`Matricule ${employee.matricule}`}
        actions={
          <Can anyOf={MANAGE}>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setChangingStatus(true)}>
              {employee.is_active ? (
                <UserX aria-hidden />
              ) : (
                <UserCheck aria-hidden />
              )}
              {employee.is_active ? 'Deactivate' : 'Reactivate'}
            </Button>
          </Can>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Details
            <ActiveBadge active={employee.is_active} />
          </CardTitle>
          <CardDescription>
            This is the employee record. Whether the person can sign in is a
            separate matter, managed under Users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail term="First name">{employee.first_name}</Detail>
            <Detail term="Last name">{employee.last_name}</Detail>
            <Detail term="Matricule">{employee.matricule}</Detail>
            <Detail term="Email address">{employee.email ?? EMPTY}</Detail>
            <Detail term="Telephone">{employee.telephone}</Detail>
            <Detail term="Work location">
              {employee.work_location?.name ?? EMPTY}
            </Detail>
            <Detail term="Department">{refLabel(employee.department)}</Detail>
            <Detail term="Office">{refLabel(employee.office)}</Detail>
            <Detail term="Region">{refLabel(employee.region)}</Detail>
          </dl>
        </CardContent>
      </Card>

      {seesAssets ? <HeldAssets employee={employee} /> : null}

      {editing ? (
        <EmployeeDialog employee={employee} onClose={() => setEditing(false)} />
      ) : null}
      {changingStatus ? (
        <StatusDialog
          employee={employee}
          onClose={() => setChangingStatus(false)}
        />
      ) : null}
    </div>
  );
}

function HeldAssets({ employee }: { employee: Employee }) {
  const {
    data: assets,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useEmployeeAssets(employee.id, true);
  return (
    <Card>
      <CardHeader>
        <CardTitle>IT equipment held</CardTitle>
        <CardDescription>
          What is assigned to this employee now.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !assets ? (
          <ErrorState
            title="The equipment could not be loaded"
            error={error}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : assets.length === 0 ? (
          <p className="text-sm text-neutral-600">None.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {assets.map((held) => (
              <li
                key={held.assignment_id}
                className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="font-medium wrap-break-word">
                    {held.asset.item}{' '}
                    <Link
                      href={`/it/assets/${held.asset.id}`}
                      className={`${ROW_LINK} font-normal`}
                    >
                      {held.asset.asset_tag}
                    </Link>
                  </p>
                  <p className="text-sm text-neutral-600">
                    {held.location.name} · since{' '}
                    {formatDateTime(held.assigned_at)}
                  </p>
                </div>
                <Badge variant="outline" className="self-start sm:self-auto">
                  {statusLabel(held.asset.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function isHeldAssets(value: unknown): value is HeldAsset[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'asset_tag' in entry &&
        'item' in entry,
    )
  );
}

function StatusDialog({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) {
  const change = useSetEmployeeActive(employee.id);
  const activating = !employee.is_active;
  const held =
    isApiError(change.error) &&
    change.error.errorCode === 'EMPLOYEE_HAS_ASSETS' &&
    isHeldAssets(change.error.context?.assets)
      ? change.error.context.assets
      : [];

  return (
    <ReasonDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={
        activating
          ? `Reactivate ${fullName(employee)}`
          : `Deactivate ${fullName(employee)}`
      }
      description={
        activating
          ? 'The employee can again receive stock and equipment.'
          : 'The employee can no longer receive stock or equipment. Past records are kept, and a user account they may have is not changed.'
      }
      confirmLabel={activating ? 'Reactivate' : 'Deactivate'}
      isSubmitting={change.isPending}
      error={change.error ? errorMessage(change.error) : null}
      onConfirm={(reason) =>
        change.mutate(
          { active: activating, reason },
          {
            onSuccess: (response) => {
              toast.success(response.message);
              onClose();
            },
          },
        )
      }
    >
      {held.length > 0 ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Each of these must first be returned, reassigned or declared lost:
          </p>
          <ul className="list-disc pl-5">
            {held.map((asset) => (
              <li key={asset.id}>
                {asset.item} · {asset.asset_tag}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </ReasonDialog>
  );
}
