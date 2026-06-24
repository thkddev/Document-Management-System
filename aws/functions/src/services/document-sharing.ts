import { randomUUID } from 'node:crypto';
import {
  GetItemCommand,
  DeleteItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
  type AttributeValue,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
  documentClassifications,
  type DepartmentShareStatus,
  type DocumentClassification,
  type DocumentPrincipal,
} from '../domain/models.js';
import { writeAuditEvent } from './audit.js';

export class DocumentShareValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentShareValidationError';
  }
}

export class DocumentShareNotFoundError extends Error {
  constructor(message = 'Không tìm thấy tài liệu hoặc yêu cầu chia sẻ.') {
    super(message);
    this.name = 'DocumentShareNotFoundError';
  }
}

export class DepartmentShareNotFoundError extends Error {
  constructor(message = 'Không tìm thấy quyền chia sẻ phòng ban.') {
    super(message);
    this.name = 'DepartmentShareNotFoundError';
  }
}

export class DocumentShareConflictError extends Error {
  constructor(
    public readonly code:
      | 'SHARE_ALREADY_EXISTS'
      | 'SHARE_REQUEST_ALREADY_PENDING'
      | 'SHARE_REQUEST_NOT_PENDING',
    message: string,
  ) {
    super(message);
    this.name = 'DocumentShareConflictError';
  }
}

export interface DocumentShareDeps {
  dynamodb: Pick<DynamoDBClient, 'send'>;
  tableName: string;
  requestId: string;
  now?: () => Date;
  createId?: () => string;
}

interface DocumentRecord {
  documentId: string;
  title: string;
  classification: DocumentClassification;
  departmentId: string;
  ownerId: string;
  ownerEmail: string;
  currentVersion: number;
}

export interface CreateDepartmentShareResult {
  mode: 'GRANTED' | 'PENDING_APPROVAL';
  documentId: string;
  targetDepartmentId: string;
  shareRequestId?: string;
}

export interface DepartmentShareRequestSummary {
  shareRequestId: string;
  documentId: string;
  title: string;
  classification: DocumentClassification;
  sourceDepartmentId: string;
  targetDepartmentId: string;
  requestedByEmail: string;
  createdAt: string;
}

export interface DepartmentShareDecisionResult {
  shareRequestId: string;
  status: 'APPROVED' | 'REJECTED';
}

export interface DepartmentShareSummary {
  documentId: string;
  sourceDepartmentId: string;
  targetDepartmentId: string;
  requestedBy: string;
  approvedBy: string;
  requestedAt: string;
  approvedAt: string;
}

export interface RevokeDepartmentShareResult {
  documentId: string;
  targetDepartmentId: string;
  status: 'REVOKED';
}

const directShareClassifications = new Set<DocumentClassification>(['PUBLIC', 'INTERNAL']);

function validateDepartmentId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{2,40}$/.test(value)) {
    throw new DocumentShareValidationError('Phòng ban nhận không hợp lệ.');
  }
  return value.toUpperCase();
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Document share record thiếu ${key}.`);
  }
  return value;
}

function requireNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Document share record thiếu ${key}.`);
  }
  return value;
}

function parseDocument(record: Record<string, unknown>): DocumentRecord {
  if (record.entityType !== 'Document') {
    throw new Error('DynamoDB item không phải Document.');
  }
  const classification = requireString(record, 'classification');
  if (!documentClassifications.includes(classification as DocumentClassification)) {
    throw new Error('Document record có classification không hợp lệ.');
  }
  return {
    documentId: requireString(record, 'documentId'),
    title: requireString(record, 'title'),
    classification: classification as DocumentClassification,
    departmentId: requireString(record, 'departmentId'),
    ownerId: requireString(record, 'ownerId'),
    ownerEmail: requireString(record, 'ownerEmail'),
    currentVersion: requireNumber(record, 'currentVersion'),
  };
}

async function loadDocument(
  documentId: string,
  deps: DocumentShareDeps,
): Promise<DocumentRecord | null> {
  const response = await deps.dynamodb.send(
    new GetItemCommand({
      TableName: deps.tableName,
      Key: { pk: { S: `DOC#${documentId}` }, sk: { S: 'META' } },
    }),
  );
  return response.Item ? parseDocument(unmarshall(response.Item)) : null;
}

function canCreateShare(document: DocumentRecord, principal: DocumentPrincipal): boolean {
  return (
    document.ownerId === principal.userId ||
    document.departmentId === principal.departmentId ||
    principal.roles.includes('SYSTEM_ADMIN')
  );
}

function canReviewShare(document: DocumentRecord, principal: DocumentPrincipal): boolean {
  return (
    principal.roles.includes('SYSTEM_ADMIN') ||
    (principal.roles.includes('DEPARTMENT_ADMIN') &&
      principal.departmentId === document.departmentId)
  );
}

function canManageDepartmentShares(
  document: DocumentRecord,
  principal: DocumentPrincipal,
): boolean {
  return (
    document.ownerId === principal.userId ||
    principal.roles.includes('SYSTEM_ADMIN') ||
    (principal.roles.includes('DEPARTMENT_ADMIN') &&
      principal.departmentId === document.departmentId)
  );
}

function parseDepartmentShare(record: Record<string, unknown>): DepartmentShareSummary | null {
  if (record.entityType !== 'DocumentDepartmentShare' || record.status !== 'APPROVED') {
    return null;
  }
  return {
    documentId: requireString(record, 'documentId'),
    sourceDepartmentId: requireString(record, 'sourceDepartmentId'),
    targetDepartmentId: requireString(record, 'targetDepartmentId'),
    requestedBy: requireString(record, 'requestedBy'),
    approvedBy: requireString(record, 'approvedBy'),
    requestedAt: requireString(record, 'requestedAt'),
    approvedAt: requireString(record, 'approvedAt'),
  };
}

async function hasApprovedShare(
  documentId: string,
  targetDepartmentId: string,
  deps: DocumentShareDeps,
): Promise<boolean> {
  const response = await deps.dynamodb.send(
    new GetItemCommand({
      TableName: deps.tableName,
      Key: {
        pk: { S: `DOC#${documentId}` },
        sk: { S: `SHARE#DEPT#${targetDepartmentId}` },
      },
    }),
  );
  if (!response.Item) return false;
  const item = unmarshall(response.Item);
  return item.entityType === 'DocumentDepartmentShare' && item.status === 'APPROVED';
}

async function loadPendingRequestPointer(
  documentId: string,
  targetDepartmentId: string,
  deps: DocumentShareDeps,
): Promise<Record<string, unknown> | null> {
  const response = await deps.dynamodb.send(
    new GetItemCommand({
      TableName: deps.tableName,
      Key: {
        pk: { S: `DOC#${documentId}` },
        sk: { S: `SHARE_REQUEST#DEPT#${targetDepartmentId}` },
      },
    }),
  );
  if (!response.Item) return null;
  const item = unmarshall(response.Item);
  return item.entityType === 'DocumentDepartmentShareRequestPointer' && item.status === 'PENDING'
    ? item
    : null;
}

function shareItem(
  document: DocumentRecord,
  targetDepartmentId: string,
  requestedBy: string,
  approvedBy: string,
  timestamp: string,
): Record<string, unknown> {
  return {
    pk: `DOC#${document.documentId}`,
    sk: `SHARE#DEPT#${targetDepartmentId}`,
    entityType: 'DocumentDepartmentShare',
    schemaVersion: 1,
    documentId: document.documentId,
    sourceDepartmentId: document.departmentId,
    targetDepartmentId,
    status: 'APPROVED',
    requestedBy,
    approvedBy,
    requestedAt: timestamp,
    approvedAt: timestamp,
    gsi3pk: `PRINCIPAL#DEPT#${targetDepartmentId}`,
    gsi3sk: `SHARED#${timestamp}#DOC#${document.documentId}`,
  };
}

async function writeShareGrantedAudit(
  document: DocumentRecord,
  targetDepartmentId: string,
  principal: DocumentPrincipal,
  deps: DocumentShareDeps,
  timestamp: string,
  shareRequestId?: string,
): Promise<void> {
  await writeAuditEvent(
    {
      documentId: document.documentId,
      versionNumber: document.currentVersion,
      action: 'DOCUMENT_SHARE_GRANTED',
      actorType: 'USER',
      actorId: principal.userId,
      source: 'API',
      outcome: 'SUCCESS',
      occurredAt: timestamp,
      requestId: deps.requestId,
      details: {
        sourceDepartmentId: document.departmentId,
        targetDepartmentId,
        classification: document.classification,
        ...(shareRequestId ? { shareRequestId } : {}),
      },
    },
    deps,
  );
}

export async function createDepartmentShare(
  documentId: string,
  targetDepartmentIdInput: unknown,
  principal: DocumentPrincipal,
  deps: DocumentShareDeps,
): Promise<CreateDepartmentShareResult> {
  const targetDepartmentId = validateDepartmentId(targetDepartmentIdInput);
  const document = await loadDocument(documentId, deps);
  if (!document || !canCreateShare(document, principal)) {
    throw new DocumentShareNotFoundError('Không tìm thấy tài liệu.');
  }
  if (targetDepartmentId === document.departmentId) {
    throw new DocumentShareValidationError('Không thể chia sẻ sang chính phòng ban sở hữu.');
  }
  if (await hasApprovedShare(document.documentId, targetDepartmentId, deps)) {
    throw new DocumentShareConflictError(
      'SHARE_ALREADY_EXISTS',
      'Phòng ban này đã có quyền truy cập tài liệu.',
    );
  }

  const now = (deps.now?.() ?? new Date()).toISOString();
  if (directShareClassifications.has(document.classification)) {
    try {
      await deps.dynamodb.send(
        new PutItemCommand({
          TableName: deps.tableName,
          Item: marshall(
            shareItem(document, targetDepartmentId, principal.userId, principal.userId, now),
          ),
          ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
        }),
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        throw new DocumentShareConflictError(
          'SHARE_ALREADY_EXISTS',
          'Phòng ban này đã có quyền truy cập tài liệu.',
        );
      }
      throw err;
    }
    await writeShareGrantedAudit(document, targetDepartmentId, principal, deps, now);
    return { mode: 'GRANTED', documentId: document.documentId, targetDepartmentId };
  }

  if (await loadPendingRequestPointer(document.documentId, targetDepartmentId, deps)) {
    throw new DocumentShareConflictError(
      'SHARE_REQUEST_ALREADY_PENDING',
      'Đã có yêu cầu chia sẻ đang chờ duyệt cho phòng ban này.',
    );
  }

  const shareRequestId = deps.createId?.() ?? randomUUID();
  const requestedByEmail = principal.email ?? principal.userId;
  const requestItem = {
    pk: `SHARE_REQUEST#${shareRequestId}`,
    sk: 'META',
    entityType: 'DocumentDepartmentShareRequest',
    schemaVersion: 1,
    shareRequestId,
    documentId: document.documentId,
    title: document.title,
    classification: document.classification,
    sourceDepartmentId: document.departmentId,
    targetDepartmentId,
    status: 'PENDING',
    requestedBy: principal.userId,
    requestedByEmail,
    createdAt: now,
    updatedAt: now,
    gsi3pk: `SHARE_REVIEW#DEPT#${document.departmentId}#PENDING`,
    gsi3sk: `${now}#${shareRequestId}`,
  };
  const pointerItem = {
    pk: `DOC#${document.documentId}`,
    sk: `SHARE_REQUEST#DEPT#${targetDepartmentId}`,
    entityType: 'DocumentDepartmentShareRequestPointer',
    schemaVersion: 1,
    shareRequestId,
    documentId: document.documentId,
    targetDepartmentId,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };
  await deps.dynamodb.send(
    new PutItemCommand({
      TableName: deps.tableName,
      Item: marshall(requestItem),
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
    }),
  );
  await deps.dynamodb.send(
    new PutItemCommand({
      TableName: deps.tableName,
      Item: marshall(pointerItem),
    }),
  );
  await writeAuditEvent(
    {
      documentId: document.documentId,
      versionNumber: document.currentVersion,
      action: 'DOCUMENT_SHARE_REQUESTED',
      actorType: 'USER',
      actorId: principal.userId,
      source: 'API',
      outcome: 'SUCCESS',
      occurredAt: now,
      requestId: deps.requestId,
      details: {
        sourceDepartmentId: document.departmentId,
        targetDepartmentId,
        classification: document.classification,
        shareRequestId,
      },
    },
    deps,
  );
  return {
    mode: 'PENDING_APPROVAL',
    documentId: document.documentId,
    targetDepartmentId,
    shareRequestId,
  };
}

export async function listApprovedDepartmentShares(
  documentId: string,
  principal: DocumentPrincipal,
  deps: DocumentShareDeps,
): Promise<DepartmentShareSummary[]> {
  const document = await loadDocument(documentId, deps);
  if (!document || !canManageDepartmentShares(document, principal)) {
    throw new DocumentShareNotFoundError('Không tìm thấy tài liệu.');
  }

  const response = await deps.dynamodb.send(
    new QueryCommand({
      TableName: deps.tableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': { S: `DOC#${document.documentId}` },
        ':skPrefix': { S: 'SHARE#DEPT#' },
      },
      Limit: 50,
    }),
  );

  const items: DepartmentShareSummary[] = [];
  for (const item of response.Items ?? []) {
    const parsed = parseDepartmentShare(unmarshall(item));
    if (parsed) items.push(parsed);
  }
  return items.sort((left, right) => right.approvedAt.localeCompare(left.approvedAt));
}

export async function revokeDepartmentShare(
  documentId: string,
  targetDepartmentIdInput: unknown,
  principal: DocumentPrincipal,
  deps: DocumentShareDeps,
): Promise<RevokeDepartmentShareResult> {
  const targetDepartmentId = validateDepartmentId(targetDepartmentIdInput);
  const document = await loadDocument(documentId, deps);
  if (!document || !canManageDepartmentShares(document, principal)) {
    throw new DocumentShareNotFoundError('Không tìm thấy tài liệu.');
  }
  if (targetDepartmentId === document.departmentId) {
    throw new DocumentShareValidationError('Không thể thu hồi phòng ban sở hữu tài liệu.');
  }

  try {
    await deps.dynamodb.send(
      new DeleteItemCommand({
        TableName: deps.tableName,
        Key: {
          pk: { S: `DOC#${document.documentId}` },
          sk: { S: `SHARE#DEPT#${targetDepartmentId}` },
        },
        ConditionExpression: 'entityType = :type AND #status = :approved',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':type': { S: 'DocumentDepartmentShare' },
          ':approved': { S: 'APPROVED' },
        },
      }),
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      throw new DepartmentShareNotFoundError();
    }
    throw err;
  }

  const now = (deps.now?.() ?? new Date()).toISOString();
  await writeAuditEvent(
    {
      documentId: document.documentId,
      versionNumber: document.currentVersion,
      action: 'DOCUMENT_SHARE_REVOKED',
      actorType: 'USER',
      actorId: principal.userId,
      source: 'API',
      outcome: 'SUCCESS',
      occurredAt: now,
      requestId: deps.requestId,
      details: {
        sourceDepartmentId: document.departmentId,
        targetDepartmentId,
        classification: document.classification,
      },
    },
    deps,
  );
  return { documentId: document.documentId, targetDepartmentId, status: 'REVOKED' };
}

function parseShareRequestSummary(
  record: Record<string, unknown>,
): DepartmentShareRequestSummary | null {
  if (record.entityType !== 'DocumentDepartmentShareRequest' || record.status !== 'PENDING')
    return null;
  const classification = record.classification;
  if (
    typeof classification !== 'string' ||
    !documentClassifications.includes(classification as DocumentClassification)
  ) {
    return null;
  }
  return {
    shareRequestId: requireString(record, 'shareRequestId'),
    documentId: requireString(record, 'documentId'),
    title: requireString(record, 'title'),
    classification: classification as DocumentClassification,
    sourceDepartmentId: requireString(record, 'sourceDepartmentId'),
    targetDepartmentId: requireString(record, 'targetDepartmentId'),
    requestedByEmail: requireString(record, 'requestedByEmail'),
    createdAt: requireString(record, 'createdAt'),
  };
}

export async function listPendingShareRequests(
  principal: DocumentPrincipal,
  deps: DocumentShareDeps,
): Promise<DepartmentShareRequestSummary[]> {
  const items: DepartmentShareRequestSummary[] = [];
  let responseItems: Record<string, AttributeValue>[] | undefined;
  if (principal.roles.includes('SYSTEM_ADMIN')) {
    const response = await deps.dynamodb.send(
      new ScanCommand({
        TableName: deps.tableName,
        FilterExpression: 'entityType = :type AND #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':type': { S: 'DocumentDepartmentShareRequest' },
          ':status': { S: 'PENDING' },
        },
        Limit: 50,
      }),
    );
    responseItems = response.Items;
  } else if (principal.roles.includes('DEPARTMENT_ADMIN')) {
    const response = await deps.dynamodb.send(
      new QueryCommand({
        TableName: deps.tableName,
        IndexName: 'gsi3',
        KeyConditionExpression: 'gsi3pk = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: `SHARE_REVIEW#DEPT#${principal.departmentId}#PENDING` },
        },
        Limit: 50,
      }),
    );
    responseItems = response.Items;
  } else {
    return [];
  }

  for (const item of responseItems ?? []) {
    const parsed = parseShareRequestSummary(unmarshall(item));
    if (parsed) items.push(parsed);
  }
  return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function parseShareRequest(record: Record<string, unknown>): DepartmentShareRequestSummary & {
  requestedBy: string;
  status: DepartmentShareStatus;
} {
  if (record.entityType !== 'DocumentDepartmentShareRequest') {
    throw new Error('DynamoDB item không phải DocumentDepartmentShareRequest.');
  }
  const status = requireString(record, 'status');
  if (status !== 'PENDING' && status !== 'APPROVED' && status !== 'REJECTED') {
    throw new Error('Share request có status không hợp lệ.');
  }
  return {
    ...parseShareRequestSummary({ ...record, status: 'PENDING' })!,
    requestedBy: requireString(record, 'requestedBy'),
    status,
  };
}

async function loadShareRequest(
  shareRequestId: string,
  deps: DocumentShareDeps,
): Promise<
  (DepartmentShareRequestSummary & { requestedBy: string; status: DepartmentShareStatus }) | null
> {
  const response = await deps.dynamodb.send(
    new GetItemCommand({
      TableName: deps.tableName,
      Key: { pk: { S: `SHARE_REQUEST#${shareRequestId}` }, sk: { S: 'META' } },
    }),
  );
  return response.Item ? parseShareRequest(unmarshall(response.Item)) : null;
}

export async function approveShareRequest(
  shareRequestId: string,
  principal: DocumentPrincipal,
  deps: DocumentShareDeps,
): Promise<DepartmentShareDecisionResult> {
  const request = await loadShareRequest(shareRequestId, deps);
  if (!request) throw new DocumentShareNotFoundError();
  const document = await loadDocument(request.documentId, deps);
  if (!document || !canReviewShare(document, principal)) throw new DocumentShareNotFoundError();
  if (request.status !== 'PENDING') {
    throw new DocumentShareConflictError(
      'SHARE_REQUEST_NOT_PENDING',
      'Yêu cầu chia sẻ đã được xử lý.',
    );
  }
  const now = (deps.now?.() ?? new Date()).toISOString();
  await deps.dynamodb.send(
    new PutItemCommand({
      TableName: deps.tableName,
      Item: marshall(
        shareItem(document, request.targetDepartmentId, request.requestedBy, principal.userId, now),
      ),
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
    }),
  );
  await deps.dynamodb.send(
    new UpdateItemCommand({
      TableName: deps.tableName,
      Key: { pk: { S: `SHARE_REQUEST#${shareRequestId}` }, sk: { S: 'META' } },
      UpdateExpression:
        'SET #status = :approved, reviewedBy = :reviewedBy, reviewedAt = :reviewedAt, updatedAt = :updatedAt REMOVE gsi3pk, gsi3sk',
      ConditionExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':approved': { S: 'APPROVED' },
        ':pending': { S: 'PENDING' },
        ':reviewedBy': { S: principal.userId },
        ':reviewedAt': { S: now },
        ':updatedAt': { S: now },
      },
    }),
  );
  await deps.dynamodb.send(
    new UpdateItemCommand({
      TableName: deps.tableName,
      Key: {
        pk: { S: `DOC#${document.documentId}` },
        sk: { S: `SHARE_REQUEST#DEPT#${request.targetDepartmentId}` },
      },
      UpdateExpression: 'SET #status = :approved, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':approved': { S: 'APPROVED' },
        ':updatedAt': { S: now },
      },
    }),
  );
  await writeAuditEvent(
    {
      documentId: document.documentId,
      versionNumber: document.currentVersion,
      action: 'DOCUMENT_SHARE_APPROVED',
      actorType: 'USER',
      actorId: principal.userId,
      source: 'API',
      outcome: 'SUCCESS',
      occurredAt: now,
      requestId: deps.requestId,
      details: {
        sourceDepartmentId: document.departmentId,
        targetDepartmentId: request.targetDepartmentId,
        classification: document.classification,
        shareRequestId,
      },
    },
    deps,
  );
  await writeShareGrantedAudit(
    document,
    request.targetDepartmentId,
    principal,
    deps,
    now,
    shareRequestId,
  );
  return { shareRequestId, status: 'APPROVED' };
}

export async function rejectShareRequest(
  shareRequestId: string,
  reasonInput: unknown,
  principal: DocumentPrincipal,
  deps: DocumentShareDeps,
): Promise<DepartmentShareDecisionResult> {
  const reason = typeof reasonInput === 'string' ? reasonInput.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    throw new DocumentShareValidationError('Vui lòng nhập lý do từ chối từ 3 đến 500 ký tự.');
  }
  const request = await loadShareRequest(shareRequestId, deps);
  if (!request) throw new DocumentShareNotFoundError();
  const document = await loadDocument(request.documentId, deps);
  if (!document || !canReviewShare(document, principal)) throw new DocumentShareNotFoundError();
  if (request.status !== 'PENDING') {
    throw new DocumentShareConflictError(
      'SHARE_REQUEST_NOT_PENDING',
      'Yêu cầu chia sẻ đã được xử lý.',
    );
  }
  const now = (deps.now?.() ?? new Date()).toISOString();
  await deps.dynamodb.send(
    new UpdateItemCommand({
      TableName: deps.tableName,
      Key: { pk: { S: `SHARE_REQUEST#${shareRequestId}` }, sk: { S: 'META' } },
      UpdateExpression:
        'SET #status = :rejected, reviewedBy = :reviewedBy, reviewedAt = :reviewedAt, rejectionReason = :reason, updatedAt = :updatedAt REMOVE gsi3pk, gsi3sk',
      ConditionExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':rejected': { S: 'REJECTED' },
        ':pending': { S: 'PENDING' },
        ':reviewedBy': { S: principal.userId },
        ':reviewedAt': { S: now },
        ':reason': { S: reason },
        ':updatedAt': { S: now },
      },
    }),
  );
  await deps.dynamodb.send(
    new UpdateItemCommand({
      TableName: deps.tableName,
      Key: {
        pk: { S: `DOC#${document.documentId}` },
        sk: { S: `SHARE_REQUEST#DEPT#${request.targetDepartmentId}` },
      },
      UpdateExpression: 'SET #status = :rejected, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':rejected': { S: 'REJECTED' },
        ':updatedAt': { S: now },
      },
    }),
  );
  await writeAuditEvent(
    {
      documentId: document.documentId,
      versionNumber: document.currentVersion,
      action: 'DOCUMENT_SHARE_REJECTED',
      actorType: 'USER',
      actorId: principal.userId,
      source: 'API',
      outcome: 'REJECTED',
      occurredAt: now,
      requestId: deps.requestId,
      reason,
      details: {
        sourceDepartmentId: document.departmentId,
        targetDepartmentId: request.targetDepartmentId,
        classification: document.classification,
        shareRequestId,
      },
    },
    deps,
  );
  return { shareRequestId, status: 'REJECTED' };
}
