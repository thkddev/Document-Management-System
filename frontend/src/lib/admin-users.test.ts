import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('./api-client', () => ({ apiFetch }));

const { createAdminUser, listAdminUsers, updateAdminUser } = await import('./admin-users');

describe('admin users client', () => {
  beforeEach(() => apiFetch.mockReset());

  it('lấy danh sách người dùng quản trị từ GET /admin/users', async () => {
    const items = [
      {
        id: 'user-1',
        name: 'Duy Admin',
        email: 'thkd811@gmail.com',
        departmentId: 'TECH',
        roles: ['SYSTEM_ADMIN', 'EMPLOYEE'],
        status: 'CONFIRMED',
        enabled: true,
        createdAt: '2026-06-30T04:36:48.000Z',
        updatedAt: '2026-06-30T04:36:48.000Z',
      },
    ];
    apiFetch.mockResolvedValue({ items });

    await expect(listAdminUsers()).resolves.toEqual(items);
    expect(apiFetch).toHaveBeenCalledWith('/admin/users');
  });

  it('tạo người dùng quản trị qua POST /admin/users', async () => {
    const item = {
      id: 'user-1',
      name: 'Test Employee',
      email: 'test123@gmail.com',
      departmentId: 'TECH',
      roles: ['EMPLOYEE'],
      status: 'CONFIRMED',
      enabled: true,
      createdAt: '2026-06-30T04:36:48.000Z',
      updatedAt: '2026-06-30T04:36:48.000Z',
    };
    apiFetch.mockResolvedValue({ item });

    const input = {
      email: 'test123@gmail.com',
      name: 'Test Employee',
      departmentId: 'TECH',
      role: 'EMPLOYEE' as const,
      password: 'Duy8112004.@A',
    };

    await expect(createAdminUser(input)).resolves.toEqual(item);
    expect(apiFetch).toHaveBeenCalledWith('/admin/users', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  });

  it('cập nhật người dùng quản trị qua PATCH /admin/users', async () => {
    const item = {
      id: 'user-1',
      name: 'Test Employee',
      email: 'test123@gmail.com',
      departmentId: 'HR',
      roles: ['DEPARTMENT_ADMIN'],
      status: 'CONFIRMED',
      enabled: true,
      createdAt: '2026-06-30T04:36:48.000Z',
      updatedAt: '2026-06-30T05:36:48.000Z',
    };
    apiFetch.mockResolvedValue({ item });

    const input = {
      email: 'test123@gmail.com',
      departmentId: 'HR',
      role: 'DEPARTMENT_ADMIN' as const,
    };

    await expect(updateAdminUser(input)).resolves.toEqual(item);
    expect(apiFetch).toHaveBeenCalledWith('/admin/users', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  });
});
