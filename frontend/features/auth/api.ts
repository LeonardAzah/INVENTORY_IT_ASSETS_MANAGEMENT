import { apiGet, apiPost, request } from '@/lib/api/client';

import type { CurrentUser } from './types';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

export type LoginInput = {
  email: string;
  password: string;
};

export type ChangePasswordInput = {
  current_password: string;
  new_password: string;
  re_new_password: string;
};

/** What the emailed links carry, plus the password the person chooses. */
export type SetPasswordInput = {
  uid: string;
  token: string;
  new_password: string;
  re_new_password: string;
};

/**
 * `POST auth/users/reset_password/`. The backend answers the same way whether or not the
 * address belongs to an account, so the response says nothing about who has one.
 */
export function requestPasswordReset(email: string) {
  return apiPost<null>('/auth/users/reset_password/', { email });
}

/** `POST auth/users/reset_password_confirm/`. A bad link comes back as a `uid` or `token` field error. */
export function confirmPasswordReset(input: SetPasswordInput) {
  return apiPost<null>('/auth/users/reset_password_confirm/', input);
}

/** `POST accounts/activate/`. Fails with INVALID_INVITATION or INVITATION_EXPIRED for a bad link. */
export function activateAccount(input: SetPasswordInput) {
  return apiPost<null>('/accounts/activate/', input);
}

/** Signs in through the Next.js route that keeps the tokens in httpOnly cookies. */
export function login(input: LoginInput) {
  return request<null>('POST', '/api/auth/login/', { body: input });
}

export function logout() {
  return request<null>('POST', '/api/auth/logout/', { body: {} });
}

/** `GET auth/users/me/`: who is signed in and what they may do. */
export function getCurrentUser(signal?: AbortSignal) {
  return apiGet<CurrentUser>('/auth/users/me/', { signal });
}

/** `POST auth/users/set_password/`. The backend emails a confirmation. */
export function changePassword(input: ChangePasswordInput) {
  return apiPost<null>('/auth/users/set_password/', input);
}
