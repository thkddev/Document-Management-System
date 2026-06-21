import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SNSClient } from '@aws-sdk/client-sns';
import type { SQSBatchResponse, SQSHandler } from 'aws-lambda';
import { processDeadLetterMessage } from '../services/upload-dlq.js';

const dynamodb = new DynamoDBClient({});
const sns = new SNSClient({});

export const handler: SQSHandler = async (event): Promise<SQSBatchResponse> => {
  if (!process.env.TABLE_NAME || !process.env.ALERT_TOPIC_ARN || !process.env.ENVIRONMENT_NAME) {
    throw new Error(
      'DLQ processor chưa được cấu hình TABLE_NAME/ALERT_TOPIC_ARN/ENVIRONMENT_NAME.',
    );
  }

  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
  for (const message of event.Records) {
    try {
      const result = await processDeadLetterMessage(
        {
          messageId: message.messageId,
          body: message.body,
          sentTimestamp: message.attributes.SentTimestamp,
        },
        {
          dynamodb,
          sns,
          tableName: process.env.TABLE_NAME,
          topicArn: process.env.ALERT_TOPIC_ARN,
          environmentName: process.env.ENVIRONMENT_NAME,
        },
      );
      console.info('Processed upload DLQ message', {
        messageId: message.messageId,
        outcome: result.outcome,
        ...('documentId' in result ? { documentId: result.documentId } : {}),
      });
    } catch (err) {
      batchItemFailures.push({ itemIdentifier: message.messageId });
      console.error('Failed to process upload DLQ message', {
        messageId: message.messageId,
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
    }
  }
  return { batchItemFailures };
};
