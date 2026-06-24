import {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentPrincipal } from '../src/domain/models.js';
import {
  approveShareRequest,
  createDepartmentShare,
  DocumentShareConflictError,
  listPendingShareRequests,
  rejectShareRequest,
} from '../src/services/document-sharing.js';

const documentRecord = {
  pk: 'DOC#document-1',
  sk: 'META',
  entityType: 'Document',
  documentId: 'document-1',
  title: 'Quy trình kỹ thuật',
  originalFileName: 'quy-trinh.pdf',
  contentType: 'application/pdf',
  classification: 'INTERNAL',
  departmentId: 'TECH',
  ownerId: 'owner-1',
  ownerEmail: 'owner@example.com',
  sizeBytes: 1024,
  currentVersion: 1,
  status: 'READY',
  createdAt: '2026-06-24T01:00:00.000Z',
  updatedAt: '2026-06-24T01:00:00.000Z',
};

const principal: DocumentPrincipal = {
  userId: 'owner-1',
  email: 'owner@example.com',
  departmentId: 'TECH',
  roles: ['EMPLOYEE'],
};

const depsBase = {
  tableName: 'dms-test',
  requestId: 'request-1',
  now: () => new Date('2026-06-24T02:00:00.000Z'),
  createId: () => 'share-request-1',
};

describe('document sharing', () => {
  it('cấp quyền chia sẻ trực tiếp cho tài liệu PUBLIC/INTERNAL', async () => {
    const send = vi.fn(async (command) => {
      if (command instanceof GetItemCommand && command.input.Key?.sk?.S === 'META') {
        return { Item: marshall(documentRecord) };
      }
      if (command instanceof GetItemCommand) return {};
      if (command instanceof PutItemCommand) return {};
      throw new Error(`Unexpected command ${command.constructor.name}`);
    });

    const result = await createDepartmentShare('document-1', 'HR', principal, {
      ...depsBase,
      dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
    });

    expect(result).toEqual({
      mode: 'GRANTED',
      documentId: 'document-1',
      targetDepartmentId: 'HR',
    });
    const sharePut = send.mock.calls
      .map(([command]) => command)
      .find(
        (command) =>
          command instanceof PutItemCommand &&
          command.input.Item?.entityType?.S === 'DocumentDepartmentShare',
      );
    expect(sharePut).toBeInstanceOf(PutItemCommand);
    expect(unmarshall(sharePut.input.Item ?? {})).toMatchObject({
      pk: 'DOC#document-1',
      sk: 'SHARE#DEPT#HR',
      status: 'APPROVED',
      gsi3pk: 'PRINCIPAL#DEPT#HR',
    });
  });

  it('tạo yêu cầu chờ duyệt cho tài liệu CONFIDENTIAL/RESTRICTED', async () => {
    const send = vi.fn(async (command) => {
      if (command instanceof GetItemCommand && command.input.Key?.sk?.S === 'META') {
        return { Item: marshall({ ...documentRecord, classification: 'CONFIDENTIAL' }) };
      }
      if (command instanceof GetItemCommand) return {};
      if (command instanceof PutItemCommand) return {};
      throw new Error(`Unexpected command ${command.constructor.name}`);
    });

    const result = await createDepartmentShare('document-1', 'HR', principal, {
      ...depsBase,
      dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
    });

    expect(result).toEqual({
      mode: 'PENDING_APPROVAL',
      documentId: 'document-1',
      targetDepartmentId: 'HR',
      shareRequestId: 'share-request-1',
    });
    const requestPut = send.mock.calls
      .map(([command]) => command)
      .find(
        (command) =>
          command instanceof PutItemCommand &&
          command.input.Item?.entityType?.S === 'DocumentDepartmentShareRequest',
      );
    expect(unmarshall(requestPut.input.Item ?? {})).toMatchObject({
      pk: 'SHARE_REQUEST#share-request-1',
      status: 'PENDING',
      gsi3pk: 'SHARE_REVIEW#DEPT#TECH#PENDING',
    });
  });

  it('không tạo trùng yêu cầu đang chờ duyệt', async () => {
    const send = vi.fn(async (command) => {
      if (command instanceof GetItemCommand && command.input.Key?.sk?.S === 'META') {
        return { Item: marshall({ ...documentRecord, classification: 'CONFIDENTIAL' }) };
      }
      if (
        command instanceof GetItemCommand &&
        command.input.Key?.sk?.S === 'SHARE_REQUEST#DEPT#HR'
      ) {
        return {
          Item: marshall({
            entityType: 'DocumentDepartmentShareRequestPointer',
            status: 'PENDING',
          }),
        };
      }
      return {};
    });

    await expect(
      createDepartmentShare('document-1', 'HR', principal, {
        ...depsBase,
        dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
      }),
    ).rejects.toBeInstanceOf(DocumentShareConflictError);
  });

  it('Department Admin phòng sở hữu duyệt được yêu cầu chia sẻ', async () => {
    const send = vi.fn(async (command) => {
      if (
        command instanceof GetItemCommand &&
        command.input.Key?.pk?.S === 'SHARE_REQUEST#request-1'
      ) {
        return {
          Item: marshall({
            entityType: 'DocumentDepartmentShareRequest',
            shareRequestId: 'request-1',
            documentId: 'document-1',
            title: 'Lương thưởng',
            classification: 'CONFIDENTIAL',
            sourceDepartmentId: 'TECH',
            targetDepartmentId: 'HR',
            status: 'PENDING',
            requestedBy: 'owner-1',
            requestedByEmail: 'owner@example.com',
            createdAt: '2026-06-24T01:00:00.000Z',
          }),
        };
      }
      if (command instanceof GetItemCommand && command.input.Key?.sk?.S === 'META') {
        return { Item: marshall({ ...documentRecord, classification: 'CONFIDENTIAL' }) };
      }
      if (command instanceof PutItemCommand || command instanceof UpdateItemCommand) return {};
      throw new Error(`Unexpected command ${command.constructor.name}`);
    });

    const result = await approveShareRequest(
      'request-1',
      { userId: 'admin-1', departmentId: 'TECH', roles: ['DEPARTMENT_ADMIN'] },
      {
        ...depsBase,
        dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
      },
    );

    expect(result).toEqual({ shareRequestId: 'request-1', status: 'APPROVED' });
    expect(send.mock.calls.some(([command]) => command instanceof PutItemCommand)).toBe(true);
    expect(send.mock.calls.some(([command]) => command instanceof UpdateItemCommand)).toBe(true);
  });

  it('Department Admin phòng nhận không duyệt được yêu cầu chia sẻ', async () => {
    const send = vi.fn(async (command) => {
      if (
        command instanceof GetItemCommand &&
        command.input.Key?.pk?.S === 'SHARE_REQUEST#request-1'
      ) {
        return {
          Item: marshall({
            entityType: 'DocumentDepartmentShareRequest',
            shareRequestId: 'request-1',
            documentId: 'document-1',
            title: 'Lương thưởng',
            classification: 'CONFIDENTIAL',
            sourceDepartmentId: 'TECH',
            targetDepartmentId: 'HR',
            status: 'PENDING',
            requestedBy: 'owner-1',
            requestedByEmail: 'owner@example.com',
            createdAt: '2026-06-24T01:00:00.000Z',
          }),
        };
      }
      if (command instanceof GetItemCommand && command.input.Key?.sk?.S === 'META') {
        return { Item: marshall({ ...documentRecord, classification: 'CONFIDENTIAL' }) };
      }
      return {};
    });

    await expect(
      approveShareRequest(
        'request-1',
        { userId: 'hr-admin', departmentId: 'HR', roles: ['DEPARTMENT_ADMIN'] },
        {
          ...depsBase,
          dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
        },
      ),
    ).rejects.toThrow('Không tìm thấy');
  });

  it('liệt kê yêu cầu đang chờ duyệt cho Department Admin', async () => {
    const send = vi.fn(async (command) => {
      if (command instanceof QueryCommand) {
        return {
          Items: [
            marshall({
              entityType: 'DocumentDepartmentShareRequest',
              shareRequestId: 'request-1',
              documentId: 'document-1',
              title: 'Lương thưởng',
              classification: 'CONFIDENTIAL',
              sourceDepartmentId: 'TECH',
              targetDepartmentId: 'HR',
              status: 'PENDING',
              requestedByEmail: 'owner@example.com',
              createdAt: '2026-06-24T01:00:00.000Z',
            }),
          ],
        };
      }
      throw new Error(`Unexpected command ${command.constructor.name}`);
    });

    const items = await listPendingShareRequests(
      { userId: 'admin-1', departmentId: 'TECH', roles: ['DEPARTMENT_ADMIN'] },
      {
        ...depsBase,
        dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
      },
    );

    expect(items).toEqual([expect.objectContaining({ shareRequestId: 'request-1' })]);
  });

  it('bắt buộc nhập lý do khi từ chối', async () => {
    await expect(
      rejectShareRequest(
        'request-1',
        '',
        { userId: 'admin-1', departmentId: 'TECH', roles: ['DEPARTMENT_ADMIN'] },
        {
          ...depsBase,
          dynamodb: { send: vi.fn() } as unknown as Pick<DynamoDBClient, 'send'>,
        },
      ),
    ).rejects.toThrow('lý do');
  });
});
