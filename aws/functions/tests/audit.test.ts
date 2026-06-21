import { PutItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { writeAuditEvent } from '../src/services/audit.js';

const input = {
  documentId: 'document-1',
  versionNumber: 1,
  action: 'DOCUMENT_REJECTED' as const,
  actorType: 'SYSTEM' as const,
  actorId: 'upload-processor',
  source: 'UPLOAD_PROCESSOR' as const,
  outcome: 'REJECTED' as const,
  reason: 'Định dạng file không hợp lệ.',
};

describe('writeAuditEvent', () => {
  it('ghi audit append-only chỉ với các field được phép', async () => {
    const send = vi.fn().mockResolvedValue({});

    await expect(
      writeAuditEvent(input, {
        dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
        tableName: 'dms-test',
        now: () => new Date('2026-06-21T06:00:00.000Z'),
        createId: () => 'event-1',
      }),
    ).resolves.toBe(true);

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutItemCommand);
    expect(command.input.ConditionExpression).toBe(
      'attribute_not_exists(pk) AND attribute_not_exists(sk)',
    );
    const item = unmarshall(command.input.Item ?? {});
    expect(item).toMatchObject({
      pk: 'DOC#document-1',
      sk: 'AUDIT#2026-06-21T06:00:00.000Z#event-1',
      entityType: 'AuditLog',
      schemaVersion: 1,
      action: 'DOCUMENT_REJECTED',
    });
    expect(item).not.toHaveProperty('token');
    expect(item).not.toHaveProperty('uploadUrl');
    expect(item).not.toHaveProperty('checksumSha256');
    expect(item).not.toHaveProperty('objectKey');
  });

  it('coi conditional conflict là event đã tồn tại', async () => {
    const conflict = new Error('duplicate');
    conflict.name = 'ConditionalCheckFailedException';
    const send = vi.fn().mockRejectedValue(conflict);

    await expect(
      writeAuditEvent(input, {
        dynamodb: { send } as unknown as Pick<DynamoDBClient, 'send'>,
        tableName: 'dms-test',
      }),
    ).resolves.toBe(false);
  });
});
