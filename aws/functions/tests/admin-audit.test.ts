import { PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { listAdminAuditEvents, writeAdminAuditEvent } from '../src/services/admin-audit.js';
import { AdminUsersForbiddenError } from '../src/services/admin-users.js';

describe('admin audit service', () => {
  it('ghi audit thao tác quản trị user không chứa dữ liệu nhạy cảm', async () => {
    const send = vi.fn(async () => ({}));

    await expect(
      writeAdminAuditEvent(
        {
          action: 'ADMIN_USER_PASSWORD_RESET',
          actor: {
            userId: 'admin-1',
            email: 'admin@example.com',
            departmentId: 'TECH',
            roles: ['SYSTEM_ADMIN'],
          },
          targetEmail: 'user@example.com',
          outcome: 'SUCCESS',
          requestId: 'request-1',
        },
        {
          dynamodb: { send } as never,
          tableName: 'dms-dev',
          now: () => new Date('2026-07-01T05:00:00.000Z'),
          createId: () => 'event-1',
        },
      ),
    ).resolves.toBe(true);

    const command = (send.mock.calls as unknown as [[PutItemCommand]])[0]?.[0];
    expect(command).toBeInstanceOf(PutItemCommand);
    if (!command) throw new Error('PutItemCommand was not sent');
    const item = unmarshall(command.input.Item ?? {});
    expect(item).toMatchObject({
      pk: 'ADMIN_AUDIT',
      sk: 'AUDIT#2026-07-01T05:00:00.000Z#event-1',
      action: 'ADMIN_USER_PASSWORD_RESET',
      actorEmail: 'admin@example.com',
      targetEmail: 'user@example.com',
      outcome: 'SUCCESS',
    });
    expect(item).not.toHaveProperty('password');
    expect(item).not.toHaveProperty('token');
  });

  it('liệt kê 10 audit gần nhất cho System Admin', async () => {
    const send = vi.fn(async () => ({
      Items: [
        {
          eventId: { S: 'event-1' },
          action: { S: 'ADMIN_USER_CREATED' },
          actorId: { S: 'admin-1' },
          actorEmail: { S: 'admin@example.com' },
          targetEmail: { S: 'user@example.com' },
          targetDepartmentId: { S: 'TECH' },
          targetRoles: { L: [{ S: 'EMPLOYEE' }] },
          outcome: { S: 'SUCCESS' },
          occurredAt: { S: '2026-07-01T05:00:00.000Z' },
          requestId: { S: 'request-1' },
        },
      ],
    }));

    await expect(
      listAdminAuditEvents(
        { userId: 'admin-1', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
        { dynamodb: { send } as never, tableName: 'dms-dev' },
      ),
    ).resolves.toEqual({
      items: [
        {
          eventId: 'event-1',
          action: 'ADMIN_USER_CREATED',
          actorId: 'admin-1',
          actorEmail: 'admin@example.com',
          targetEmail: 'user@example.com',
          targetDepartmentId: 'TECH',
          targetRoles: ['EMPLOYEE'],
          outcome: 'SUCCESS',
          occurredAt: '2026-07-01T05:00:00.000Z',
          requestId: 'request-1',
        },
      ],
    });

    const command = (send.mock.calls as unknown as [[QueryCommand]])[0]?.[0];
    expect(command).toBeInstanceOf(QueryCommand);
    if (!command) throw new Error('QueryCommand was not sent');
    expect(command.input).toMatchObject({ ScanIndexForward: false, Limit: 10 });
  });

  it('lá»c audit theo query/action/outcome vÃ  tráº£ next cursor khi cÃ²n trang sau', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [
          {
            eventId: { S: 'event-1' },
            action: { S: 'ADMIN_USER_CREATED' },
            actorId: { S: 'admin-1' },
            targetEmail: { S: 'other@example.com' },
            outcome: { S: 'SUCCESS' },
            occurredAt: { S: '2026-07-01T05:00:00.000Z' },
          },
        ],
        LastEvaluatedKey: {
          pk: { S: 'ADMIN_AUDIT' },
          sk: { S: 'AUDIT#2026-07-01T05:00:00.000Z#event-1' },
        },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            eventId: { S: 'event-2' },
            action: { S: 'ADMIN_USER_DISABLED' },
            actorId: { S: 'admin-1' },
            actorEmail: { S: 'admin@example.com' },
            targetEmail: { S: 'target@example.com' },
            outcome: { S: 'SUCCESS' },
            occurredAt: { S: '2026-07-01T05:01:00.000Z' },
          },
        ],
        LastEvaluatedKey: {
          pk: { S: 'ADMIN_AUDIT' },
          sk: { S: 'AUDIT#2026-07-01T05:01:00.000Z#event-2' },
        },
      });

    const result = await listAdminAuditEvents(
      { userId: 'admin-1', departmentId: 'TECH', roles: ['SYSTEM_ADMIN'] },
      { dynamodb: { send } as never, tableName: 'dms-dev' },
      {
        query: 'target',
        action: 'ADMIN_USER_DISABLED',
        outcome: 'SUCCESS',
        limit: 1,
      },
    );

    expect(result.items).toEqual([
      {
        eventId: 'event-2',
        action: 'ADMIN_USER_DISABLED',
        actorId: 'admin-1',
        actorEmail: 'admin@example.com',
        targetEmail: 'target@example.com',
        outcome: 'SUCCESS',
        occurredAt: '2026-07-01T05:01:00.000Z',
      },
    ]);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(send).toHaveBeenCalledTimes(2);
    const secondCommand = (send.mock.calls as unknown as [[QueryCommand], [QueryCommand]])[1]?.[0];
    expect(secondCommand.input.ExclusiveStartKey).toEqual({
      pk: { S: 'ADMIN_AUDIT' },
      sk: { S: 'AUDIT#2026-07-01T05:00:00.000Z#event-1' },
    });
  });

  it('từ chối user không phải System Admin', async () => {
    await expect(
      listAdminAuditEvents(
        { userId: 'user-1', departmentId: 'TECH', roles: ['EMPLOYEE'] },
        { dynamodb: { send: vi.fn() } as never, tableName: 'dms-dev' },
      ),
    ).rejects.toBeInstanceOf(AdminUsersForbiddenError);
  });
});
