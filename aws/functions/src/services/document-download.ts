import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { DocumentPrincipal, DownloadIntent } from '../domain/models.js';
import { writeAuditEvent } from './audit.js';
import { loadAuthorizedDocument, type DocumentAccessDeps } from './document-access.js';

export class DocumentNotFoundError extends Error {
  constructor() {
    super('Không tìm thấy tài liệu.');
    this.name = 'DocumentNotFoundError';
  }
}

export class DocumentNotReadyError extends Error {
  constructor() {
    super('Tài liệu chưa sẵn sàng để tải xuống.');
    this.name = 'DocumentNotReadyError';
  }
}

type Presign = (
  client: S3Client,
  command: GetObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

export interface DownloadIntentDeps extends DocumentAccessDeps {
  s3: S3Client;
  documentsBucketName: string;
  requestId: string;
  now?: () => Date;
  presign?: Presign;
}

function safeAsciiFileName(fileName: string): string {
  const safe = Array.from(fileName, (character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 ||
      code > 0x7e ||
      character === '"' ||
      character === '\\' ||
      character === '/'
      ? '_'
      : character;
  })
    .join('')
    .trim();
  return safe || 'document';
}

function encodedFileName(fileName: string): string {
  return encodeURIComponent(fileName).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function contentDisposition(fileName: string): string {
  return `attachment; filename="${safeAsciiFileName(fileName)}"; filename*=UTF-8''${encodedFileName(fileName)}`;
}

export async function createDownloadIntent(
  documentId: string,
  principal: DocumentPrincipal,
  deps: DownloadIntentDeps,
): Promise<DownloadIntent> {
  const document = await loadAuthorizedDocument(documentId, principal, deps);
  if (!document) throw new DocumentNotFoundError();
  if (document.detail.status !== 'READY' || !document.cleanObjectKey) {
    throw new DocumentNotReadyError();
  }

  const expiresIn = 300;
  const now = deps.now?.() ?? new Date();
  const command = new GetObjectCommand({
    Bucket: deps.documentsBucketName,
    Key: document.cleanObjectKey,
    ResponseContentDisposition: contentDisposition(document.detail.originalFileName),
    ResponseContentType: document.detail.contentType,
  });
  const downloadUrl = await (deps.presign ?? getSignedUrl)(deps.s3, command, { expiresIn });

  await writeAuditEvent(
    {
      documentId,
      versionNumber: document.detail.currentVersion,
      action: 'DOCUMENT_DOWNLOAD_REQUESTED',
      actorType: 'USER',
      actorId: principal.userId,
      source: 'API',
      outcome: 'SUCCESS',
      occurredAt: now.toISOString(),
      requestId: deps.requestId,
    },
    deps,
  );

  return {
    downloadUrl,
    expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    fileName: document.detail.originalFileName,
  };
}
