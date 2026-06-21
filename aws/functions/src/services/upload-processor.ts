import { createHash } from 'node:crypto';
import {
  CopyObjectCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  type S3Client,
} from '@aws-sdk/client-s3';
import { GetItemCommand, UpdateItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { validateFileSignature } from '../domain/file-signature.js';
import type { AuditAction, AuditOutcome } from '../domain/models.js';
import { writeAuditEvent } from './audit.js';

export type ProcessedUploadStatus = 'READY' | 'INFECTED' | 'REJECTED' | 'FAILED';

type MalwareScanStatus =
  | 'NO_THREATS_FOUND'
  | 'THREATS_FOUND'
  | 'UNSUPPORTED'
  | 'ACCESS_DENIED'
  | 'FAILED';

export class MalwareScanPendingError extends Error {
  constructor(documentId: string) {
    super(`GuardDuty chưa gắn kết quả quét cho document ${documentId}.`);
    this.name = 'MalwareScanPendingError';
  }
}

export interface ProcessUploadedObjectInput {
  bucketName: string;
  objectKey: string;
}

export interface ProcessedUploadResult {
  documentId: string;
  status: ProcessedUploadStatus;
  reason?: string;
}

export interface UploadProcessorDeps {
  dynamodb: Pick<DynamoDBClient, 'send'>;
  s3: Pick<S3Client, 'send'>;
  tableName: string;
  documentsBucketName: string;
  now?: () => Date;
}

interface DocumentRecord {
  documentId: string;
  uploadIntentId?: string;
  ownerId: string;
  departmentId: string;
  status: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  quarantineObjectKey: string;
  originalFileName: string;
  currentVersion: number;
  updatedAt: string;
  rejectionReason?: string;
  failureReason?: string;
}

function getDocumentIdFromKey(objectKey: string): string {
  const parts = objectKey.split('/');
  const documentId = parts[3];
  if (parts.length < 5 || parts[0] !== 'quarantine' || !documentId) {
    throw new Error(`Object key không đúng định dạng quarantine: ${objectKey}`);
  }
  return documentId;
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
  if (typeof value !== 'number') {
    throw new Error(`Document record thiếu ${key}.`);
  }
  return value;
}

function parseDocumentRecord(raw: Record<string, unknown>): DocumentRecord {
  const uploadIntentId = raw.uploadIntentId;
  const record: DocumentRecord = {
    documentId: requireString(raw, 'documentId'),
    ownerId: requireString(raw, 'ownerId'),
    departmentId: requireString(raw, 'departmentId'),
    status: requireString(raw, 'status'),
    contentType: requireString(raw, 'contentType'),
    sizeBytes: requireNumber(raw, 'sizeBytes'),
    checksumSha256: requireString(raw, 'checksumSha256'),
    quarantineObjectKey: requireString(raw, 'quarantineObjectKey'),
    originalFileName: requireString(raw, 'originalFileName'),
    currentVersion: requireNumber(raw, 'currentVersion'),
    updatedAt: requireString(raw, 'updatedAt'),
  };
  if (typeof uploadIntentId === 'string') {
    record.uploadIntentId = uploadIntentId;
  }
  if (typeof raw.rejectionReason === 'string') {
    record.rejectionReason = raw.rejectionReason;
  }
  if (typeof raw.failureReason === 'string') {
    record.failureReason = raw.failureReason;
  }
  return record;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (body && typeof body === 'object' && 'transformToByteArray' in body) {
    const bytes = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function copySource(bucketName: string, objectKey: string): string {
  return `${encodeURIComponent(bucketName)}/${objectKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;
}

function cleanObjectKey(document: DocumentRecord): string {
  const version = String(document.currentVersion).padStart(6, '0');
  return [
    'documents',
    document.departmentId,
    document.documentId,
    `v${version}`,
    document.originalFileName.replace(/[^\w. -]/g, '_'),
  ].join('/');
}

async function loadDocument(
  documentId: string,
  deps: UploadProcessorDeps,
): Promise<DocumentRecord> {
  const response = await deps.dynamodb.send(
    new GetItemCommand({
      TableName: deps.tableName,
      Key: {
        pk: { S: `DOC#${documentId}` },
        sk: { S: 'META' },
      },
    }),
  );

  if (!response.Item) {
    throw new Error(`Không tìm thấy document ${documentId}.`);
  }

  return parseDocumentRecord(unmarshall(response.Item));
}

async function updateDocumentStatus(
  document: DocumentRecord,
  status: string,
  deps: UploadProcessorDeps,
  extra: Record<string, string> = {},
): Promise<string> {
  const now = (deps.now?.() ?? new Date()).toISOString();
  const names: Record<string, string> = {
    '#status': 'status',
    '#updatedAt': 'updatedAt',
  };
  const values: Record<string, { S: string }> = {
    ':status': { S: status },
    ':updatedAt': { S: now },
  };
  const assignments = ['#status = :status', '#updatedAt = :updatedAt'];

  for (const [key, value] of Object.entries(extra)) {
    names[`#${key}`] = key;
    values[`:${key}`] = { S: value };
    assignments.push(`#${key} = :${key}`);
  }

  await deps.dynamodb.send(
    new UpdateItemCommand({
      TableName: deps.tableName,
      Key: {
        pk: { S: `DOC#${document.documentId}` },
        sk: { S: 'META' },
      },
      UpdateExpression: `SET ${assignments.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );

  if (document.uploadIntentId) {
    await deps.dynamodb.send(
      new UpdateItemCommand({
        TableName: deps.tableName,
        Key: {
          pk: { S: `UPLOAD#${document.uploadIntentId}` },
          sk: { S: 'META' },
        },
        UpdateExpression: `SET ${assignments.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
  }
  return now;
}

async function writeProcessorAudit(
  document: DocumentRecord,
  action: AuditAction,
  outcome: AuditOutcome,
  occurredAt: string,
  deps: UploadProcessorDeps,
  reason?: string,
): Promise<void> {
  await writeAuditEvent(
    {
      documentId: document.documentId,
      versionNumber: document.currentVersion,
      action,
      actorType: 'SYSTEM',
      actorId: 'upload-processor',
      source: 'UPLOAD_PROCESSOR',
      outcome,
      eventId: `${document.uploadIntentId ?? document.documentId}-${action}-v${document.currentVersion}`,
      occurredAt,
      ...(reason ? { reason } : {}),
    },
    deps,
  );
}

async function rejectUpload(
  document: DocumentRecord,
  deps: UploadProcessorDeps,
  reason: string,
): Promise<ProcessedUploadResult> {
  const occurredAt = await updateDocumentStatus(document, 'REJECTED', deps, {
    rejectionReason: reason,
  });
  await writeProcessorAudit(document, 'DOCUMENT_REJECTED', 'REJECTED', occurredAt, deps, reason);
  return { documentId: document.documentId, status: 'REJECTED', reason };
}

function validateHeadObject(
  document: DocumentRecord,
  head: HeadObjectCommandOutput,
): string | null {
  if (head.ContentLength !== document.sizeBytes) {
    return 'Dung lượng file không khớp upload intent.';
  }
  const contentType = head.ContentType?.split(';')[0];
  if (contentType !== document.contentType) {
    return 'Content type không khớp upload intent.';
  }
  if (head.Metadata?.['document-id'] !== document.documentId) {
    return 'Metadata document-id không khớp.';
  }
  if (head.Metadata?.['checksum-sha256'] !== document.checksumSha256) {
    return 'Metadata checksum không khớp.';
  }
  return null;
}

async function loadObjectBody(
  bucketName: string,
  objectKey: string,
  deps: UploadProcessorDeps,
): Promise<Buffer> {
  const response = await deps.s3.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    }),
  );

  return bodyToBuffer(response.Body);
}

async function getMalwareScanStatus(
  bucketName: string,
  objectKey: string,
  deps: UploadProcessorDeps,
): Promise<MalwareScanStatus | null> {
  const response = await deps.s3.send(
    new GetObjectTaggingCommand({ Bucket: bucketName, Key: objectKey }),
  );
  const value = response.TagSet?.find((tag) => tag.Key === 'GuardDutyMalwareScanStatus')?.Value;
  if (
    value === 'NO_THREATS_FOUND' ||
    value === 'THREATS_FOUND' ||
    value === 'UNSUPPORTED' ||
    value === 'ACCESS_DENIED' ||
    value === 'FAILED'
  ) {
    return value;
  }
  return null;
}

export async function processUploadedObject(
  input: ProcessUploadedObjectInput,
  deps: UploadProcessorDeps,
): Promise<ProcessedUploadResult> {
  const documentId = getDocumentIdFromKey(input.objectKey);
  const document = await loadDocument(documentId, deps);

  if (
    document.status === 'READY' ||
    document.status === 'INFECTED' ||
    document.status === 'REJECTED' ||
    document.status === 'FAILED'
  ) {
    const terminalAudit = {
      READY: { action: 'DOCUMENT_READY', outcome: 'SUCCESS' },
      INFECTED: {
        action: 'MALWARE_DETECTED',
        outcome: 'REJECTED',
        reason: 'GuardDuty phát hiện mã độc trong file.',
      },
      REJECTED: {
        action: 'DOCUMENT_REJECTED',
        outcome: 'REJECTED',
        reason: document.rejectionReason,
      },
      FAILED: {
        action: 'PROCESSING_FAILED',
        outcome: 'FAILED',
        reason: document.failureReason,
      },
    }[document.status] as {
      action: AuditAction;
      outcome: AuditOutcome;
      reason?: string;
    };
    await writeProcessorAudit(
      document,
      terminalAudit.action,
      terminalAudit.outcome,
      document.updatedAt,
      deps,
      terminalAudit.reason,
    );
    return { documentId, status: document.status as ProcessedUploadStatus };
  }

  if (document.quarantineObjectKey !== input.objectKey) {
    return rejectUpload(document, deps, 'S3 object key không khớp upload intent.');
  }

  if (document.status !== 'SCANNING') {
    await updateDocumentStatus(document, 'UPLOADED', deps);

    const head = await deps.s3.send(
      new HeadObjectCommand({
        Bucket: input.bucketName,
        Key: input.objectKey,
      }),
    );
    await updateDocumentStatus(document, 'VALIDATING', deps);

    const headIssue = validateHeadObject(document, head);
    if (headIssue) {
      return rejectUpload(document, deps, headIssue);
    }

    const body = await loadObjectBody(input.bucketName, input.objectKey, deps);
    const checksum = createHash('sha256').update(body).digest('hex');
    if (checksum !== document.checksumSha256) {
      return rejectUpload(document, deps, 'Checksum SHA-256 không khớp nội dung file.');
    }

    const signatureIssue = await validateFileSignature({
      fileName: document.originalFileName,
      contentType: document.contentType,
      body,
    });
    if (signatureIssue) {
      return rejectUpload(document, deps, signatureIssue);
    }

    const validatedAt = (deps.now?.() ?? new Date()).toISOString();
    await writeProcessorAudit(document, 'UPLOAD_VALIDATED', 'SUCCESS', validatedAt, deps);
    const scanningAt = await updateDocumentStatus(document, 'SCANNING', deps);
    await writeProcessorAudit(document, 'MALWARE_SCAN_STARTED', 'SUCCESS', scanningAt, deps);
  }

  const scanStatus = await getMalwareScanStatus(input.bucketName, input.objectKey, deps);
  if (!scanStatus) {
    throw new MalwareScanPendingError(documentId);
  }
  if (scanStatus === 'THREATS_FOUND') {
    console.error('MALWARE_INFECTED', { documentId, objectKey: input.objectKey });
    const occurredAt = await updateDocumentStatus(document, 'INFECTED', deps, {
      scanResult: scanStatus,
    });
    await writeProcessorAudit(
      document,
      'MALWARE_DETECTED',
      'REJECTED',
      occurredAt,
      deps,
      'GuardDuty phát hiện mã độc trong file.',
    );
    return { documentId, status: 'INFECTED' };
  }
  if (scanStatus !== 'NO_THREATS_FOUND') {
    console.error('MALWARE_SCAN_FAILED', { documentId, scanStatus });
    const occurredAt = await updateDocumentStatus(document, 'FAILED', deps, {
      failureReason: `GuardDuty scan result: ${scanStatus}`,
      scanResult: scanStatus,
    });
    await writeProcessorAudit(
      document,
      'PROCESSING_FAILED',
      'FAILED',
      occurredAt,
      deps,
      `GuardDuty scan result: ${scanStatus}`,
    );
    return {
      documentId,
      status: 'FAILED',
      reason: `GuardDuty scan result: ${scanStatus}`,
    };
  }

  const cleanKey = cleanObjectKey(document);
  await deps.s3.send(
    new CopyObjectCommand({
      Bucket: deps.documentsBucketName,
      Key: cleanKey,
      CopySource: copySource(input.bucketName, input.objectKey),
      ContentType: document.contentType,
      MetadataDirective: 'COPY',
    }),
  );

  const occurredAt = await updateDocumentStatus(document, 'READY', deps, {
    cleanBucketName: deps.documentsBucketName,
    cleanObjectKey: cleanKey,
    scanResult: scanStatus,
  });
  await writeProcessorAudit(document, 'DOCUMENT_READY', 'SUCCESS', occurredAt, deps);

  return { documentId, status: 'READY' };
}
