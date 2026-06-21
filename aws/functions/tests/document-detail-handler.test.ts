import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocumentDetail } = vi.hoisted(() => ({ getDocumentDetail: vi.fn() }));
vi.mock('../src/services/document-access.js', () => ({ getDocumentDetail }));
const { handler } = await import('../src/handlers/document-detail.js');

function event(claims?: Record<string, unknown>): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    path: '/documents/document-1',
    pathParameters: { documentId: 'document-1' },
    queryStringParameters: null,
    resource: '/documents/{documentId}',
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      authorizer: claims ? { claims } : undefined,
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      identity: {} as APIGatewayProxyEvent['requestContext']['identity'],
      path: '/documents/document-1',
      requestId: 'request-1',
      requestTimeEpoch: 0,
      resourceId: 'resource-id',
      resourcePath: '/documents/{documentId}',
      stage: 'test',
    },
  };
}

describe('GET /documents/{documentId}', () => {
  beforeEach(() => {
    process.env.TABLE_NAME = 'dms-test';
    getDocumentDetail.mockReset();
  });

  it('trả chi tiết cho principal hợp lệ', async () => {
    getDocumentDetail.mockResolvedValue({ documentId: 'document-1', status: 'READY' });

    const response = await handler(
      event({
        sub: 'user-1',
        'custom:departmentId': 'TECH',
        'cognito:groups': '["SYSTEM_ADMIN"]',
      }),
      {} as never,
      () => undefined,
    );

    expect(response?.statusCode).toBe(200);
    expect(getDocumentDetail).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ roles: ['SYSTEM_ADMIN'] }),
      expect.any(Object),
    );
  });

  it('trả cùng 404 khi service ẩn tài liệu', async () => {
    getDocumentDetail.mockResolvedValue(null);
    const response = await handler(
      event({ sub: 'user-1', 'custom:departmentId': 'HR' }),
      {} as never,
      () => undefined,
    );

    expect(response?.statusCode).toBe(404);
    expect(JSON.parse(response?.body ?? '{}')).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
  });

  it('trả 401 khi claims thiếu phòng ban', async () => {
    const response = await handler(event({ sub: 'user-1' }), {} as never, () => undefined);

    expect(response?.statusCode).toBe(401);
    expect(getDocumentDetail).not.toHaveBeenCalled();
  });
});
