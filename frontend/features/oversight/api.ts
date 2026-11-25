import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { Option } from '@/components/shared/select-field';
import { apiGet, apiPost, type QueryValue } from '@/lib/api/client';
import type { Paginated } from '@/lib/api/envelope';

type Query = Record<string, QueryValue>;

export type AuditEntry = {
  id: string;
  occurred_at: string;
  actor: { id: string | null; name: string };
  action: string;
  object_type: string;
  object_id: string;
  object_repr: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  request_id: string | null;
  ip: string | null;
};

export type EmailKind =
  | 'INVITATION'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED'
  | 'IT_MANAGER_APPOINTED'
  | 'IT_MANAGER_REVOKED'
  | 'LOW_STOCK'
  | 'ASSET_ASSIGNED';
export type EmailStatus = 'QUEUED' | 'SENT' | 'FAILED';

export const EMAIL_KIND_LABELS: Record<EmailKind, string> = {
  INVITATION: 'Account invitation',
  PASSWORD_RESET: 'Password reset',
  PASSWORD_CHANGED: 'Password changed',
  IT_MANAGER_APPOINTED: 'IT Asset Manager appointed',
  IT_MANAGER_REVOKED: 'IT Asset Manager revoked',
  LOW_STOCK: 'Low stock',
  ASSET_ASSIGNED: 'IT asset assigned',
};
export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  QUEUED: 'Queued',
  SENT: 'Sent',
  FAILED: 'Failed',
};

const options = (labels: Record<string, string>): Option[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));
export const EMAIL_KIND_OPTIONS = options(EMAIL_KIND_LABELS);
export const EMAIL_STATUS_OPTIONS = options(EMAIL_STATUS_LABELS);

export type EmailRecord = {
  id: string;
  kind: EmailKind;
  recipient_email: string;
  subject: string;
  body_text: string;
  redacted: boolean;
  related_type: string;
  related_id: string;
  status: EmailStatus;
  attempts: number;
  last_error: string;
  created_at: string;
  sent_at: string | null;
};

export const canRetry = (email: EmailRecord) =>
  email.status !== 'SENT' && !email.redacted;

export const oversightKeys = {
  all: ['oversight'] as const,
  audit: (query: Query) => ['oversight', 'audit', query] as const,
  emails: (query: Query) => ['oversight', 'emails', query] as const,
};

export function useAuditLog(query: Query) {
  return useQuery({
    queryKey: oversightKeys.audit(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<AuditEntry>>('/audit/', { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useEmailLog(query: Query) {
  return useQuery({
    queryKey: oversightKeys.emails(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<EmailRecord>>('/notifications/', { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useRetryEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<EmailRecord>(`/notifications/${id}/retry/`, {}),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: oversightKeys.all }),
  });
}
