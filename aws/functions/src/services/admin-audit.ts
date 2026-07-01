import { randomUUID } from 'node:crypto';
import { PutItemCommand, QueryCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type {
  AdminAuditAction,
  AdminAuditEvent,
  AuditOutcome,
  DocumentPrincipal,
  UserRole,
} from '../domain/models.js';
import { AdminUsersForbiddenError, canListAdminUsers } from './admin-users.js';

const ADMIN_AUDIT_PK = 'ADMIN_AUDIT';

export interface WriteAdminAuditEventInput {
  action: AdminAuditAction;
  actor: DocumentPrincipal;
  targetEmail: string;
  targetDepartmentId?: string;
  targetRoles?: UserRole[];
  outcome?: AuditOutcome;
  eventId?: string;
  occurredAt?: string;
  requestId?: string;
}

export interface AdminAuditDeps {
  dynamodb: Pick<DynamoDBClient, 'send'>;
  tableName: string;
  now?: () => Date;
  createId?: () => string;
}

export async function writeAdminAuditEvent(
  input: WriteAdminAuditEventInput,
  deps: AdminAuditDeps,
): Promise<boolean> {
  const occurredAt = input.occurredAt ?? (deps.now?.() ?? new Date()).toISOString();
  const eventId = input.eventId ?? deps.createId?.() ?? randomUUID();
  const item: Record<string, unknown> = {
    pk: ADMIN_AUDIT_PK,
    sk: `AUDIT#${occurredAt}#${eventId}`,
    entityType: 'AdminAuditLog',
    schemaVersion: 1,
    eventId,
    action: input.action,
    actorId: input.actor.userId,
    targetEmail: input.targetEmail,
    outcome: input.outcome ?? 'SUCCESS',
    occurredAt,
  };
  if (input.actor.email) item.actorEmail = input.actor.email;
  if (input.targetDepartmentId) item.targetDepartmentId = input.targetDepartmentId;
  if (input.targetRoles) item.targetRoles = input.targetRoles;
  if (input.requestId) item.requestId = input.requestId;

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

export async function listAdminAuditEvents(
  principal: DocumentPrincipal,
  deps: AdminAuditDeps,
): Promise<AdminAuditEvent[]> {
  if (!canListAdminUsers(principal)) {
    throw new AdminUsersForbiddenError();
  }

  const response = await deps.dynamodb.send(
    new QueryCommand({
      TableName: deps.tableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :auditPrefix)',
      ExpressionAttributeValues: marshall({
        ':pk': ADMIN_AUDIT_PK,
        ':auditPrefix': 'AUDIT#',
      }),
      ScanIndexForward: false,
      Limit: 10,
    }),
  );

  return (response.Items ?? []).map((item) => toAdminAuditEvent(unmarshall(item)));
}

function toAdminAuditEvent(item: Record<string, unknown>): AdminAuditEvent {
  const event: AdminAuditEvent = {
    eventId: String(item.eventId ?? ''),
    action: item.action as AdminAuditAction,
    actorId: String(item.actorId ?? ''),
    targetEmail: String(item.targetEmail ?? ''),
    outcome: item.outcome as AuditOutcome,
    occurredAt: String(item.occurredAt ?? ''),
  };
  if (typeof item.actorEmail === 'string') event.actorEmail = item.actorEmail;
  if (typeof item.targetDepartmentId === 'string') event.targetDepartmentId = item.targetDepartmentId;
  if (Array.isArray(item.targetRoles)) {
    event.targetRoles = item.targetRoles.filter((role): role is UserRole => typeof role === 'string') as UserRole[];
  }
  if (typeof item.requestId === 'string') event.requestId = item.requestId;
  return event;
}
