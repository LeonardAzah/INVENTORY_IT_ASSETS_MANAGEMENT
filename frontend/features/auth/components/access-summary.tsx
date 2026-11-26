'use client';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { can } from '@/lib/permissions/codes';

import { useCurrentUser } from '../session';
import { RESPONSIBILITY_LABELS, roleLabel, type Jurisdiction } from '../types';

function jurisdictionLabel(jurisdiction: Jurisdiction): string {
  if (jurisdiction.department) {
    return `${jurisdiction.department.name} (${jurisdiction.office?.name ?? jurisdiction.region.name})`;
  }
  if (jurisdiction.office) {
    return `${jurisdiction.office.name} (${jurisdiction.region.name})`;
  }
  return `${jurisdiction.region.name} region`;
}

function count(amount: number, singular: string): string {
  return `${amount} ${singular}${amount === 1 ? '' : 's'}`;
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-sm text-neutral-600 sm:w-44">{term}</dt>
      <dd className="min-w-0 text-sm wrap-break-word">{children}</dd>
    </div>
  );
}

/**
 * What the signed-in user holds. It keeps the three things apart that are easy to
 * confuse: the role (which actions), the responsibilities (operating a warehouse or a
 * region's IT), and the management scope (where management actions apply).
 */
export function AccessSummary() {
  const user = useCurrentUser();
  const active = user.jurisdictions.filter(
    (jurisdiction) => jurisdiction.ended_at === null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your access</CardTitle>
        <CardDescription>
          Your role decides which actions you can take. Your responsibilities
          and scope decide where.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-4">
          <Row term="Role">
            {roleLabel(user)}
            {user.role_region ? ` · ${user.role_region.name}` : ''}
          </Row>
          <Row term="Responsibilities">
            {user.responsibilities.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {user.responsibilities.map((responsibility) => (
                  <li
                    key={`${responsibility.code}-${responsibility.region?.id ?? ''}`}
                  >
                    <Badge variant="secondary">
                      {RESPONSIBILITY_LABELS[responsibility.code] ??
                        responsibility.code}
                      {responsibility.region
                        ? ` · ${responsibility.region.name}`
                        : ''}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              'None'
            )}
          </Row>
          <Row term="Warehouses you keep">
            {user.warehouse_ids.length > 0
              ? count(user.warehouse_ids.length, 'warehouse')
              : 'None'}
          </Row>
          <Row term="IT regions you run">
            {user.it_regions.length > 0
              ? count(user.it_regions.length, 'region')
              : 'None'}
          </Row>
          {user.represented_regions.length > 0 ? (
            <Row term="Region you represent">
              {user.role_region?.name ??
                count(user.represented_regions.length, 'region')}
            </Row>
          ) : null}
          <Row term="Management scope">
            {user.read_only ? (
              'Whole organization, read-only: every store and its history'
            ) : active.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {active.map((jurisdiction) => (
                  <li key={jurisdiction.id}>
                    {jurisdictionLabel(jurisdiction)}
                  </li>
                ))}
              </ul>
            ) : can(user, 'JURISDICTION_MANAGE') ? (
              // Only Super Admin and Admin hold this code; they are not limited by jurisdiction rows.
              'Whole organization (administration only; no stock or asset operations)'
            ) : (
              'No management scope'
            )}
          </Row>
        </dl>
      </CardContent>
    </Card>
  );
}
