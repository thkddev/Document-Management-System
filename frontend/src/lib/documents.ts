import { apiFetch } from './api-client';

export type DocumentClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type DocumentAccessScope = 'DEPARTMENT' | 'ALL_EMPLOYEES';

export type DocumentStatus =
  | 'UPLOAD_PENDING'
  | 'UPLOADED'
  | 'VALIDATING'
  | 'SCANNING'
  | 'READY'
  | 'INFECTED'
  | 'REJECTED'
  | 'FAILED';

export interface DocumentSummary {
  documentId: string;
  title: string;
  originalFileName: string;
  contentType: string;
  classification: DocumentClassification;
  departmentId: string;
  ownerId: string;
  ownerEmail: string;
  accessScope: DocumentAccessScope;
  sizeBytes: number;
  currentVersion: number;
  status: DocumentStatus;
  statusReason?: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  createdAt: string;
}

export interface DownloadIntent {
  downloadUrl: string;
  expiresAt: string;
  fileName: string;
}

interface ListDocumentsResponse {
  items: DocumentSummary[];
}

export const processingDocumentStatuses: ReadonlySet<DocumentStatus> = new Set([
  'UPLOAD_PENDING',
  'UPLOADED',
  'VALIDATING',
  'SCANNING',
]);

export function hasProcessingDocuments(documents: DocumentSummary[]): boolean {
  return documents.some((document) => processingDocumentStatuses.has(document.status));
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const response = await apiFetch<ListDocumentsResponse>('/documents');
  return response.items;
}

export function getDocumentDetail(documentId: string): Promise<DocumentDetail> {
  return apiFetch<DocumentDetail>(`/documents/${encodeURIComponent(documentId)}`);
}

export function createDownloadIntent(documentId: string): Promise<DownloadIntent> {
  return apiFetch<DownloadIntent>(`/documents/${encodeURIComponent(documentId)}/download-intents`, {
    method: 'POST',
  });
}

export function triggerBrowserDownload(intent: DownloadIntent): void {
  const link = document.createElement('a');
  link.href = intent.downloadUrl;
  link.download = intent.fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}
