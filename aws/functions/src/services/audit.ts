import { randomUUID } from 'node:crypto';
import { PutItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import type { AuditAction, AuditActorType, AuditOutcome, AuditSource } from '../domain/models.js';

export interface WriteAuditEventInput {
  documentId: string;
  versionNumber: number;
  action: AuditAction;
  actorType: AuditActorType;
  actorId: string;
  source: AuditSource;
  outcome: AuditOutcome;
  eventId?: string;
  occurredAt?: string;
  requestId?: string;
  messageId?: string;
  reason?: string;
  details?: Record<string, string | number | boolean>;
}

export interface AuditDeps {
  dynamodb: Pick<DynamoDBClient, 'send'>;
  tableName: string;
  now?: () => Date;
  createId?: () => string;
}

export async function writeAuditEvent(
  input: WriteAuditEventInput,
  deps: AuditDeps,
): Promise<boolean> {
  const occurredAt = input.occurredAt ?? (deps.now?.() ?? new Date()).toISOString();
  const eventId = input.eventId ?? deps.createId?.() ?? randomUUID();
  const item: Record<string, unknown> = {
    pk: `DOC#${input.documentId}`,
    sk: `AUDIT#${occurredAt}#${eventId}`,
    entityType: 'AuditLog',
    schemaVersion: 1,
    eventId,
    action: input.action,
    actorType: input.actorType,
    actorId: input.actorId,
    source: input.source,
    outcome: input.outcome,
    documentId: input.documentId,
    versionNumber: input.versionNumber,
    occurredAt,
  };
  if (input.requestId) item.requestId = input.requestId;
  if (input.messageId) item.messageId = input.messageId;
  if (input.reason) item.reason = input.reason;
  if (input.details) item.details = input.details;

  try {
    await deps.dynamodb.send(
      new PutItemCommand({
        TableName: deps.tableName,
        Item: marshall(item),
        ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      return false;
    }
    throw err;
  }
}
