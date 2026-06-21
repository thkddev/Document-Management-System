import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '../src/domain/models.js';
import {
  parseCreateUploadIntentRequest,
  UploadIntentValidationError,
} from '../src/domain/upload-policy.js';
import { createUploadIntent } from '../src/services/upload-intents.js';

const user: CurrentUser = {
  userId: '064ecda0-f5c9-4fab-98f1-d16491ce6818',
  email: 'user@example.com',
  displayName: 'Trịnh Anh',
  departmentId: 'TECH',
  roles: ['EMPLOYEE'],
};

const validRequest = {
  title: 'Đặc tả DMS',
  departmentId: 'TECH',
  classification: 'CONFIDENTIAL',
  originalFileName: 'dac-ta-dms.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1024,
  checksumSha256: 'a'.repeat(64),
};

describe('upload intent policy', () => {
  it('accepts a valid upload intent request', () => {
    expect(parseCreateUploadIntentRequest(validRequest)).toMatchObject({
      title: 'Đặc tả DMS',
      classification: 'CONFIDENTIAL',
      checksumSha256: 'a'.repeat(64),
    });
  });

  it('rejects unsupported file types and oversize files', () => {
    expect(() =>
      parseCreateUploadIntentRequest({
        ...validRequest,
        contentType: 'application/x-msdownload',
        sizeBytes: 50 * 1024 * 1024,
      }),
    ).toThrow(UploadIntentValidationError);
  });
});

describe('createUploadIntent', () => {
  it('creates a signed upload URL and stores metadata records', async () => {
    const send = vi.fn().mockResolvedValue({});
    const dynamodb = { send } as unknown as Pick<DynamoDBClient, 'send'>;
    const s3 = new S3Client({
      region: 'ap-southeast-1',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    });
    const ids = ['upload-1', 'document-1'];

    const intent = await createUploadIntent(parseCreateUploadIntentRequest(validRequest), user, {
      dynamodb,
      s3,
      tableName: 'dms-test',
      quarantineBucketName: 'dms-quarantine-test',
      now: () => new Date('2026-06-19T07:00:00.000Z'),
      createId: () => ids.shift() ?? 'fallback-id',
      presignSeconds: 60,
    });

    expect(intent).toMatchObject({
      uploadIntentId: 'upload-1',
      documentId: 'document-1',
      versionNumber: 1,
      expiresAt: '2026-06-19T07:01:00.000Z',
    });
    expect(intent.uploadHeaders).toEqual({ 'content-type': 'application/pdf' });
    expect(intent.uploadUrl).toContain('dms-quarantine-test');
    const signedUrl = new URL(intent.uploadUrl);
    expect(signedUrl.searchParams.get('x-amz-meta-upload-intent-id')).toBe('upload-1');
    expect(signedUrl.searchParams.get('x-amz-meta-document-id')).toBe('document-1');
    expect(signedUrl.searchParams.get('x-amz-meta-checksum-sha256')).toBe('a'.repeat(64));
    expect(signedUrl.searchParams.get('x-amz-meta-owner-id')).toBe(user.userId);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({
        input: expect.objectContaining({
          ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
        }),
      }),
    );
  });
});
