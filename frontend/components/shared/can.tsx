'use client';

import { useCurrentUser } from '@/features/auth/session';
import { canAny, type PermissionCode } from '@/lib/permissions/codes';

import { AccessDenied } from './access-denied';

type CanProps = {
  anyOf: readonly PermissionCode[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

/**
 * Shows an action or section only to users who hold a permission for it. This is for
 * tidiness, not protection: the backend checks every request.
 */
export function Can({ anyOf, children, fallback = null }: CanProps) {
  const user = useCurrentUser();
  return canAny(user, anyOf) ? children : fallback;
}

/** Wraps a whole page: users without a matching code get the access-denied screen. */
export function RequirePermission({
  anyOf,
  children,
}: Omit<CanProps, 'fallback'>) {
  return (
    <Can anyOf={anyOf} fallback={<AccessDenied />}>
      {children}
    </Can>
  );
}
