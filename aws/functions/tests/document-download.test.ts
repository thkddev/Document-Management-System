import { GetItemCommand, PutItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import {
  createDownloadIntent,
  DocumentNotFoundError,
  DocumentNotReadyError,
} from '../src/services/document-download.js';

const record = {
  entityType: 'Document',
  documentId: 'document-1',
  title: 'Báo cáo tuần',
  originalFileName: 'Báo cáo tuần.pdf',
  contentType: 'application/pdf',
  classification: 'INTERNAL',
  departmentId: 'TECH',
  ownerId: 'owner-1',
  ownerEmail: 'owner@example.com',
  sizeBytes: 2048,
  currentVersion: 1,
  status: 'READY',
  createdAt: '2026-06-21T01:00:00.000Z',
  updatedAt: '2026-06-21T01:05:00.000Z',
  cleanObjectKey: 'documents/TECH/document-1/v000001/Bao_cao.pdf',
};

function createDeps(document: Record<string, unknown> = record) {
  const send = vi.fn(async (command) => {
    if (command instanceof GetItemCommand) return { Item: marshall(document) };
    if (command instanceof PutItemCommand) return {};
    throw new Error(`Unexpected command ${command.constructor.name}`);
  });
  const presign = vi.fn().mockResolvedValue('https://signed.example/download');
  return {
    deps: {
      dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
      s3: new S3Client({ region: 'ap-southeast-1' }),
      tableName: 'dms-test',
      documentsBucketName: 'documents-test',
      requestId: 'request-1',
      now: () => new Date('2026-06-21T02:00:00.000Z'),
      presign,
    },
    send,
    presign,
  };
}

const principal = { userId: 'owner-1', departmentId: 'TECH', roles: [] };

describe('createDownloadIntent', () => {
  it('tạo URL 5 phút từ Documents Bucket và ghi audit an toàn', async () => {
    const { deps, send, presign } = createDeps();

    const result = await createDownloadIntent('document-1', principal, deps);

    expect(result).toEqual({
      downloadUrl: 'https://signed.example/download',
      expiresAt: '2026-06-21T02:05:00.000Z',
      fileName: 'Báo cáo tuần.pdf',
    });
    const command = presign.mock.calls[0]?.[1];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'documents-test',
      Key: record.cleanObjectKey,
      ResponseContentType: 'application/pdf',
    });
    expect(command.input.ResponseContentDisposition).toContain(
      "filename*=UTF-8''B%C3%A1o%20c%C3%A1o",
    );
    expect(presign.mock.calls[0]?.[2]).toEqual({ expiresIn: 300 });

    const audit = send.mock.calls.find(([item]) => item instanceof PutItemCommand)?.[0];
    expect(audit).toBeInstanceOf(PutItemCommand);
    const auditItem = unmarshall(audit.input.Item ?? {});
    expect(auditItem).toMatchObject({
      action: 'DOCUMENT_DOWNLOAD_REQUESTED',
      actorId: 'owner-1',
      requestId: 'request-1',
    });
    expect(auditItem).not.toHaveProperty('downloadUrl');
    expect(auditItem).not.toHaveProperty('objectKey');
  });

  it('không cấp URL cho tài liệu chưa READY', async () => {
    const { deps, presign } = createDeps({ ...record, status: 'SCANNING' });

    await expect(createDownloadIntent('document-1', principal, deps)).rejects.toBeInstanceOf(
      DocumentNotReadyError,
    );
    expect(presign).not.toHaveBeenCalled();
  });

  it('trả not found khi principal không có quyền', async () => {
    const { deps, presign } = createDeps();

    await expect(
      createDownloadIntent('document-1', { userId: 'other', departmentId: 'HR', roles: [] }, deps),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(presign).not.toHaveBeenCalled();
  });

  it('không trả URL nếu ghi audit thất bại', async () => {
    const { deps, send } = createDeps();
    send.mockImplementation(async (command) => {
      if (command instanceof GetItemCommand) return { Item: marshall(record) };
      throw new Error('DynamoDB unavailable');
    });

    await expect(createDownloadIntent('document-1', principal, deps)).rejects.toThrow(
      'DynamoDB unavailable',
    );
  });
});
