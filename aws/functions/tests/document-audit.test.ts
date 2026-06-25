import { GetItemCommand, QueryCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { listDocumentAuditEvents } from '../src/services/document-audit.js';

const documentRecord = {
  pk: 'DOC#document-1',
  sk: 'META',
  entityType: 'Document',
  documentId: 'document-1',
  title: 'Báo cáo',
  originalFileName: 'bao-cao.pdf',
  contentType: 'application/pdf',
  classification: 'INTERNAL',
  departmentId: 'TECH',
  ownerId: 'owner-1',
  ownerEmail: 'owner@example.com',
  accessScope: 'DEPARTMENT',
  sizeBytes: 1000,
  currentVersion: 1,
  status: 'READY',
  createdAt: '2026-06-25T01:00:00.000Z',
  updatedAt: '2026-06-25T01:05:00.000Z',
};

const auditRecord = {
  pk: 'DOC#document-1',
  sk: 'AUDIT#2026-06-25T01:05:00.000Z#event-1',
  entityType: 'AuditLog',
  eventId: 'event-1',
  action: 'DOCUMENT_READY',
  actorType: 'SYSTEM',
  actorId: 'upload-processor',
  source: 'UPLOAD_PROCESSOR',
  outcome: 'SUCCESS',
  documentId: 'document-1',
  versionNumber: 1,
  occurredAt: '2026-06-25T01:05:00.000Z',
};

describe('listDocumentAuditEvents', () => {
  it('trả lịch sử audit cho owner', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Item: marshall(documentRecord) })
      .mockResolvedValueOnce({ Items: [marshall(auditRecord)] });

    await expect(
      listDocumentAuditEvents(
        'document-1',
        { userId: 'owner-1', departmentId: 'TECH', roles: ['EMPLOYEE'] },
        { dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>, tableName: 'dms-test' },
      ),
    ).resolves.toEqual([
      expect.objectContaining({ eventId: 'event-1', action: 'DOCUMENT_READY' }),
    ]);

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetItemCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(QueryCommand);
    expect(send.mock.calls[1]?.[0].input).toMatchObject({
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :auditPrefix)',
      ScanIndexForward: false,
      Limit: 50,
    });
  });

  it('trả null cho user có quyền xem tài liệu qua chia sẻ nhưng không được xem audit', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Item: marshall(documentRecord) })
      .mockResolvedValueOnce({
        Item: marshall({
          pk: 'DOC#document-1',
          sk: 'SHARE#DEPT#HR',
          entityType: 'DocumentDepartmentShare',
          status: 'APPROVED',
        }),
      });

    await expect(
      listDocumentAuditEvents(
        'document-1',
        { userId: 'hr-user', departmentId: 'HR', roles: ['EMPLOYEE'] },
        { dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>, tableName: 'dms-test' },
      ),
    ).resolves.toBeNull();

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('cho Department Admin phòng sở hữu xem audit', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Item: marshall(documentRecord) })
      .mockResolvedValueOnce({ Items: [marshall(auditRecord)] });

    await expect(
      listDocumentAuditEvents(
        'document-1',
        { userId: 'tech-admin', departmentId: 'TECH', roles: ['DEPARTMENT_ADMIN'] },
        { dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>, tableName: 'dms-test' },
      ),
    ).resolves.toHaveLength(1);
  });
});
