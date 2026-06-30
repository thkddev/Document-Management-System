import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('./api-client', () => ({ apiFetch }));

const { listAdminUsers } = await import('./admin-users');

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
});
