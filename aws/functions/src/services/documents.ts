import {
  ScanCommand,
  type AttributeValue,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import {
  documentClassifications,
  documentAccessScopes,
  documentStatuses,
  type DocumentAccessScope,
  type DocumentClassification,
  type DocumentPrincipal,
  type DocumentStatus,
  type DocumentSummary,
} from '../domain/models.js';

export interface ListDocumentsDeps {
  dynamodb: Pick<DynamoDBClient, 'send'>;
  tableName: string;
}

function stringValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseDocumentSummary(record: Record<string, unknown>): DocumentSummary | null {
  const documentId = stringValue(record, 'documentId');
  const title = stringValue(record, 'title');
  const originalFileName = stringValue(record, 'originalFileName');
  const contentType = stringValue(record, 'contentType');
  const classification = stringValue(record, 'classification');
  const departmentId = stringValue(record, 'departmentId');
  const ownerId = stringValue(record, 'ownerId');
  const ownerEmail = stringValue(record, 'ownerEmail');
  const accessScope = stringValue(record, 'accessScope') ?? 'DEPARTMENT';
  const sizeBytes = numberValue(record, 'sizeBytes');
  const currentVersion = numberValue(record, 'currentVersion');
  const status = stringValue(record, 'status');
  const statusReason =
    status === 'REJECTED'
      ? stringValue(record, 'rejectionReason')
      : status === 'FAILED'
        ? stringValue(record, 'failureReason')
        : null;
  const updatedAt = stringValue(record, 'updatedAt');

  if (
    !documentId ||
    !title ||
    !originalFileName ||
    !contentType ||
    !classification ||
    !documentClassifications.includes(classification as DocumentClassification) ||
    !departmentId ||
    !ownerId ||
    !ownerEmail ||
    !documentAccessScopes.includes(accessScope as DocumentAccessScope) ||
    sizeBytes === null ||
    currentVersion === null ||
    !status ||
    !documentStatuses.includes(status as DocumentStatus) ||
    !updatedAt
  ) {
    return null;
  }

  const summary: DocumentSummary = {
    documentId,
    title,
    originalFileName,
    contentType,
    classification: classification as DocumentClassification,
    departmentId,
    ownerId,
    ownerEmail,
    accessScope: accessScope as DocumentAccessScope,
    sizeBytes,
    currentVersion,
    status: status as DocumentStatus,
    updatedAt,
  };
  if (statusReason) {
    summary.statusReason = statusReason;
  }
  return summary;
}

function canReadSummary(document: DocumentSummary, principal: DocumentPrincipal): boolean {
  if (principal.roles.includes('SYSTEM_ADMIN')) return true;
  if (document.accessScope === 'ALL_EMPLOYEES') return true;
  return document.ownerId === principal.userId || document.departmentId === principal.departmentId;
}

export async function listAuthorizedDocuments(
  principal: DocumentPrincipal,
  deps: ListDocumentsDeps,
): Promise<DocumentSummary[]> {
  const items: DocumentSummary[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;
  do {
    const response = await deps.dynamodb.send(
      new ScanCommand({
        TableName: deps.tableName,
        FilterExpression: 'entityType = :documentType',
        ExpressionAttributeValues: {
          ':documentType': { S: 'Document' },
        },
        Limit: 50,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    for (const item of response.Items ?? []) {
      const parsed = parseDocumentSummary(unmarshall(item));
      if (parsed && canReadSummary(parsed, principal)) {
        items.push(parsed);
      } else if (!parsed) {
        console.warn('Skipped malformed document summary record');
      }
    }
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey && items.length < 50);

  return items
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 50);
}
