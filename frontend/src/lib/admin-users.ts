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

export interface UpdateAdminUserInput {
  email: string;
  departmentId: string;
  role: AdminUserRole;
}

interface ListAdminUsersResponse {
  items: AdminUserSummary[];
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
