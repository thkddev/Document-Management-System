import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDownloadIntent: vi.fn(),
  DocumentNotFoundError: class DocumentNotFoundError extends Error {},
  DocumentNotReadyError: class DocumentNotReadyError extends Error {},
}));
vi.mock('../src/services/document-download.js', () => mocks);
const { handler } = await import('../src/handlers/download-intents.js');

function event(): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    path: '/documents/document-1/download-intents',
    pathParameters: { documentId: 'document-1' },
    queryStringParameters: null,
    resource: '/documents/{documentId}/download-intents',
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      authorizer: {
        claims: { sub: 'user-1', 'custom:departmentId': 'TECH' },
      },
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {} as APIGatewayProxyEvent['requestContext']['identity'],
      path: '/documents/document-1/download-intents',
      requestId: 'request-1',
      requestTimeEpoch: 0,
      resourceId: 'resource-id',
      resourcePath: '/documents/{documentId}/download-intents',
      stage: 'test',
    },
  };
}

describe('POST /documents/{documentId}/download-intents', () => {
  beforeEach(() => {
    process.env.TABLE_NAME = 'dms-test';
    process.env.DOCUMENTS_BUCKET_NAME = 'documents-test';
    mocks.createDownloadIntent.mockReset();
  });

  it('trả 201 khi tạo download intent thành công', async () => {
    mocks.createDownloadIntent.mockResolvedValue({
      downloadUrl: 'https://signed.example/download',
      expiresAt: '2026-06-21T02:05:00.000Z',
      fileName: 'report.pdf',
    });

    const response = await handler(event(), {} as never, () => undefined);

    expect(response?.statusCode).toBe(201);
    expect(mocks.createDownloadIntent).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ userId: 'user-1' }),
      expect.objectContaining({ requestId: 'request-1' }),
    );
  });

  it('ẩn tài liệu không có quyền bằng 404', async () => {
    mocks.createDownloadIntent.mockRejectedValue(new mocks.DocumentNotFoundError());

    const response = await handler(event(), {} as never, () => undefined);

    expect(response?.statusCode).toBe(404);
    expect(JSON.parse(response?.body ?? '{}')).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
  });

  it('trả 409 khi tài liệu chưa sẵn sàng', async () => {
    mocks.createDownloadIntent.mockRejectedValue(new mocks.DocumentNotReadyError());

    const response = await handler(event(), {} as never, () => undefined);

    expect(response?.statusCode).toBe(409);
    expect(JSON.parse(response?.body ?? '{}')).toMatchObject({ code: 'DOCUMENT_NOT_READY' });
  });
});
