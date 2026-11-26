'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

import { authKeys, getCurrentUser, logout } from './api';
import type { CurrentUser } from './types';

const CURRENT_USER_STALE_MS = 5 * 60_000;

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

export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (!user) {
    throw new Error(
      'useCurrentUser must be used inside the application shell.',
    );
  }
  return user;
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    meta: { publicRequest: true },
    onSettled: () => {
      queryClient.clear();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/login');
    },
  });
}
