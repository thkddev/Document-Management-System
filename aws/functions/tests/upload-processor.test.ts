import { createHash } from 'node:crypto';
import { GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import {
  CopyObjectCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { marshall } from '@aws-sdk/util-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import {
  MalwareScanPendingError,
  processUploadedObject,
} from '../src/services/upload-processor.js';

const validPdfBody = '%PDF-1.7\n%%';

const documentRecord = {
  pk: 'DOC#document-1',
  sk: 'META',
  entityType: 'Document',
  documentId: 'document-1',
  uploadIntentId: 'upload-1',
  ownerId: 'user-1',
  departmentId: 'TECH',
  status: 'UPLOAD_PENDING',
  contentType: 'application/pdf',
  sizeBytes: 11,
  checksumSha256: createHash('sha256').update(validPdfBody).digest('hex'),
  quarantineObjectKey: 'quarantine/TECH/user-1/document-1/v000001-test.pdf',
  originalFileName: 'test.pdf',
  currentVersion: 1,
  updatedAt: '2026-06-19T07:59:00.000Z',
};

function createDeps(
  body = validPdfBody,
  options: { scanStatus?: string; documentStatus?: string; checksumSha256?: string } = {},
) {
  const checksumSha256 = options.checksumSha256 ?? documentRecord.checksumSha256;
  const dynamodbSend = vi.fn(async (command) => {
    if (command instanceof GetItemCommand) {
      return {
        Item: marshall({
          ...documentRecord,
          status: options.documentStatus ?? documentRecord.status,
          checksumSha256,
        }),
      };
    }
    if (command instanceof UpdateItemCommand) {
      return {};
    }
    if (command instanceof PutItemCommand) {
      return {};
    }
    throw new Error(`Unexpected DynamoDB command ${command.constructor.name}`);
  });

  const s3Send = vi.fn(async (command) => {
    if (command instanceof HeadObjectCommand) {
      return {
        ContentLength: 11,
        ContentType: 'application/pdf',
        Metadata: {
          'document-id': 'document-1',
          'checksum-sha256': checksumSha256,
        },
      };
    }
    if (command instanceof GetObjectCommand) {
      return {
        Body: {
          transformToByteArray: async () => Buffer.from(body),
        },
      };
    }
    if (command instanceof GetObjectTaggingCommand) {
      return options.scanStatus
        ? {
            TagSet: [{ Key: 'GuardDutyMalwareScanStatus', Value: options.scanStatus }],
          }
        : { TagSet: [] };
    }
    if (command instanceof CopyObjectCommand) {
      return {};
    }
    throw new Error(`Unexpected S3 command ${command.constructor.name}`);
  });

  return {
    deps: {
      dynamodb: { send: dynamodbSend },
      s3: { send: s3Send },
      tableName: 'dms-test',
      documentsBucketName: 'documents-test',
      now: () => new Date('2026-06-19T08:00:00.000Z'),
    },
    dynamodbSend,
    s3Send,
  };
}

describe('processUploadedObject', () => {
  it('validates, scans, copies, and marks a document READY', async () => {
    const { deps, dynamodbSend, s3Send } = createDeps(validPdfBody, {
      scanStatus: 'NO_THREATS_FOUND',
    });

    const result = await processUploadedObject(
      {
        bucketName: 'quarantine-test',
        objectKey: 'quarantine/TECH/user-1/document-1/v000001-test.pdf',
      },
      deps,
    );

    expect(result).toEqual({ documentId: 'document-1', status: 'READY' });
    expect(s3Send).toHaveBeenCalledWith(expect.any(CopyObjectCommand));
    expect(
      s3Send.mock.calls.filter(([command]) => command instanceof GetObjectCommand),
    ).toHaveLength(1);
    expect(dynamodbSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          UpdateExpression: expect.stringContaining('#status = :status'),
        }),
      }),
    );
  });

  it('rejects a document when the object checksum does not match', async () => {
    const { deps, s3Send } = createDeps('tampered');

    const result = await processUploadedObject(
      {
        bucketName: 'quarantine-test',
        objectKey: 'quarantine/TECH/user-1/document-1/v000001-test.pdf',
      },
      deps,
    );

    expect(result).toMatchObject({
      documentId: 'document-1',
      status: 'REJECTED',
      reason: 'Checksum SHA-256 không khớp nội dung file.',
    });
    expect(s3Send).not.toHaveBeenCalledWith(expect.any(CopyObjectCommand));
  });

  it('marks an infected object and never copies it to the documents bucket', async () => {
    const { deps, s3Send } = createDeps(validPdfBody, { scanStatus: 'THREATS_FOUND' });

    const result = await processUploadedObject(
      {
        bucketName: 'quarantine-test',
        objectKey: documentRecord.quarantineObjectKey,
      },
      deps,
    );

    expect(result).toEqual({ documentId: 'document-1', status: 'INFECTED' });
    expect(s3Send).not.toHaveBeenCalledWith(expect.any(CopyObjectCommand));
  });

  it('asks SQS to retry while GuardDuty has not attached a scan result', async () => {
    const { deps, s3Send } = createDeps(validPdfBody, { documentStatus: 'SCANNING' });

    await expect(
      processUploadedObject(
        {
          bucketName: 'quarantine-test',
          objectKey: documentRecord.quarantineObjectKey,
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(MalwareScanPendingError);

    expect(s3Send).not.toHaveBeenCalledWith(expect.any(CopyObjectCommand));
  });

  it('marks the document FAILED when GuardDuty cannot scan the object', async () => {
    const { deps, s3Send } = createDeps(validPdfBody, { scanStatus: 'UNSUPPORTED' });

    const result = await processUploadedObject(
      {
        bucketName: 'quarantine-test',
        objectKey: documentRecord.quarantineObjectKey,
      },
      deps,
    );

    expect(result).toMatchObject({
      documentId: 'document-1',
      status: 'FAILED',
      reason: 'GuardDuty scan result: UNSUPPORTED',
    });
    expect(s3Send).not.toHaveBeenCalledWith(expect.any(CopyObjectCommand));
  });

  it('rejects a file whose real signature does not match its PDF declaration', async () => {
    const fakePdfBody = 'hello world';
    const { deps, s3Send } = createDeps(fakePdfBody, {
      checksumSha256: createHash('sha256').update(fakePdfBody).digest('hex'),
    });

    const result = await processUploadedObject(
      {
        bucketName: 'quarantine-test',
        objectKey: documentRecord.quarantineObjectKey,
      },
      deps,
    );

    expect(result).toMatchObject({
      status: 'REJECTED',
      reason: 'Không thể nhận diện định dạng thực của file.',
    });
    expect(s3Send).not.toHaveBeenCalledWith(expect.any(GetObjectTaggingCommand));
    expect(s3Send).not.toHaveBeenCalledWith(expect.any(CopyObjectCommand));
  });

  it('ensures audit without reprocessing terminal REJECTED documents', async () => {
    const { deps, dynamodbSend, s3Send } = createDeps(validPdfBody, {
      documentStatus: 'REJECTED',
    });

    const result = await processUploadedObject(
      {
        bucketName: 'quarantine-test',
        objectKey: documentRecord.quarantineObjectKey,
      },
      deps,
    );

    expect(result).toEqual({ documentId: 'document-1', status: 'REJECTED' });
    expect(dynamodbSend).toHaveBeenCalledTimes(2);
    expect(dynamodbSend).toHaveBeenCalledWith(expect.any(PutItemCommand));
    expect(s3Send).not.toHaveBeenCalled();
  });
});
