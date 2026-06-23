import { apiFetch } from './api-client';

export type DocumentClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type DocumentAccessScope = 'DEPARTMENT' | 'ALL_EMPLOYEES';

export interface CreateUploadIntentRequest {
  title: string;
  departmentId: string;
  classification: DocumentClassification;
  accessScope?: DocumentAccessScope;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  tags?: string[];
}

export interface UploadIntent {
  uploadIntentId: string;
  documentId: string;
  versionNumber: number;
  uploadUrl: string;
  expiresAt: string;
  uploadHeaders: Record<string, string>;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function calculateSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return toHex(digest);
}

export async function createUploadIntent(
  request: CreateUploadIntentRequest,
): Promise<UploadIntent> {
  return apiFetch<UploadIntent>('/documents/upload-intents', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function uploadFileToSignedUrl(file: File, intent: UploadIntent): Promise<void> {
  const response = await fetch(intent.uploadUrl, {
    method: 'PUT',
    headers: intent.uploadHeaders,
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Upload thất bại với HTTP ${response.status}.`);
  }
}
