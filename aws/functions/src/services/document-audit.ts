import { QueryCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import {
  auditActions,
  type AuditAction,
  type AuditActorType,
  type AuditOutcome,
  type AuditSource,
  type DocumentAuditEvent,
  type DocumentDetail,
  type DocumentPrincipal,
} from '../domain/models.js';
import { loadAuthorizedDocument, type DocumentAccessDeps } from './document-access.js';

const auditActorTypes = ['USER', 'SYSTEM'] as const;
const auditSources = ['API', 'UPLOAD_PROCESSOR', 'DLQ_PROCESSOR'] as const;
const auditOutcomes = ['SUCCESS', 'REJECTED', 'FAILED'] as const;

export interface ListDocumentAuditEventsDeps extends DocumentAccessDeps {
  dynamodb: Pick<DynamoDBClient, 'send'>;
}

function stringValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeDetails(value: unknown): Record<string, string | number | boolean> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const details: Record<string, string | number | boolean> = {};
  for (const [key, detailValue] of Object.entries(value)) {
    if (
      typeof detailValue === 'string' ||
      typeof detailValue === 'number' ||
      typeof detailValue === 'boolean'
    ) {
      details[key] = detailValue;
    }
  }
  return Object.keys(details).length > 0 ? details : undefined;
}

function parseAuditEvent(record: Record<string, unknown>): DocumentAuditEvent | null {
  if (record.entityType !== 'AuditLog') return null;
  const eventId = stringValue(record, 'eventId');
  const action = stringValue(record, 'action');
  const actorType = stringValue(record, 'actorType');
  const actorId = stringValue(record, 'actorId');
  const source = stringValue(record, 'source');
  const outcome = stringValue(record, 'outcome');
  const occurredAt = stringValue(record, 'occurredAt');
  const versionNumber = numberValue(record, 'versionNumber');

  if (
    !eventId ||
    !action ||
    !auditActions.includes(action as AuditAction) ||
    !actorType ||
    !auditActorTypes.includes(actorType as AuditActorType) ||
    !actorId ||
    !source ||
    !auditSources.includes(source as AuditSource) ||
    !outcome ||
    !auditOutcomes.includes(outcome as AuditOutcome) ||
    !occurredAt ||
    versionNumber === null
  ) {
    return null;
  }

  const event: DocumentAuditEvent = {
    eventId,
    action: action as AuditAction,
    actorType: actorType as AuditActorType,
    actorId,
    source: source as AuditSource,
    outcome: outcome as AuditOutcome,
    occurredAt,
    versionNumber,
  };
  const reason = stringValue(record, 'reason');
  const details = safeDetails(record.details);
  if (reason) event.reason = reason;
  if (details) event.details = details;
  return event;
}

function canReadAuditHistory(document: DocumentDetail, principal: DocumentPrincipal): boolean {
  return (
    document.ownerId === principal.userId ||
    principal.roles.includes('SYSTEM_ADMIN') ||
    (principal.roles.includes('DEPARTMENT_ADMIN') &&
      principal.departmentId === document.departmentId)
  );
}

export async function listDocumentAuditEvents(
  documentId: string,
  principal: DocumentPrincipal,
  deps: ListDocumentAuditEventsDeps,
): Promise<DocumentAuditEvent[] | null> {
  const document = await loadAuthorizedDocument(documentId, principal, deps);
  if (!document || !canReadAuditHistory(document.detail, principal)) return null;

  const response = await deps.dynamodb.send(
    new QueryCommand({
      TableName: deps.tableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :auditPrefix)',
      ExpressionAttributeValues: {
        ':pk': { S: `DOC#${documentId}` },
        ':auditPrefix': { S: 'AUDIT#' },
      },
      ScanIndexForward: false,
      Limit: 50,
    }),
  );

  return (response.Items ?? [])
    .map((item) => parseAuditEvent(unmarshall(item)))
    .filter((item): item is DocumentAuditEvent => item !== null);
}
