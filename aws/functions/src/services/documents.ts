import {
  QueryCommand,
  type AttributeValue,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import {
  documentClassifications,
  documentStatuses,
  type DocumentClassification,
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

export async function listDocumentsByDepartment(
  departmentId: string,
  deps: ListDocumentsDeps,
): Promise<DocumentSummary[]> {
  const items: DocumentSummary[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;
  do {
    const response = await deps.dynamodb.send(
      new QueryCommand({
        TableName: deps.tableName,
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :department',
        FilterExpression: 'entityType = :documentType',
        ExpressionAttributeValues: {
          ':department': { S: `DEPT#${departmentId}` },
          ':documentType': { S: 'Document' },
        },
        ScanIndexForward: false,
        Limit: 50,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    for (const item of response.Items ?? []) {
      const parsed = parseDocumentSummary(unmarshall(item));
      if (parsed) {
        items.push(parsed);
      } else {
        console.warn('Skipped malformed document summary record');
      }
    }
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey && items.length < 50);

  return items.slice(0, 50);
}
