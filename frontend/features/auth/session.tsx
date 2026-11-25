'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

import { authKeys, getCurrentUser, logout } from './api';
import type { CurrentUser } from './types';

const CURRENT_USER_STALE_MS = 5 * 60_000;

/** The signed-in user, from `auth/users/me/`. Permissions change rarely, so it is kept a while. */
export function useCurrentUserQuery() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: ({ signal }) => getCurrentUser(signal),
    select: (response) => response.data,
    staleTime: CURRENT_USER_STALE_MS,
  });
}

const CurrentUserContext = createContext<CurrentUser | null>(null);

export const CurrentUserProvider = CurrentUserContext.Provider;

/** The signed-in user. Only for components inside the application shell, which loads it first. */
export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (!user) {
    throw new Error(
      'useCurrentUser must be used inside the application shell.',
    );
  }
  return user;
}

/**
 * Signs out, then loads the sign-in page afresh so nothing about the previous user stays
 * in memory. The page is left even if the request failed: the cookies are cleared by the
 * server whenever it is reached, and staying would look like signing out did nothing.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    meta: { publicRequest: true },
    onSettled: () => {
      queryClient.clear();
      // Deliberately a full page load, not a client-side navigation: Next.js keeps visited
      // pages alive in memory, and none of the previous user's screens may survive.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/login');
    },
  });
}
