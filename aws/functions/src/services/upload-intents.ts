import { randomUUID } from 'node:crypto';
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { PutItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { marshall } from '@aws-sdk/util-dynamodb';
import type { CreateUploadIntentRequest, CurrentUser, UploadIntent } from '../domain/models.js';
import { writeAuditEvent } from './audit.js';

export class UploadIntentForbiddenError extends Error {
  constructor(message = 'Bạn không có quyền phát hành tài liệu cho toàn bộ nhân viên.') {
    super(message);
    this.name = 'UploadIntentForbiddenError';
  }
}

export interface UploadIntentServiceDeps {
  dynamodb: Pick<DynamoDBClient, 'send'>;
  s3: S3Client;
  tableName: string;
  quarantineBucketName: string;
  now?: () => Date;
  createId?: () => string;
  presignSeconds?: number;
  requestId?: string;
}

interface UploadIntentRecord {
  uploadIntentId: string;
  documentId: string;
  versionNumber: number;
  objectKey: string;
  expiresAt: string;
  createdAt: string;
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^\w. -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function createObjectKey(user: CurrentUser, documentId: string, fileName: string): string {
  return [
    'quarantine',
    user.departmentId,
    user.userId,
    documentId,
    `v000001-${sanitizeFileName(fileName)}`,
  ].join('/');
}

function buildUploadIntentItem(
  request: CreateUploadIntentRequest,
  user: CurrentUser,
  record: UploadIntentRecord,
) {
  return {
    pk: `UPLOAD#${record.uploadIntentId}`,
    sk: 'META',
    entityType: 'UploadIntent',
    uploadIntentId: record.uploadIntentId,
    documentId: record.documentId,
    versionNumber: record.versionNumber,
    status: 'UPLOAD_PENDING',
    title: request.title,
    departmentId: request.departmentId,
    ownerId: user.userId,
    ownerEmail: user.email,
    accessScope: request.accessScope,
    classification: request.classification,
    originalFileName: request.originalFileName,
    contentType: request.contentType,
    sizeBytes: request.sizeBytes,
    checksumSha256: request.checksumSha256,
    objectKey: record.objectKey,
    tags: request.tags ?? [],
    createdAt: record.createdAt,
    updatedAt: record.createdAt,
    expiresAt: record.expiresAt,
    expiresAtEpoch: Math.floor(new Date(record.expiresAt).getTime() / 1000),
    gsi1pk: `DEPT#${request.departmentId}`,
    gsi1sk: `UPDATED#${record.createdAt}#DOC#${record.documentId}`,
    gsi2pk: `OWNER#${user.userId}`,
    gsi2sk: `UPDATED#${record.createdAt}#DOC#${record.documentId}`,
    gsi4pk: `CHECKSUM#${request.checksumSha256}`,
    gsi4sk: `DOC#${record.documentId}#VERSION#${record.versionNumber}`,
  };
}

function buildDocumentItem(
  request: CreateUploadIntentRequest,
  user: CurrentUser,
  record: UploadIntentRecord,
) {
  return {
    pk: `DOC#${record.documentId}`,
    sk: 'META',
    entityType: 'Document',
    documentId: record.documentId,
    title: request.title,
    departmentId: request.departmentId,
    ownerId: user.userId,
    ownerEmail: user.email,
    accessScope: request.accessScope,
    uploadIntentId: record.uploadIntentId,
    classification: request.classification,
    currentVersion: record.versionNumber,
    status: 'UPLOAD_PENDING',
    contentType: request.contentType,
    sizeBytes: request.sizeBytes,
    checksumSha256: request.checksumSha256,
    originalFileName: request.originalFileName,
    quarantineObjectKey: record.objectKey,
    uploadExpiresAt: record.expiresAt,
    tags: request.tags ?? [],
    createdAt: record.createdAt,
    updatedAt: record.createdAt,
    gsi1pk: `DEPT#${request.departmentId}`,
    gsi1sk: `UPDATED#${record.createdAt}#DOC#${record.documentId}`,
    gsi2pk: `OWNER#${user.userId}`,
    gsi2sk: `UPDATED#${record.createdAt}#DOC#${record.documentId}`,
  };
}

export async function createUploadIntent(
  request: CreateUploadIntentRequest,
  user: CurrentUser,
  deps: UploadIntentServiceDeps,
): Promise<UploadIntent> {
  if (request.accessScope === 'ALL_EMPLOYEES' && !user.roles.includes('SYSTEM_ADMIN')) {
    throw new UploadIntentForbiddenError();
  }

  const now = deps.now?.() ?? new Date();
  const presignSeconds = deps.presignSeconds ?? 900;
  const expiresAt = new Date(now.getTime() + presignSeconds * 1000).toISOString();
  const uploadIntentId = deps.createId?.() ?? randomUUID();
  const documentId = deps.createId?.() ?? randomUUID();
  const versionNumber = 1;
  const objectKey = createObjectKey(user, documentId, request.originalFileName);
  const uploadHeaders = {
    'content-type': request.contentType,
  };

  const command = new PutObjectCommand({
    Bucket: deps.quarantineBucketName,
    Key: objectKey,
    ContentType: request.contentType,
    Metadata: {
      'upload-intent-id': uploadIntentId,
      'document-id': documentId,
      'checksum-sha256': request.checksumSha256,
      'owner-id': user.userId,
    },
  });

  const uploadUrl = await getSignedUrl(deps.s3, command, { expiresIn: presignSeconds });
  const record: UploadIntentRecord = {
    uploadIntentId,
    documentId,
    versionNumber,
    objectKey,
    expiresAt,
    createdAt: now.toISOString(),
  };

  await deps.dynamodb.send(
    new PutItemCommand({
      TableName: deps.tableName,
      Item: marshall(buildUploadIntentItem(request, user, record), {
        removeUndefinedValues: true,
      }),
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  );

  await deps.dynamodb.send(
    new PutItemCommand({
      TableName: deps.tableName,
      Item: marshall(buildDocumentItem(request, user, record), {
        removeUndefinedValues: true,
      }),
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  );

  await writeAuditEvent(
    {
      documentId,
      versionNumber,
      action: 'UPLOAD_INTENT_CREATED',
      actorType: 'USER',
      actorId: user.userId,
      source: 'API',
      outcome: 'SUCCESS',
      eventId: `upload-${uploadIntentId}-created`,
      occurredAt: record.createdAt,
      details: { accessScope: request.accessScope },
      ...(deps.requestId ? { requestId: deps.requestId } : {}),
    },
    deps,
  );

  return {
    uploadIntentId,
    documentId,
    versionNumber,
    uploadUrl,
    expiresAt,
    uploadHeaders,
  };
}
