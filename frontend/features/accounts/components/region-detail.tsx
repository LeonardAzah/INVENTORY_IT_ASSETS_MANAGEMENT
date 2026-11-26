'use client';

import { ArrowLeft, ShieldCheck, TriangleAlert } from 'lucide-react';
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
import { useCurrentUser } from '@/features/auth/session';
import type { Region } from '@/features/organization/types';
import { isApiError } from '@/lib/api/errors';
import { can, isAdministrator } from '@/lib/permissions/codes';

import { useItStaff, useRegion, useRevokeResponsibility } from '../api';
import type { ItStaff, PersonRef } from '../types';
import { AppointDialog } from './appoint-dialog';
import { AccountLink } from './shared';

const BACK_LINK =
  'inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

const VACANCY_LABELS: Record<string, string> = {
  CHIEF_OF_SERVICE_OF_COMPUTING: 'No Chief of Service of Computing',
  IT_ASSET_MANAGER: 'No IT Asset Manager',
  IT_WAREHOUSE: 'No IT warehouse',
};

function BackLink() {
  return (
    <Link href="/organization/regions" className={BACK_LINK}>
      <ArrowLeft className="size-4" aria-hidden />
      Regions
    </Link>
  );
}

export function RegionDetail({ id }: { id: string }) {
  const { data: region, error, isLoading, isFetching, refetch } = useRegion(id);

  if (isLoading) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="Loading region"
      >
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!region) {
    const missing = isApiError(error) && error.kind === 'not_found';
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <div className="bg-card rounded-lg border">
          {missing ? (
            <EmptyState
              title="Region not found"
              description="This region does not exist."
            />
          ) : (
            <ErrorState
              title="The region could not be loaded"
              error={error}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          )}
        </div>
      </div>
    );
  }
  return <Loaded region={region} />;
}

function Loaded({ region }: { region: Region }) {
  const me = useCurrentUser();
  const seesStaff = isAdministrator(me) || me.it_regions.includes(region.id);

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        title={region.name}
        description={`Region ${region.code}`}
        actions={<ActiveBadge active={region.is_active} />}
      />
      {seesStaff ? (
        <StaffCard region={region} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>IT staff</CardTitle>
            <CardDescription>
              Who runs IT in a region is shown to administrators and to that
              region&apos;s own IT staff.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

function Post({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm text-neutral-600">{title}</p>
        <div className="font-medium wrap-break-word">{children}</div>
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
      ) : null}
    </li>
  );
}

function Person({
  person,
  linked,
}: {
  person: PersonRef | null;
  linked: boolean;
}) {
  if (!person) {
    return <span className="font-normal text-neutral-600">Vacant</span>;
  }
  return (
    <>
      <AccountLink id={person.account_id} name={person.name} linked={linked} />
      <span className="font-normal text-neutral-600"> · {person.email}</span>
    </>
  );
}

function StaffCard({ region }: { region: Region }) {
  const me = useCurrentUser();
  const {
    data: staff,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useItStaff(region.id, true);
  const [dialog, setDialog] = useState<'appoint' | 'end' | null>(null);
  const linked = can(me, 'USER_MANAGE');

  return (
    <Card>
      <CardHeader>
        <CardTitle>IT staff</CardTitle>
        <CardDescription>
          The Chief of Service of Computing and the IT Asset Manager handle the
          region&apos;s IT stock and assets. A region has one of each, and one
          IT warehouse. The Regional Representative appoints the Store Keeper of
          the regional store.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : !staff ? (
          <ErrorState
            title="The IT staff could not be loaded"
            error={error}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : (
          <>
            {staff.vacancies.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label="Vacancies">
                {staff.vacancies.map((vacancy) => (
                  <li key={vacancy}>
                    <Badge variant="outline">
                      <TriangleAlert aria-hidden />
                      {VACANCY_LABELS[vacancy] ?? vacancy}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            <ul className="flex flex-col divide-y">
              <Post title="Chief of Service of Computing">
                <Person person={staff.computing_chief} linked={linked} />
              </Post>
              <Post
                title="IT Asset Manager"
                action={
                  region.is_active ? (
                    <Can anyOf={['IT_ASSET_MANAGER_APPOINT']}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDialog('appoint')}
                      >
                        <ShieldCheck aria-hidden />
                        {staff.it_asset_manager ? 'Replace' : 'Appoint'}
                      </Button>
                      {staff.it_asset_manager ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDialog('end')}
                        >
                          End appointment
                        </Button>
                      ) : null}
                    </Can>
                  ) : null
                }
              >
                <Person person={staff.it_asset_manager} linked={linked} />
              </Post>
              <Post title="Regional Representative">
                <Person
                  person={staff.regional_representative}
                  linked={linked}
                />
              </Post>
              <Post title="IT warehouse">
                {staff.it_warehouse ? (
                  `${staff.it_warehouse.name} (${staff.it_warehouse.code})`
                ) : (
                  <span className="font-normal text-neutral-600">None</span>
                )}
              </Post>
            </ul>
          </>
        )}
      </CardContent>
      {staff && dialog === 'appoint' ? (
        <AppointDialog
          region={region}
          current={staff.it_asset_manager}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {staff?.it_asset_manager && dialog === 'end' ? (
        <EndAppointmentDialog
          region={region}
          manager={staff.it_asset_manager}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </Card>
  );
}

function EndAppointmentDialog({
  region,
  manager,
  onClose,
}: {
  region: Region;
  manager: NonNullable<ItStaff['it_asset_manager']>;
  onClose: () => void;
}) {
  const revoke = useRevokeResponsibility(manager.account_id);
  return (
    <ReasonDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`End ${manager.name}'s appointment`}
      description={`${region.name} will have no IT Asset Manager until another is appointed. The Chief of Service of Computing can still do everything the post allows.`}
      confirmLabel="End appointment"
      isSubmitting={revoke.isPending}
      error={revoke.error ? errorMessage(revoke.error) : null}
      onConfirm={(reason) =>
        revoke.mutate(
          { code: 'IT_ASSET_MANAGER', reason },
          {
            onSuccess: (response) => {
              toast.success(response.message);
              onClose();
            },
          },
        )
      }
    />
  );
}
