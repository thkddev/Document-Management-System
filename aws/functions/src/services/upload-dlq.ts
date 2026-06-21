import { GetItemCommand, UpdateItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PublishCommand, type SNSClient } from '@aws-sdk/client-sns';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { writeAuditEvent } from './audit.js';

const terminalStatuses = new Set(['READY', 'REJECTED', 'INFECTED', 'FAILED']);
const deadLetterReason = 'Quá số lần xử lý tự động; job đã được chuyển vào DLQ.';

export interface ProcessDeadLetterInput {
  messageId: string;
  body: string;
  sentTimestamp?: string;
}

export interface ProcessDeadLetterDeps {
  dynamodb: Pick<DynamoDBClient, 'send'>;
  sns: Pick<SNSClient, 'send'>;
  tableName: string;
  topicArn: string;
  environmentName: string;
  now?: () => Date;
}

export type DeadLetterResult =
  | { outcome: 'FAILED'; documentId: string }
  | { outcome: 'TERMINAL'; documentId: string }
  | { outcome: 'NOT_FOUND'; documentId: string }
  | { outcome: 'MALFORMED' };

function documentIdFromBody(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { Records?: Array<{ s3?: { object?: { key?: string } } }> };
    const rawKey = parsed.Records?.[0]?.s3?.object?.key;
    if (!rawKey) return null;
    const objectKey = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    const parts = objectKey.split('/');
    return parts.length >= 5 && parts[0] === 'quarantine' && parts[3] ? parts[3] : null;
  } catch {
    return null;
  }
}

function stableOccurredAt(sentTimestamp: string | undefined, now: () => Date): string {
  const milliseconds = Number(sentTimestamp);
  return Number.isFinite(milliseconds) && milliseconds > 0
    ? new Date(milliseconds).toISOString()
    : now().toISOString();
}

async function publishAlert(
  input: ProcessDeadLetterInput,
  deps: ProcessDeadLetterDeps,
  documentId?: string,
): Promise<void> {
  const message: Record<string, string> = {
    environment: deps.environmentName,
    messageId: input.messageId,
    outcome: documentId ? 'MESSAGE_DEAD_LETTERED' : 'MALFORMED_DLQ_MESSAGE',
  };
  if (documentId) message.documentId = documentId;

  await deps.sns.send(
    new PublishCommand({
      TopicArn: deps.topicArn,
      Subject: `[DMS ${deps.environmentName}] Upload job cần kiểm tra`,
      Message: JSON.stringify(message),
    }),
  );
}

export async function processDeadLetterMessage(
  input: ProcessDeadLetterInput,
  deps: ProcessDeadLetterDeps,
): Promise<DeadLetterResult> {
  const documentId = documentIdFromBody(input.body);
  if (!documentId) {
    await publishAlert(input, deps);
    return { outcome: 'MALFORMED' };
  }

  const response = await deps.dynamodb.send(
    new GetItemCommand({
      TableName: deps.tableName,
      Key: { pk: { S: `DOC#${documentId}` }, sk: { S: 'META' } },
    }),
  );
  if (!response.Item) {
    await publishAlert(input, deps, documentId);
    return { outcome: 'NOT_FOUND', documentId };
  }

  const document = unmarshall(response.Item);
  const status = typeof document.status === 'string' ? document.status : '';
  const versionNumber = typeof document.currentVersion === 'number' ? document.currentVersion : 1;
  let outcome: DeadLetterResult['outcome'] = 'TERMINAL';
  const occurredAt = stableOccurredAt(input.sentTimestamp, deps.now ?? (() => new Date()));

  if (!terminalStatuses.has(status)) {
    try {
      await deps.dynamodb.send(
        new UpdateItemCommand({
          TableName: deps.tableName,
          Key: { pk: { S: `DOC#${documentId}` }, sk: { S: 'META' } },
          UpdateExpression:
            'SET #status = :failed, #updatedAt = :updatedAt, #failureReason = :reason',
          ConditionExpression:
            '#status <> :ready AND #status <> :rejected AND #status <> :infected AND #status <> :alreadyFailed',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#updatedAt': 'updatedAt',
            '#failureReason': 'failureReason',
          },
          ExpressionAttributeValues: {
            ':failed': { S: 'FAILED' },
            ':updatedAt': { S: occurredAt },
            ':reason': { S: deadLetterReason },
            ':ready': { S: 'READY' },
            ':rejected': { S: 'REJECTED' },
            ':infected': { S: 'INFECTED' },
            ':alreadyFailed': { S: 'FAILED' },
          },
        }),
      );
      outcome = 'FAILED';
    } catch (err) {
      if (!(err instanceof Error && err.name === 'ConditionalCheckFailedException')) {
        throw err;
      }
    }
  }

  await writeAuditEvent(
    {
      documentId,
      versionNumber,
      action: 'MESSAGE_DEAD_LETTERED',
      actorType: 'SYSTEM',
      actorId: 'upload-dlq-processor',
      source: 'DLQ_PROCESSOR',
      outcome: 'FAILED',
      eventId: `dlq-${input.messageId}`,
      occurredAt,
      messageId: input.messageId,
      reason: deadLetterReason,
    },
    deps,
  );
  await publishAlert(input, deps, documentId);
  return { outcome, documentId } as DeadLetterResult;
}
