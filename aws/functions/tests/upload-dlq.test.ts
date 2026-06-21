import { GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { PublishCommand } from '@aws-sdk/client-sns';
import { marshall } from '@aws-sdk/util-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { processDeadLetterMessage } from '../src/services/upload-dlq.js';

function s3Body(documentId = 'document-1'): string {
  return JSON.stringify({
    Records: [
      {
        s3: {
          object: {
            key: `quarantine/TECH/user-1/${documentId}/v000001-secret.pdf`,
          },
        },
      },
    ],
  });
}

function createDeps(status = 'SCANNING') {
  const dynamodbSend = vi.fn(async (command) => {
    if (command instanceof GetItemCommand) {
      return {
        Item: marshall({
          pk: 'DOC#document-1',
          sk: 'META',
          documentId: 'document-1',
          status,
          currentVersion: 1,
        }),
      };
    }
    if (command instanceof UpdateItemCommand || command instanceof PutItemCommand) {
      return {};
    }
    throw new Error(`Unexpected DynamoDB command ${command.constructor.name}`);
  });
  const snsSend = vi.fn(async (command) => {
    if (command instanceof PublishCommand) return {};
    throw new Error(`Unexpected SNS command ${command.constructor.name}`);
  });

  return {
    deps: {
      dynamodb: { send: dynamodbSend },
      sns: { send: snsSend },
      tableName: 'dms-test',
      topicArn: 'arn:aws:sns:ap-southeast-1:123456789012:alerts',
      environmentName: 'test',
      now: () => new Date('2026-06-21T01:00:00.000Z'),
    },
    dynamodbSend,
    snsSend,
  };
}

describe('processDeadLetterMessage', () => {
  it('marks a pending document FAILED, writes audit, and sends a safe alert', async () => {
    const { deps, dynamodbSend, snsSend } = createDeps();

    const result = await processDeadLetterMessage(
      {
        messageId: 'message-1',
        body: s3Body(),
        sentTimestamp: '1782003600000',
      },
      deps,
    );

    expect(result).toEqual({ outcome: 'FAILED', documentId: 'document-1' });
    expect(dynamodbSend).toHaveBeenCalledWith(expect.any(UpdateItemCommand));
    expect(dynamodbSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Item: expect.objectContaining({
            action: { S: 'MESSAGE_DEAD_LETTERED' },
            messageId: { S: 'message-1' },
          }),
        }),
      }),
    );

    const publish = snsSend.mock.calls[0]?.[0] as PublishCommand;
    expect(JSON.parse(publish.input.Message ?? '{}')).toEqual({
      environment: 'test',
      messageId: 'message-1',
      outcome: 'MESSAGE_DEAD_LETTERED',
      documentId: 'document-1',
    });
    expect(publish.input.Message).not.toContain('secret.pdf');
    expect(publish.input.Message).not.toContain('quarantine/');
  });

  it('does not overwrite a terminal document but still records the DLQ event', async () => {
    const { deps, dynamodbSend } = createDeps('READY');

    const result = await processDeadLetterMessage({ messageId: 'message-2', body: s3Body() }, deps);

    expect(result).toEqual({ outcome: 'TERMINAL', documentId: 'document-1' });
    expect(dynamodbSend.mock.calls.some(([command]) => command instanceof UpdateItemCommand)).toBe(
      false,
    );
    expect(dynamodbSend).toHaveBeenCalledWith(expect.any(PutItemCommand));
  });

  it('acknowledges a malformed message after sending an alert without its payload', async () => {
    const { deps, dynamodbSend, snsSend } = createDeps();
    const body = JSON.stringify({ secret: 'do-not-publish' });

    const result = await processDeadLetterMessage({ messageId: 'message-invalid', body }, deps);

    expect(result).toEqual({ outcome: 'MALFORMED' });
    expect(dynamodbSend).not.toHaveBeenCalled();
    const publish = snsSend.mock.calls[0]?.[0] as PublishCommand;
    expect(publish.input.Message).not.toContain('do-not-publish');
  });

  it('throws when SNS is unavailable so SQS can retry the message', async () => {
    const { deps } = createDeps('READY');
    deps.sns.send = vi.fn().mockRejectedValue(new Error('SNS unavailable'));

    await expect(
      processDeadLetterMessage({ messageId: 'message-3', body: s3Body() }, deps),
    ).rejects.toThrow('SNS unavailable');
  });
});
