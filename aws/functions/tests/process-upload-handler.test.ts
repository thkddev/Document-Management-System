import type { SQSEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const processUploadedObject = vi.fn();

vi.mock('../src/services/upload-processor.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  processUploadedObject,
}));

const { handler } = await import('../src/handlers/process-upload.js');

function sqsEvent(messageId: string, objectKey: string): SQSEvent {
  return {
    Records: [
      {
        messageId,
        receiptHandle: 'receipt',
        body: JSON.stringify({
          Records: [
            {
              s3: {
                bucket: { name: 'quarantine-test' },
                object: { key: objectKey },
              },
            },
          ],
        }),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '0',
          SenderId: 'sender',
          ApproximateFirstReceiveTimestamp: '0',
        },
        messageAttributes: {},
        md5OfBody: 'md5',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:ap-southeast-1:123456789012:upload-queue',
        awsRegion: 'ap-southeast-1',
      },
    ],
  };
}

function sqsEventWithBody(messageId: string, body: unknown): SQSEvent {
  const event = sqsEvent(messageId, 'unused.pdf');
  event.Records[0]!.body = JSON.stringify(body);
  return event;
}

describe('process upload SQS handler', () => {
  beforeEach(() => {
    process.env.TABLE_NAME = 'dms-test';
    process.env.DOCUMENTS_BUCKET_NAME = 'documents-test';
    processUploadedObject.mockReset();
  });

  it('acknowledges a successful S3 upload message and decodes the object key', async () => {
    processUploadedObject.mockResolvedValue({ documentId: 'document-1', status: 'READY' });

    const response = await handler(
      sqsEvent('message-1', 'quarantine%2FTECH%2Fuser-1%2Fdocument-1%2Ffile+name.pdf'),
      {} as never,
      () => undefined,
    );

    expect(response).toEqual({ batchItemFailures: [] });
    expect(processUploadedObject).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketName: 'quarantine-test',
        objectKey: 'quarantine/TECH/user-1/document-1/file name.pdf',
      }),
      expect.any(Object),
    );
  });

  it('returns only the failed message so SQS can retry it', async () => {
    processUploadedObject.mockRejectedValue(new Error('GuardDuty scan pending'));

    const response = await handler(
      sqsEvent('message-2', 'quarantine%2FTECH%2Fuser-1%2Fdocument-1%2Ffile.pdf'),
      {} as never,
      () => undefined,
    );

    expect(response).toEqual({
      batchItemFailures: [{ itemIdentifier: 'message-2' }],
    });
  });

  it('acknowledges and ignores the S3 notification test event', async () => {
    const response = await handler(
      sqsEventWithBody('message-test', {
        Service: 'Amazon S3',
        Event: 's3:TestEvent',
        Bucket: 'quarantine-test',
      }),
      {} as never,
      () => undefined,
    );

    expect(response).toEqual({ batchItemFailures: [] });
    expect(processUploadedObject).not.toHaveBeenCalled();
  });

  it('sends a malformed non-test message through the retry and DLQ path', async () => {
    const response = await handler(
      sqsEventWithBody('message-invalid', { Event: 'unknown' }),
      {} as never,
      () => undefined,
    );

    expect(response).toEqual({
      batchItemFailures: [{ itemIdentifier: 'message-invalid' }],
    });
    expect(processUploadedObject).not.toHaveBeenCalled();
  });
});
