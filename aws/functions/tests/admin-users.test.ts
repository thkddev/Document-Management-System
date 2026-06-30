import {
  AdminListGroupsForUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { describe, expect, it, vi } from 'vitest';
import { AdminUsersForbiddenError, listAdminUsers } from '../src/services/admin-users.js';

describe('admin users service', () => {
  it('liệt kê và map user Cognito cho System Admin', async () => {
    const send = vi.fn(async (command) => {
      if (command instanceof ListUsersCommand) {
        return {
          Users: [
            {
              Username: 'username-1',
              Attributes: [
                { Name: 'sub', Value: 'user-1' },
                { Name: 'email', Value: 'THKD811@GMAIL.COM' },
                { Name: 'name', Value: 'Duy Admin' },
                { Name: 'custom:departmentId', Value: 'TECH' },
              ],
              Enabled: true,
              UserStatus: 'CONFIRMED',
              UserCreateDate: new Date('2026-06-30T04:36:48.000Z'),
              UserLastModifiedDate: new Date('2026-06-30T04:40:00.000Z'),
            },
          ],
        };
      }

      if (command instanceof AdminListGroupsForUserCommand) {
        return {
          Groups: [
            { GroupName: 'EMPLOYEE' },
            { GroupName: 'SYSTEM_ADMIN' },
            { GroupName: 'UNRELATED' },
          ],
        };
      }

      throw new Error('unexpected command');
    });

    await expect(
      listAdminUsers(
        { userId: 'admin-1', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
        { cognito: { send } as never, userPoolId: 'pool-1' },
      ),
    ).resolves.toEqual([
      {
        id: 'user-1',
        name: 'Duy Admin',
        email: 'thkd811@gmail.com',
        departmentId: 'TECH',
        roles: ['EMPLOYEE', 'SYSTEM_ADMIN'],
        status: 'CONFIRMED',
        enabled: true,
        createdAt: '2026-06-30T04:36:48.000Z',
        updatedAt: '2026-06-30T04:40:00.000Z',
      },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('từ chối user không phải System Admin', async () => {
    await expect(
      listAdminUsers(
        { userId: 'user-1', departmentId: 'TECH', roles: ['EMPLOYEE'] },
        { cognito: { send: vi.fn() } as never, userPoolId: 'pool-1' },
      ),
    ).rejects.toBeInstanceOf(AdminUsersForbiddenError);
  });
});
