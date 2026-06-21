import type { SQSEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const processDeadLetterMessage = vi.fn();

vi.mock('../src/services/upload-dlq.js', () => ({ processDeadLetterMessage }));

const { handler } = await import('../src/handlers/process-upload-dlq.js');

function sqsEvent(messageId: string): SQSEvent {
  return {
    Records: [
      {
        messageId,
        receiptHandle: 'receipt',
        body: '{}',
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '1782003600000',
          SenderId: 'sender',
          ApproximateFirstReceiveTimestamp: '1782003600000',
        },
        messageAttributes: {},
        md5OfBody: 'md5',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:ap-southeast-1:123456789012:upload-dlq',
        awsRegion: 'ap-southeast-1',
      },
    ],
  };
}

describe('process upload DLQ handler', () => {
  beforeEach(() => {
    process.env.TABLE_NAME = 'dms-test';
    process.env.ALERT_TOPIC_ARN = 'arn:aws:sns:ap-southeast-1:123456789012:alerts';
    process.env.ENVIRONMENT_NAME = 'test';
    processDeadLetterMessage.mockReset();
  });

  it('acknowledges a successfully handled dead letter', async () => {
    processDeadLetterMessage.mockResolvedValue({
      outcome: 'FAILED',
      documentId: 'document-1',
    });

    const response = await handler(sqsEvent('message-1'), {} as never, () => undefined);

    expect(response).toEqual({ batchItemFailures: [] });
    expect(processDeadLetterMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'message-1',
        sentTimestamp: '1782003600000',
      }),
      expect.any(Object),
    );
  });

  it('returns only a transiently failed message for retry', async () => {
    processDeadLetterMessage.mockRejectedValue(new Error('DynamoDB unavailable'));

    const response = await handler(sqsEvent('message-2'), {} as never, () => undefined);

    expect(response).toEqual({
      batchItemFailures: [{ itemIdentifier: 'message-2' }],
    });
  });
});
