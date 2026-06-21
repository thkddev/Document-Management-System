import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listDocumentsByDepartment } = vi.hoisted(() => ({
  listDocumentsByDepartment: vi.fn(),
}));

vi.mock('../src/services/documents.js', () => ({ listDocumentsByDepartment }));

const { handler } = await import('../src/handlers/documents.js');

function createEvent(claims?: Record<string, unknown>): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    path: '/documents',
    pathParameters: null,
    queryStringParameters: null,
    resource: '/documents',
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
      path: '/documents',
      requestId: 'request-123',
      requestTimeEpoch: 0,
      resourceId: 'resource-id',
      resourcePath: '/documents',
      stage: 'test',
    },
  };
}

describe('GET /documents handler', () => {
  beforeEach(() => {
    process.env.TABLE_NAME = 'dms-test';
    listDocumentsByDepartment.mockReset();
  });

  it('trả danh sách theo phòng ban trong Cognito claims', async () => {
    listDocumentsByDepartment.mockResolvedValue([{ documentId: 'document-1' }]);

    const response = await handler(
      createEvent({ sub: 'user-1', 'custom:departmentId': 'TECH' }),
      {} as never,
      () => undefined,
    );

    expect(response?.statusCode).toBe(200);
    expect(JSON.parse(response?.body ?? '{}')).toEqual({ items: [{ documentId: 'document-1' }] });
    expect(listDocumentsByDepartment).toHaveBeenCalledWith(
      'TECH',
      expect.objectContaining({ tableName: 'dms-test' }),
    );
  });

  it('từ chối tài khoản thiếu phòng ban', async () => {
    const response = await handler(
      createEvent({ sub: 'user-1' }),
      {} as never,
      () => undefined,
    );

    expect(response?.statusCode).toBe(401);
    expect(listDocumentsByDepartment).not.toHaveBeenCalled();
  });
});
