import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listAdminUsers } = vi.hoisted(() => ({
  listAdminUsers: vi.fn(),
}));

vi.mock('../src/services/admin-users.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listAdminUsers,
}));

const { handler } = await import('../src/handlers/admin-users.js');

function createEvent(claims?: Record<string, unknown>): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    httpMethod: 'GET',
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
      httpMethod: 'GET',
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
    listAdminUsers.mockReset();
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
});
