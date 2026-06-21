import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { listDocumentsByDepartment } from '../src/services/documents.js';

const documentRecord = {
  entityType: 'Document',
  documentId: 'document-1',
  title: 'Báo cáo tuần',
  originalFileName: 'bao-cao.pdf',
  contentType: 'application/pdf',
  classification: 'INTERNAL',
  departmentId: 'TECH',
  ownerId: 'user-1',
  ownerEmail: 'user@example.com',
  sizeBytes: 1024,
  currentVersion: 1,
  status: 'SCANNING',
  updatedAt: '2026-06-20T06:30:28.640Z',
};

describe('listDocumentsByDepartment', () => {
  it('query GSI1 theo phòng ban và trả tài liệu hợp lệ', async () => {
    const send = vi.fn().mockResolvedValue({ Items: [marshall(documentRecord)] });

    const items = await listDocumentsByDepartment('TECH', {
      dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
      tableName: 'dms-test',
    });

    expect(items).toEqual([expect.objectContaining({ documentId: 'document-1', status: 'SCANNING' })]);
    const command = send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      TableName: 'dms-test',
      IndexName: 'gsi1',
      ScanIndexForward: false,
      Limit: 50,
      ExpressionAttributeValues: {
        ':department': { S: 'DEPT#TECH' },
        ':documentType': { S: 'Document' },
      },
    });
  });

  it('bỏ qua bản ghi sai cấu trúc', async () => {
    const send = vi.fn().mockResolvedValue({
      Items: [marshall(documentRecord), marshall({ ...documentRecord, status: 'UNKNOWN' })],
    });

    const items = await listDocumentsByDepartment('TECH', {
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

    const items = await listDocumentsByDepartment('TECH', {
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

    const [item] = await listDocumentsByDepartment('TECH', {
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
