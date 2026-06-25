import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listDocumentAuditEvents } = vi.hoisted(() => ({ listDocumentAuditEvents: vi.fn() }));
vi.mock('../src/services/document-audit.js', () => ({ listDocumentAuditEvents }));
const { handler } = await import('../src/handlers/document-audit-events.js');

function event(claims?: Record<string, unknown>): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    path: '/documents/document-1/audit-events',
    pathParameters: { documentId: 'document-1' },
    queryStringParameters: null,
    resource: '/documents/{documentId}/audit-events',
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      authorizer: claims ? { claims } : undefined,
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      identity: {} as APIGatewayProxyEvent['requestContext']['identity'],
      path: '/documents/document-1/audit-events',
      requestId: 'request-1',
      requestTimeEpoch: 0,
      resourceId: 'resource-id',
      resourcePath: '/documents/{documentId}/audit-events',
      stage: 'test',
    },
  };
}

describe('GET /documents/{documentId}/audit-events', () => {
  beforeEach(() => {
    process.env.TABLE_NAME = 'dms-test';
    listDocumentAuditEvents.mockReset();
  });

  it('trả danh sách audit events cho principal hợp lệ', async () => {
    listDocumentAuditEvents.mockResolvedValue([
      {
        eventId: 'event-1',
        action: 'DOCUMENT_READY',
        actorType: 'SYSTEM',
        actorId: 'upload-processor',
        source: 'UPLOAD_PROCESSOR',
        outcome: 'SUCCESS',
        occurredAt: '2026-06-25T01:00:00.000Z',
        versionNumber: 1,
      },
    ]);

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
    expect(JSON.parse(response?.body ?? '{}')).toMatchObject({
      items: [expect.objectContaining({ eventId: 'event-1' })],
    });
    expect(listDocumentAuditEvents).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ roles: ['SYSTEM_ADMIN'] }),
      expect.any(Object),
    );
  });

  it('trả 404 khi service không cho xem audit', async () => {
    listDocumentAuditEvents.mockResolvedValue(null);

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
    expect(listDocumentAuditEvents).not.toHaveBeenCalled();
  });
});
