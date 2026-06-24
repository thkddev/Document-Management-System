import { GetItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { getDocumentDetail } from '../src/services/document-access.js';

const record = {
  pk: 'DOC#document-1',
  sk: 'META',
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
  checksumSha256: 'secret',
};

function deps(item: Record<string, unknown> | null = record) {
  const send = vi.fn().mockResolvedValue({ Item: item ? marshall(item) : undefined });
  return {
    dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
    tableName: 'dms-test',
  };
}

describe('getDocumentDetail', () => {
  it.each([
    ['owner', { userId: 'owner-1', departmentId: 'OTHER', roles: [] }],
    ['người cùng phòng ban', { userId: 'user-2', departmentId: 'TECH', roles: [] }],
    [
      'System Admin',
      { userId: 'admin-1', departmentId: 'ADMIN', roles: ['SYSTEM_ADMIN' as const] },
    ],
  ])('cho phép %s xem metadata an toàn', async (_label, principal) => {
    const result = await getDocumentDetail('document-1', principal, deps());

    expect(result).toMatchObject({
      documentId: 'document-1',
      accessScope: 'DEPARTMENT',
      status: 'READY',
    });
    expect(result).not.toHaveProperty('cleanObjectKey');
    expect(result).not.toHaveProperty('checksumSha256');
  });

  it('ẩn tài liệu phòng ban khác', async () => {
    await expect(
      getDocumentDetail(
        'document-1',
        { userId: 'user-3', departmentId: 'HR', roles: ['DEPARTMENT_ADMIN'] },
        deps(),
      ),
    ).resolves.toBeNull();
  });

  it('cho phép user khác phòng ban xem tài liệu toàn bộ nhân viên', async () => {
    await expect(
      getDocumentDetail(
        'document-1',
        { userId: 'user-3', departmentId: 'HR', roles: ['EMPLOYEE'] },
        deps({ ...record, accessScope: 'ALL_EMPLOYEES' }),
      ),
    ).resolves.toMatchObject({ documentId: 'document-1', accessScope: 'ALL_EMPLOYEES' });
  });

  it('cho phép user phòng ban nhận xem tài liệu đã được chia sẻ', async () => {
    const send = vi.fn(async (command) => {
      if (!(command instanceof GetItemCommand)) throw new Error('Unexpected command');
      if (command.input.Key?.sk?.S === 'META') return { Item: marshall(record) };
      if (command.input.Key?.sk?.S === 'SHARE#DEPT#HR') {
        return {
          Item: marshall({
            entityType: 'DocumentDepartmentShare',
            documentId: 'document-1',
            targetDepartmentId: 'HR',
            status: 'APPROVED',
          }),
        };
      }
      return {};
    });

    await expect(
      getDocumentDetail(
        'document-1',
        { userId: 'user-3', departmentId: 'HR', roles: ['EMPLOYEE'] },
        {
          dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
          tableName: 'dms-test',
        },
      ),
    ).resolves.toMatchObject({ documentId: 'document-1' });
  });

  it('trả null khi tài liệu không tồn tại', async () => {
    await expect(
      getDocumentDetail(
        'missing',
        { userId: 'owner-1', departmentId: 'TECH', roles: [] },
        deps(null),
      ),
    ).resolves.toBeNull();
  });

  it('cho phép xem trạng thái bị từ chối và trả lý do an toàn', async () => {
    const result = await getDocumentDetail(
      'document-1',
      { userId: 'owner-1', departmentId: 'TECH', roles: [] },
      deps({ ...record, status: 'REJECTED', rejectionReason: 'Định dạng file không hợp lệ.' }),
    );

    expect(result).toMatchObject({
      status: 'REJECTED',
      statusReason: 'Định dạng file không hợp lệ.',
    });
  });

  it('từ chối record malformed thay vì trả dữ liệu một phần', async () => {
    const malformed = { ...record } as Record<string, unknown>;
    delete malformed.contentType;
    await expect(
      getDocumentDetail(
        'document-1',
        { userId: 'owner-1', departmentId: 'TECH', roles: [] },
        deps(malformed),
      ),
    ).rejects.toThrow('contentType');
  });
});
