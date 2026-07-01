import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { describe, expect, it, vi } from 'vitest';
import {
  AdminUserAlreadyExistsError,
  AdminUserValidationError,
  AdminUsersForbiddenError,
  createAdminUser,
  listAdminUsers,
  runAdminUserAction,
  updateAdminUser,
} from '../src/services/admin-users.js';

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

  it('tạo user Cognito, đặt mật khẩu và gán group vai trò', async () => {
    const send = vi.fn(async (command) => {
      if (command instanceof AdminCreateUserCommand) {
        return {
          User: {
            Username: 'test123@gmail.com',
            Attributes: [
              { Name: 'sub', Value: 'user-123' },
              { Name: 'email', Value: 'test123@gmail.com' },
              { Name: 'name', Value: 'Test Employee' },
              { Name: 'custom:departmentId', Value: 'TECH' },
            ],
          },
        };
      }
      if (
        command instanceof AdminSetUserPasswordCommand ||
        command instanceof AdminAddUserToGroupCommand
      ) {
        return {};
      }
      throw new Error('unexpected command');
    });

    await expect(
      createAdminUser(
        { userId: 'admin-1', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
        {
          email: 'TEST123@GMAIL.COM ',
          name: ' Test Employee ',
          departmentId: 'tech',
          role: 'EMPLOYEE',
          password: 'Duy8112004.@A',
        },
        { cognito: { send } as never, userPoolId: 'pool-1' },
      ),
    ).resolves.toMatchObject({
      id: 'user-123',
      email: 'test123@gmail.com',
      name: 'Test Employee',
      departmentId: 'TECH',
      roles: ['EMPLOYEE'],
      status: 'CONFIRMED',
      enabled: true,
    });

    expect(send).toHaveBeenNthCalledWith(1, expect.any(AdminCreateUserCommand));
    expect(send).toHaveBeenNthCalledWith(2, expect.any(AdminSetUserPasswordCommand));
    expect(send).toHaveBeenNthCalledWith(3, expect.any(AdminAddUserToGroupCommand));
  });

  it('map lỗi email đã tồn tại từ Cognito', async () => {
    const send = vi.fn(async () => {
      const err = new Error('exists');
      err.name = 'UsernameExistsException';
      throw err;
    });

    await expect(
      createAdminUser(
        { userId: 'admin-1', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
        {
          email: 'test123@gmail.com',
          name: 'Test Employee',
          departmentId: 'TECH',
          role: 'EMPLOYEE',
          password: 'Duy8112004.@A',
        },
        { cognito: { send } as never, userPoolId: 'pool-1' },
      ),
    ).rejects.toBeInstanceOf(AdminUserAlreadyExistsError);
  });

  it('cập nhật phòng ban và đồng bộ group vai trò Cognito', async () => {
    const send = vi.fn(async (command) => {
      if (command instanceof AdminUpdateUserAttributesCommand) return {};
      if (command instanceof AdminListGroupsForUserCommand) {
        return {
          Groups: [{ GroupName: 'EMPLOYEE' }, { GroupName: 'UNRELATED' }],
        };
      }
      if (
        command instanceof AdminRemoveUserFromGroupCommand ||
        command instanceof AdminAddUserToGroupCommand ||
        command instanceof AdminUserGlobalSignOutCommand
      ) {
        return {};
      }
      throw new Error('unexpected command');
    });

    await expect(
      updateAdminUser(
        { userId: 'admin-1', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
        {
          email: ' TEST123@GMAIL.COM ',
          departmentId: 'hr',
          role: 'DEPARTMENT_ADMIN',
        },
        { cognito: { send } as never, userPoolId: 'pool-1' },
      ),
    ).resolves.toMatchObject({
      email: 'test123@gmail.com',
      departmentId: 'HR',
      roles: ['DEPARTMENT_ADMIN'],
      status: 'UPDATED',
    });

    expect(send).toHaveBeenNthCalledWith(1, expect.any(AdminUpdateUserAttributesCommand));
    expect(send).toHaveBeenNthCalledWith(2, expect.any(AdminListGroupsForUserCommand));
    expect(send).toHaveBeenNthCalledWith(3, expect.any(AdminRemoveUserFromGroupCommand));
    expect(send).toHaveBeenNthCalledWith(4, expect.any(AdminAddUserToGroupCommand));
    expect(send).toHaveBeenNthCalledWith(5, expect.any(AdminUserGlobalSignOutCommand));
  });

  it('khóa và mở khóa tài khoản Cognito', async () => {
    const send = vi.fn(async () => ({}));

    await expect(
      runAdminUserAction(
        { userId: 'admin-1', email: 'admin@example.com', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
        { email: 'user@example.com', action: 'DISABLE' },
        { cognito: { send } as never, userPoolId: 'pool-1' },
      ),
    ).resolves.toMatchObject({ email: 'user@example.com', enabled: false, status: 'DISABLED' });

    await expect(
      runAdminUserAction(
        { userId: 'admin-1', email: 'admin@example.com', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
        { email: 'user@example.com', action: 'ENABLE' },
        { cognito: { send } as never, userPoolId: 'pool-1' },
      ),
    ).resolves.toMatchObject({ email: 'user@example.com', enabled: true, status: 'ENABLED' });

    expect(send).toHaveBeenNthCalledWith(1, expect.any(AdminDisableUserCommand));
    expect(send).toHaveBeenNthCalledWith(2, expect.any(AdminUserGlobalSignOutCommand));
    expect(send).toHaveBeenNthCalledWith(3, expect.any(AdminEnableUserCommand));
  });

  it('reset mật khẩu permanent và không cho tự khóa tài khoản', async () => {
    const send = vi.fn(async () => ({}));

    await expect(
      runAdminUserAction(
        { userId: 'admin-1', email: 'admin@example.com', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
        {
          email: 'user@example.com',
          action: 'RESET_PASSWORD',
          password: 'Duy8112004.@A',
        },
        { cognito: { send } as never, userPoolId: 'pool-1' },
      ),
    ).resolves.toMatchObject({
      email: 'user@example.com',
      enabled: true,
      status: 'PASSWORD_RESET',
    });
    expect(send).toHaveBeenCalledWith(expect.any(AdminSetUserPasswordCommand));
    expect(send).toHaveBeenCalledWith(expect.any(AdminUserGlobalSignOutCommand));

    const selfLockPromise = runAdminUserAction(
      { userId: 'admin-1', email: 'admin@example.com', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
      { email: 'admin@example.com', action: 'DISABLE' },
      { cognito: { send } as never, userPoolId: 'pool-1' },
    );

    await expect(selfLockPromise).rejects.toBeInstanceOf(AdminUserValidationError);
    await expect(
      runAdminUserAction(
        { userId: 'admin-1', email: 'admin@example.com', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
        { email: 'admin@example.com', action: 'DISABLE' },
        { cognito: { send } as never, userPoolId: 'pool-1' },
      ),
    ).rejects.toMatchObject({
      issues: [{ field: 'email', message: 'Bạn không thể tự khóa tài khoản đang đăng nhập.' }],
    });
  });
});
