import { apiGet } from '@/lib/api/client';

export type Health = {
  status: string;
  database: string;
};

export const healthKeys = {
  all: ['health'] as const,
};

export function getHealth(signal?: AbortSignal) {
  return apiGet<Health>('/health/', { signal });
}
