import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { PickerResult } from '@/components/shared/entity-picker';
import type {
  Jurisdiction,
  ResponsibilityCode,
  Role,
} from '@/features/auth/types';
import type { Employee } from '@/features/employees/types';
import { organizationKeys } from '@/features/organization/api';
import type { Region } from '@/features/organization/types';
import { apiDelete, apiGet, apiPost, type QueryValue } from '@/lib/api/client';
import type { Envelope, Paginated } from '@/lib/api/envelope';

import {
  accountName,
  type Account,
  type AccountDetail,
  type GrantableRole,
  type ItStaff,
} from './types';

type Query = Record<string, QueryValue>;

const PICKER_PAGE_SIZE = 20;

export const accountKeys = {
  all: ['accounts'] as const,
  list: (query: Query) => ['accounts', 'list', query] as const,
  detail: (id: string) => ['accounts', 'detail', id] as const,
  candidates: (region: string) => ['accounts', 'candidates', region] as const,
  employeePicker: ['employees', 'picker'] as const,
  region: (id: string) =>
    [...organizationKeys.all, 'regions', 'detail', id] as const,
  itStaff: (id: string) =>
    [...organizationKeys.all, 'regions', 'it-staff', id] as const,
};

/** One page of the accounts the signed-in user manages. The backend limits it to their jurisdiction. */
export function useAccountList(query: Query) {
  return useQuery({
    queryKey: accountKeys.list(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Account>>('/accounts/', { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useAccount(id: string) {
  return useQuery({
    queryKey: accountKeys.detail(id),
    queryFn: ({ signal }) =>
      apiGet<AccountDetail>(`/accounts/${id}/`, { signal }),
    select: (response) => response.data,
  });
}

export function useRegion(id: string) {
  return useQuery({
    queryKey: accountKeys.region(id),
    queryFn: ({ signal }) => apiGet<Region>(`/regions/${id}/`, { signal }),
    select: (response) => response.data,
  });
}

/** Who runs IT in a region. Only administrators and that region's IT staff may ask. */
export function useItStaff(regionId: string, enabled: boolean) {
  return useQuery({
    queryKey: accountKeys.itStaff(regionId),
    queryFn: ({ signal }) =>
      apiGet<ItStaff>(`/regions/${regionId}/it-staff/`, { signal }),
    select: (response) => response.data,
    enabled,
  });
}

/** The roles the signed-in user may give, each with the jurisdiction level it requires
 * (`GET accounts/grantable-roles/`). Empty for someone who grants no role. */
export function useGrantableRoles(enabled = true) {
  return useQuery({
    queryKey: [...accountKeys.all, 'grantable-roles'] as const,
    queryFn: ({ signal }) =>
      apiGet<GrantableRole[]>('/accounts/grantable-roles/', { signal }),
    select: (response) => response.data,
    enabled,
  });
}

/** Active employees matching `term`, for choosing whom to create an account for. */
export async function searchEmployees(
  term: string,
  signal: AbortSignal,
): Promise<PickerResult> {
  const response = await apiGet<Paginated<Employee>>('/employees/', {
    query: { search: term, is_active: true, page_size: PICKER_PAGE_SIZE },
    signal,
  });
  return {
    total: response.data.pagination.count,
    options: response.data.results.map((employee) => ({
      value: employee.id,
      label: `${employee.first_name} ${employee.last_name}`,
      description: `${employee.matricule} · ${employee.department.name}, ${employee.office.name}`,
    })),
  };
}

/** The accounts that can be appointed IT Asset Manager of a region (the backend applies the rules). */
export function searchCandidates(regionId: string) {
  return async (term: string, signal: AbortSignal): Promise<PickerResult> => {
    const response = await apiGet<Paginated<Account>>(
      '/accounts/it-asset-manager-candidates/',
      {
        query: { region: regionId, search: term, page_size: PICKER_PAGE_SIZE },
        signal,
      },
    );
    return {
      total: response.data.pagination.count,
      options: response.data.results.map((account) => ({
        value: account.id,
        label: accountName(account),
        description: `${account.employee.matricule} · ${account.email}`,
      })),
    };
  };
}

export type JurisdictionInput =
  { region_id: string } | { office_id: string } | { department_id: string };
/** `jurisdiction` is the one the role requires (authorization-requirements 1.4). */
export type ProvisionInput = {
  employee_id: string;
  email: string;
  role?: Role;
  jurisdiction?: JurisdictionInput;
};
/** The new role, with the jurisdiction it requires; it replaces the account's jurisdictions. */
export type RoleInput = {
  role: Role;
  jurisdiction?: JurisdictionInput;
  reason: string;
};
export type AppointInput = {
  accountId: string;
  regionId: string;
  reason: string;
  replace: boolean;
};

/**
 * A change to an account. Afterwards everything about accounts and the organization's IT
 * staff is reloaded from the backend: one change often moves several things (a
 * deactivation ends responsibilities, jurisdictions and warehouse assignments).
 */
function useAccountMutation<TInput, TData>(
  mutationFn: (input: TInput) => Promise<Envelope<TData>>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: accountKeys.all }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.all }),
      ]),
  });
}

export const useProvisionAccount = () =>
  useAccountMutation((input: ProvisionInput) =>
    apiPost<AccountDetail>('/accounts/provision/', input),
  );

export const useResendInvitation = (id: string) =>
  useAccountMutation(() =>
    apiPost<null>(`/accounts/${id}/resend-invitation/`, {}),
  );

export const useRevokeInvitation = (id: string) =>
  useAccountMutation(() =>
    apiPost<null>(`/accounts/${id}/revoke-invitation/`, {}),
  );

export const useSetRole = (id: string) =>
  useAccountMutation((input: RoleInput) =>
    apiPost<AccountDetail>(`/accounts/${id}/role/`, input),
  );

export const useSetAccountActive = (id: string) =>
  useAccountMutation((input: { active: boolean; reason: string }) =>
    apiPost<AccountDetail>(
      `/accounts/${id}/${input.active ? 'reactivate' : 'deactivate'}/`,
      { reason: input.reason },
    ),
  );

export const useGrantJurisdiction = (id: string) =>
  useAccountMutation((input: JurisdictionInput) =>
    apiPost<Jurisdiction>(`/accounts/${id}/jurisdictions/`, input),
  );

export const useEndJurisdiction = (id: string) =>
  useAccountMutation((jurisdictionId: string) =>
    apiDelete<null>(`/accounts/${id}/jurisdictions/${jurisdictionId}/`),
  );

/** Appoints an IT Asset Manager. `replace` ends the region's current appointment in the same step. */
export const useAppointItAssetManager = () =>
  useAccountMutation((input: AppointInput) =>
    apiPost<AccountDetail>(
      `/accounts/${input.accountId}/responsibilities/`,
      {
        code: 'IT_ASSET_MANAGER',
        region_id: input.regionId,
        reason: input.reason,
      },
      { query: { replace: input.replace ? 'true' : undefined } },
    ),
  );

/**
 * Grants the Store Keeper responsibility, deliberately: assigning a warehouse never grants
 * it, and on its own it allows nothing until a warehouse is assigned (requirements 1.8).
 */
export const useGrantStoreKeeper = (id: string) =>
  useAccountMutation((input: { reason: string }) =>
    apiPost<AccountDetail>(`/accounts/${id}/responsibilities/`, {
      code: 'STORE_KEEPER',
      reason: input.reason,
    }),
  );

/** Ends a responsibility. For a Store Keeper, every warehouse the person keeps becomes vacant. */
export const useRevokeResponsibility = (id: string) =>
  useAccountMutation((input: { code: ResponsibilityCode; reason: string }) =>
    apiDelete<null>(`/accounts/${id}/responsibilities/${input.code}/`, {
      reason: input.reason,
    }),
  );
