import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentPrincipal } from '../src/domain/models.js';
import { listAuthorizedDocuments } from '../src/services/documents.js';

const principal: DocumentPrincipal = {
  userId: 'user-1',
  departmentId: 'TECH',
  roles: ['EMPLOYEE'],
};

const documentRecord = {
  entityType: 'Document',
  documentId: 'document-1',
  title: 'Báo cáo tuần',
  originalFileName: 'bao-cao.pdf',
  contentType: 'application/pdf',
  classification: 'INTERNAL',
  accessScope: 'DEPARTMENT',
  departmentId: 'TECH',
  ownerId: 'user-1',
  ownerEmail: 'user@example.com',
  sizeBytes: 1024,
  currentVersion: 1,
  status: 'SCANNING',
  updatedAt: '2026-06-20T06:30:28.640Z',
};

describe('listAuthorizedDocuments', () => {
  it('scan document records và trả tài liệu user có quyền đọc', async () => {
    const send = vi.fn().mockResolvedValue({ Items: [marshall(documentRecord)] });

    const items = await listAuthorizedDocuments(principal, {
      dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
      tableName: 'dms-test',
    });

    expect(items).toEqual([
      expect.objectContaining({
        documentId: 'document-1',
        accessScope: 'DEPARTMENT',
        status: 'SCANNING',
      }),
    ]);
    expect((send.mock.calls[0]?.[0] as { input: Record<string, unknown> }).input).toMatchObject({
      TableName: 'dms-test',
      FilterExpression: 'entityType = :documentType',
      Limit: 50,
      ExpressionAttributeValues: {
        ':documentType': { S: 'Document' },
      },
    });
  });

  it('cho user thường thấy tài liệu toàn công ty khác phòng ban', async () => {
    const send = vi.fn().mockResolvedValue({
      Items: [
        marshall({
          ...documentRecord,
          documentId: 'document-all',
          departmentId: 'HR',
          ownerId: 'hr-owner',
          accessScope: 'ALL_EMPLOYEES',
        }),
      ],
    });

    const items = await listAuthorizedDocuments(principal, {
      dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
      tableName: 'dms-test',
    });

    expect(items).toEqual([expect.objectContaining({ documentId: 'document-all' })]);
  });

  it('ẩn tài liệu phòng ban khác nếu không phải toàn công ty', async () => {
    const send = vi.fn().mockResolvedValue({
      Items: [marshall({ ...documentRecord, departmentId: 'HR', ownerId: 'hr-owner' })],
    });

    await expect(
      listAuthorizedDocuments(principal, {
        dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
        tableName: 'dms-test',
      }),
    ).resolves.toEqual([]);
  });

  it('System Admin thấy tài liệu phòng ban khác', async () => {
    const send = vi.fn().mockResolvedValue({
      Items: [marshall({ ...documentRecord, departmentId: 'HR', ownerId: 'hr-owner' })],
    });

    const items = await listAuthorizedDocuments(
      { userId: 'admin-1', departmentId: 'ADMIN', roles: ['SYSTEM_ADMIN'] },
      {
        dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
        tableName: 'dms-test',
      },
    );

    expect(items).toHaveLength(1);
  });

  it('bỏ qua bản ghi sai cấu trúc', async () => {
    const send = vi.fn().mockResolvedValue({
      Items: [marshall(documentRecord), marshall({ ...documentRecord, status: 'UNKNOWN' })],
    });

    const items = await listAuthorizedDocuments(principal, {
      dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
      tableName: 'dms-test',
    });

    expect(items).toHaveLength(1);
  });

  it('đọc trang tiếp theo khi filter chưa thu đủ tài liệu', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: { pk: { S: 'UPLOAD#1' }, sk: { S: 'META' } },
      })
      .mockResolvedValueOnce({ Items: [marshall(documentRecord)] });

    const items = await listAuthorizedDocuments(principal, {
      dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
      tableName: 'dms-test',
    });

    expect(items).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect((send.mock.calls[1]?.[0] as { input: Record<string, unknown> }).input).toMatchObject({
      ExclusiveStartKey: { pk: { S: 'UPLOAD#1' }, sk: { S: 'META' } },
    });
  });

  it('trả lý do an toàn cho tài liệu bị từ chối', async () => {
    const send = vi.fn().mockResolvedValue({
      Items: [
        marshall({
          ...documentRecord,
          status: 'REJECTED',
          rejectionReason: 'Định dạng thực của file không hợp lệ.',
          checksumSha256: 'không được trả về frontend',
          quarantineObjectKey: 'không được trả về frontend',
        }),
      ],
    });

    const [item] = await listAuthorizedDocuments(principal, {
      dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
      tableName: 'dms-test',
    });

    expect(item).toMatchObject({
      status: 'REJECTED',
      statusReason: 'Định dạng thực của file không hợp lệ.',
    });
    expect(item).not.toHaveProperty('checksumSha256');
    expect(item).not.toHaveProperty('quarantineObjectKey');
  });
});
