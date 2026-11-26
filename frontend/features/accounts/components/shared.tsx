import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import type { ProfileStatus } from '@/features/auth/types';

import { STATUS_LABELS } from '../types';

export const ROW_LINK =
  'rounded-sm text-primary underline-offset-4 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

const STATUS_VARIANT = {
  INVITED: 'outline',
  ACTIVE: 'default',
  DEACTIVATED: 'secondary',
} as const;

/** Whether an account can sign in, in words as well as colour. */
export function AccountStatusBadge({ status }: { status: ProfileStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function AccountLink({
  id,
  name,
  linked,
  inline,
}: {
  id: string;
  name: string;
  linked: boolean;
  inline?: boolean;
}) {
  return linked ? (
    <Link
      href={`/users/${id}`}
      className={inline ? `${ROW_LINK} underline` : ROW_LINK}
    >
      {name}
    </Link>
  ) : (
    <>{name}</>
  );
}
