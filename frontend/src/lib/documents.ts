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

export interface DepartmentShareResult {
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

interface ListShareRequestsResponse {
  items: DepartmentShareRequestSummary[];
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

export function createDepartmentShare(
  documentId: string,
  targetDepartmentId: string,
): Promise<DepartmentShareResult> {
  return apiFetch<DepartmentShareResult>(
    `/documents/${encodeURIComponent(documentId)}/department-shares`,
    {
      method: 'POST',
      body: JSON.stringify({ targetDepartmentId }),
    },
  );
}

export async function listPendingShareRequests(): Promise<DepartmentShareRequestSummary[]> {
  const response = await apiFetch<ListShareRequestsResponse>('/share-requests');
  return response.items;
}

export function approveShareRequest(
  shareRequestId: string,
): Promise<{ shareRequestId: string; status: 'APPROVED' }> {
  return apiFetch<{ shareRequestId: string; status: 'APPROVED' }>(
    `/share-requests/${encodeURIComponent(shareRequestId)}/approve`,
    { method: 'POST' },
  );
}

export function rejectShareRequest(
  shareRequestId: string,
  reason: string,
): Promise<{ shareRequestId: string; status: 'REJECTED' }> {
  return apiFetch<{ shareRequestId: string; status: 'REJECTED' }>(
    `/share-requests/${encodeURIComponent(shareRequestId)}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
}

export function triggerBrowserDownload(intent: DownloadIntent): void {
  window.location.assign(intent.downloadUrl);
}
