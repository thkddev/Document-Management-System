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

interface ListAdminUsersResponse {
  items: AdminUserSummary[];
}

export async function listAdminUsers(): Promise<AdminUserSummary[]> {
  const response = await apiFetch<ListAdminUsersResponse>('/admin/users');
  return response.items;
}
