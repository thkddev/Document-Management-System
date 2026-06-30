import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminUser, listAdminUsers, runAdminUserAction, updateAdminUser } = vi.hoisted(() => ({
  createAdminUser: vi.fn(),
  listAdminUsers: vi.fn(),
  runAdminUserAction: vi.fn(),
  updateAdminUser: vi.fn(),
}));

vi.mock('../src/services/admin-users.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createAdminUser,
  listAdminUsers,
  runAdminUserAction,
  updateAdminUser,
}));

const { handler } = await import('../src/handlers/admin-users.js');
const { AdminUserAlreadyExistsError, AdminUserNotFoundError } = await import(
  '../src/services/admin-users.js'
);

function createEvent(
  claims?: Record<string, unknown>,
  method = 'GET',
  body: string | null = null,
): APIGatewayProxyEvent {
  return {
    body,
    headers: {},
    httpMethod: method,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    path: '/admin/users',
    pathParameters: null,
    queryStringParameters: null,
    resource: '/admin/users',
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      authorizer: claims ? { claims } : undefined,
      protocol: 'HTTP/1.1',
      httpMethod: method,
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'vitest',
        userArn: null,
      },
      path: '/admin/users',
      requestId: 'request-123',
      requestTimeEpoch: 0,
      resourceId: 'resource-id',
      resourcePath: '/admin/users',
      stage: 'test',
    },
  };
}

describe('GET /admin/users handler', () => {
  beforeEach(() => {
    process.env.USER_POOL_ID = 'pool-1';
    createAdminUser.mockReset();
    listAdminUsers.mockReset();
    runAdminUserAction.mockReset();
    updateAdminUser.mockReset();
  });

  it('trả danh sách người dùng cho System Admin', async () => {
    listAdminUsers.mockResolvedValue([{ id: 'user-1', email: 'user@example.com' }]);

    const response = await handler(
      createEvent({
        sub: 'admin-1',
        'custom:departmentId': 'TECH',
        'cognito:groups': 'SYSTEM_ADMIN',
      }),
      {} as never,
      () => undefined,
    );

    expect(response?.statusCode).toBe(200);
    expect(JSON.parse(response?.body ?? '{}')).toEqual({
      items: [{ id: 'user-1', email: 'user@example.com' }],
    });
    expect(listAdminUsers).toHaveBeenCalledWith(
      { userId: 'admin-1', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
      expect.objectContaining({ userPoolId: 'pool-1' }),
    );
  });

  it('từ chối request thiếu claims', async () => {
    const response = await handler(createEvent(), {} as never, () => undefined);

    expect(response?.statusCode).toBe(401);
    expect(listAdminUsers).not.toHaveBeenCalled();
  });

  it('tạo người dùng cho System Admin', async () => {
    createAdminUser.mockResolvedValue({ id: 'user-1', email: 'test123@gmail.com' });

    const response = await handler(
      createEvent(
        {
          sub: 'admin-1',
          'custom:departmentId': 'TECH',
          'cognito:groups': 'SYSTEM_ADMIN',
        },
        'POST',
        JSON.stringify({
          email: 'test123@gmail.com',
          name: 'Test Employee',
          departmentId: 'TECH',
          role: 'EMPLOYEE',
          password: 'Duy8112004.@A',
        }),
      ),
      {} as never,
      () => undefined,
    );

    expect(response?.statusCode).toBe(201);
    expect(JSON.parse(response?.body ?? '{}')).toEqual({
      item: { id: 'user-1', email: 'test123@gmail.com' },
    });
    expect(createAdminUser).toHaveBeenCalledWith(
      { userId: 'admin-1', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
      {
        email: 'test123@gmail.com',
        name: 'Test Employee',
        departmentId: 'TECH',
        role: 'EMPLOYEE',
        password: 'Duy8112004.@A',
      },
      expect.objectContaining({ userPoolId: 'pool-1' }),
    );
  });

  it('trả 409 khi email đã tồn tại', async () => {
    createAdminUser.mockRejectedValue(new AdminUserAlreadyExistsError('test123@gmail.com'));

    const response = await handler(
      createEvent(
        {
          sub: 'admin-1',
          'custom:departmentId': 'TECH',
          'cognito:groups': 'SYSTEM_ADMIN',
        },
        'POST',
        JSON.stringify({
          email: 'test123@gmail.com',
          name: 'Test Employee',
          departmentId: 'TECH',
          role: 'EMPLOYEE',
          password: 'Duy8112004.@A',
        }),
      ),
      {} as never,
      () => undefined,
    );

    expect(response?.statusCode).toBe(409);
  });

  it('cập nhật phòng ban và vai trò người dùng cho System Admin', async () => {
    updateAdminUser.mockResolvedValue({ id: 'user-1', email: 'test123@gmail.com' });

    const response = await handler(
      createEvent(
        {
          sub: 'admin-1',
          'custom:departmentId': 'TECH',
          'cognito:groups': 'SYSTEM_ADMIN',
        },
        'PATCH',
        JSON.stringify({
          email: 'test123@gmail.com',
          departmentId: 'HR',
          role: 'DEPARTMENT_ADMIN',
        }),
      ),
      {} as never,
      () => undefined,
    );

    expect(response?.statusCode).toBe(200);
    expect(JSON.parse(response?.body ?? '{}')).toEqual({
      item: { id: 'user-1', email: 'test123@gmail.com' },
    });
    expect(updateAdminUser).toHaveBeenCalledWith(
      { userId: 'admin-1', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
      {
        email: 'test123@gmail.com',
        departmentId: 'HR',
        role: 'DEPARTMENT_ADMIN',
      },
      expect.objectContaining({ userPoolId: 'pool-1' }),
    );
  });

  it('trả 404 khi cập nhật user không tồn tại', async () => {
    updateAdminUser.mockRejectedValue(new AdminUserNotFoundError('missing@example.com'));

    const response = await handler(
      createEvent(
        {
          sub: 'admin-1',
          'custom:departmentId': 'TECH',
          'cognito:groups': 'SYSTEM_ADMIN',
        },
        'PATCH',
        JSON.stringify({
          email: 'missing@example.com',
          departmentId: 'HR',
          role: 'EMPLOYEE',
        }),
      ),
      {} as never,
      () => undefined,
    );

    expect(response?.statusCode).toBe(404);
  });

  it('thực hiện thao tác khóa/mở/reset tài khoản người dùng', async () => {
    runAdminUserAction.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      status: 'DISABLED',
    });

    const event = createEvent(
      {
        sub: 'admin-1',
        email: 'admin@example.com',
        'custom:departmentId': 'TECH',
        'cognito:groups': 'SYSTEM_ADMIN',
      },
      'POST',
      JSON.stringify({
        email: 'user@example.com',
        action: 'DISABLE',
      }),
    );
    event.resource = '/admin/users/actions';
    event.path = '/admin/users/actions';
    event.requestContext.resourcePath = '/admin/users/actions';

    const response = await handler(event, {} as never, () => undefined);

    expect(response?.statusCode).toBe(200);
    expect(JSON.parse(response?.body ?? '{}')).toEqual({
      item: { id: 'user-1', email: 'user@example.com', status: 'DISABLED' },
    });
    expect(runAdminUserAction).toHaveBeenCalledWith(
      {
        userId: 'admin-1',
        email: 'admin@example.com',
        departmentId: 'TECH',
        roles: ['SYSTEM_ADMIN'],
      },
      { email: 'user@example.com', action: 'DISABLE' },
      expect.objectContaining({ userPoolId: 'pool-1' }),
    );
  });
});
