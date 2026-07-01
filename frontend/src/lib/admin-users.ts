import { apiFetch } from './api-client';

export type AdminUserRole = 'EMPLOYEE' | 'DEPARTMENT_ADMIN' | 'SYSTEM_ADMIN';
export type AdminUserAction = 'DISABLE' | 'ENABLE' | 'RESET_PASSWORD';
export type AdminAuditAction =
  | 'ADMIN_USER_CREATED'
  | 'ADMIN_USER_UPDATED'
  | 'ADMIN_USER_DISABLED'
  | 'ADMIN_USER_ENABLED'
  | 'ADMIN_USER_PASSWORD_RESET';

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  departmentId: string;
  roles: AdminUserRole[];
  status: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAdminUserInput {
  email: string;
  name: string;
  departmentId: string;
  role: AdminUserRole;
  password: string;
}

export interface UpdateAdminUserInput {
  email: string;
  departmentId: string;
  role: AdminUserRole;
}

export interface RunAdminUserActionInput {
  email: string;
  action: AdminUserAction;
  password?: string;
}

export interface AdminAuditEvent {
  eventId: string;
  action: AdminAuditAction;
  actorId: string;
  actorEmail?: string;
  targetEmail: string;
  targetDepartmentId?: string;
  targetRoles?: AdminUserRole[];
  outcome: 'SUCCESS' | 'REJECTED' | 'FAILED';
  occurredAt: string;
  requestId?: string;
}

interface ListAdminUsersResponse {
  items: AdminUserSummary[];
}

interface ListAdminAuditEventsResponse {
  items: AdminAuditEvent[];
  nextCursor?: string;
}

interface AdminUserItemResponse {
  item: AdminUserSummary;
}

export async function listAdminUsers(): Promise<AdminUserSummary[]> {
  const response = await apiFetch<ListAdminUsersResponse>('/admin/users');
  return response.items;
}

export async function createAdminUser(input: CreateAdminUserInput): Promise<AdminUserSummary> {
  const response = await apiFetch<AdminUserItemResponse>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.item;
}

export async function updateAdminUser(input: UpdateAdminUserInput): Promise<AdminUserSummary> {
  const response = await apiFetch<AdminUserItemResponse>('/admin/users', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return response.item;
}

export async function runAdminUserAction(
  input: RunAdminUserActionInput,
): Promise<AdminUserSummary> {
  const response = await apiFetch<AdminUserItemResponse>('/admin/users/actions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.item;
}

export interface ListAdminAuditEventsInput {
  query?: string;
  action?: AdminAuditAction;
  outcome?: AdminAuditEvent['outcome'];
  limit?: number;
  cursor?: string;
}

export async function listAdminAuditEvents(
  input: ListAdminAuditEventsInput = {},
): Promise<ListAdminAuditEventsResponse> {
  const params = new URLSearchParams();
  if (input.query?.trim()) params.set('query', input.query.trim());
  if (input.action) params.set('action', input.action);
  if (input.outcome) params.set('outcome', input.outcome);
  if (input.limit) params.set('limit', String(input.limit));
  if (input.cursor) params.set('cursor', input.cursor);
  const queryString = params.toString();
  return apiFetch<ListAdminAuditEventsResponse>(
    `/admin/users/audit-events${queryString ? `?${queryString}` : ''}`,
  );
}
