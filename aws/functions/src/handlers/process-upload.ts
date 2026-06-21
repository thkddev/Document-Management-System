import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import type { S3Event, SQSBatchResponse, SQSHandler } from 'aws-lambda';
import {
  MalwareScanPendingError,
  processUploadedObject,
} from '../services/upload-processor.js';

const dynamodb = new DynamoDBClient({});
const s3 = new S3Client({});

function decodeS3Key(key: string): string {
  return decodeURIComponent(key.replace(/\+/g, ' '));
}

function parseS3Event(body: string): S3Event | null {
  const parsed: unknown = JSON.parse(body);
  if (
    parsed &&
    typeof parsed === 'object' &&
    'Event' in parsed &&
    parsed.Event === 's3:TestEvent'
  ) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !('Records' in parsed)) {
    throw new Error('SQS message không chứa S3 event hợp lệ.');
  }
  return parsed as S3Event;
}

export const handler: SQSHandler = async (event): Promise<SQSBatchResponse> => {
  if (!process.env.TABLE_NAME || !process.env.DOCUMENTS_BUCKET_NAME) {
    throw new Error('Upload processor chưa được cấu hình TABLE_NAME/DOCUMENTS_BUCKET_NAME.');
  }

  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
  for (const message of event.Records) {
    try {
      const s3Event = parseS3Event(message.body);
      if (!s3Event) {
        console.info('Ignored S3 test event', { messageId: message.messageId });
        continue;
      }
      for (const record of s3Event.Records) {
        const bucketName = record.s3.bucket.name;
        const objectKey = decodeS3Key(record.s3.object.key);
        const result = await processUploadedObject(
          { bucketName, objectKey },
          {
            dynamodb,
            s3,
            tableName: process.env.TABLE_NAME,
            documentsBucketName: process.env.DOCUMENTS_BUCKET_NAME,
          },
        );
        console.info('Processed uploaded object', { bucketName, objectKey, result });
      }
    } catch (err) {
      batchItemFailures.push({ itemIdentifier: message.messageId });
      if (err instanceof MalwareScanPendingError) {
        console.info('GuardDuty scan is pending; SQS will retry', {
          messageId: message.messageId,
          reason: err.message,
        });
      } else {
        console.error('Failed to process SQS upload message', {
          messageId: message.messageId,
          err,
        });
      }
    }
  }

  return { batchItemFailures };
};
