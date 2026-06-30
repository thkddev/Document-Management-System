import { apiFetch } from './api-client';

export type AdminUserRole = 'EMPLOYEE' | 'DEPARTMENT_ADMIN' | 'SYSTEM_ADMIN';

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

interface ListAdminUsersResponse {
  items: AdminUserSummary[];
}

interface CreateAdminUserResponse {
  item: AdminUserSummary;
}

export async function listAdminUsers(): Promise<AdminUserSummary[]> {
  const response = await apiFetch<ListAdminUsersResponse>('/admin/users');
  return response.items;
}

export async function createAdminUser(input: CreateAdminUserInput): Promise<AdminUserSummary> {
  const response = await apiFetch<CreateAdminUserResponse>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.item;
}
