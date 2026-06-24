import { GetItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import {
  documentAccessScopes,
  documentClassifications,
  documentStatuses,
  type DocumentAccessScope,
  type DocumentClassification,
  type DocumentDetail,
  type DocumentPrincipal,
  type DocumentStatus,
} from '../domain/models.js';

export interface DocumentAccessDeps {
  dynamodb: Pick<DynamoDBClient, 'send'>;
  tableName: string;
}

export interface AuthorizedDocument {
  detail: DocumentDetail;
  cleanObjectKey?: string;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Document record thiếu ${key}.`);
  }
  return value;
}

function requireNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Document record thiếu ${key}.`);
  }
  return value;
}

function parseDocument(record: Record<string, unknown>): AuthorizedDocument {
  if (record.entityType !== 'Document') {
    throw new Error('DynamoDB item không phải Document.');
  }
  const classification = requireString(record, 'classification');
  const status = requireString(record, 'status');
  const accessScope =
    typeof record.accessScope === 'string' && record.accessScope.length > 0
      ? record.accessScope
      : 'DEPARTMENT';
  if (!documentClassifications.includes(classification as DocumentClassification)) {
    throw new Error('Document record có classification không hợp lệ.');
  }
  if (!documentStatuses.includes(status as DocumentStatus)) {
    throw new Error('Document record có status không hợp lệ.');
  }

  if (!documentAccessScopes.includes(accessScope as DocumentAccessScope)) {
    throw new Error('Document record có accessScope không hợp lệ.');
  }

  const detail: DocumentDetail = {
    documentId: requireString(record, 'documentId'),
    title: requireString(record, 'title'),
    originalFileName: requireString(record, 'originalFileName'),
    contentType: requireString(record, 'contentType'),
    classification: classification as DocumentClassification,
    departmentId: requireString(record, 'departmentId'),
    ownerId: requireString(record, 'ownerId'),
    ownerEmail: requireString(record, 'ownerEmail'),
    accessScope: accessScope as DocumentAccessScope,
    sizeBytes: requireNumber(record, 'sizeBytes'),
    currentVersion: requireNumber(record, 'currentVersion'),
    status: status as DocumentStatus,
    createdAt: requireString(record, 'createdAt'),
    updatedAt: requireString(record, 'updatedAt'),
  };
  const statusReason =
    status === 'REJECTED'
      ? record.rejectionReason
      : status === 'FAILED'
        ? record.failureReason
        : undefined;
  if (typeof statusReason === 'string' && statusReason.length > 0) {
    detail.statusReason = statusReason;
  }

  const cleanObjectKey = record.cleanObjectKey;
  return {
    detail,
    ...(typeof cleanObjectKey === 'string' && cleanObjectKey.length > 0 ? { cleanObjectKey } : {}),
  };
}

function canAccessDocument(document: DocumentDetail, principal: DocumentPrincipal): boolean {
  if (document.accessScope === 'ALL_EMPLOYEES') {
    return true;
  }

  return (
    document.ownerId === principal.userId ||
    document.departmentId === principal.departmentId ||
    principal.roles.includes('SYSTEM_ADMIN')
  );
}

async function hasApprovedDepartmentShare(
  documentId: string,
  departmentId: string,
  deps: DocumentAccessDeps,
): Promise<boolean> {
  const response = await deps.dynamodb.send(
    new GetItemCommand({
      TableName: deps.tableName,
      Key: {
        pk: { S: `DOC#${documentId}` },
        sk: { S: `SHARE#DEPT#${departmentId}` },
      },
    }),
  );
  if (!response.Item) return false;
  const item = unmarshall(response.Item);
  return item.entityType === 'DocumentDepartmentShare' && item.status === 'APPROVED';
}

export async function loadAuthorizedDocument(
  documentId: string,
  principal: DocumentPrincipal,
  deps: DocumentAccessDeps,
): Promise<AuthorizedDocument | null> {
  const response = await deps.dynamodb.send(
    new GetItemCommand({
      TableName: deps.tableName,
      Key: { pk: { S: `DOC#${documentId}` }, sk: { S: 'META' } },
    }),
  );
  if (!response.Item) return null;

  const document = parseDocument(unmarshall(response.Item));
  if (canAccessDocument(document.detail, principal)) return document;
  return (await hasApprovedDepartmentShare(
    document.detail.documentId,
    principal.departmentId,
    deps,
  ))
    ? document
    : null;
}

export async function getDocumentDetail(
  documentId: string,
  principal: DocumentPrincipal,
  deps: DocumentAccessDeps,
): Promise<DocumentDetail | null> {
  return (await loadAuthorizedDocument(documentId, principal, deps))?.detail ?? null;
}
