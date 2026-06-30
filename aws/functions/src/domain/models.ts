export const userRoles = ['EMPLOYEE', 'DEPARTMENT_ADMIN', 'SYSTEM_ADMIN'] as const;

export type UserRole = (typeof userRoles)[number];

export interface CurrentUser {
  userId: string;
  email: string;
  displayName: string;
  departmentId: string;
  roles: UserRole[];
}

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  departmentId: string;
  roles: UserRole[];
  status: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListAdminUsersResponse {
  items: AdminUserSummary[];
}

export interface CreateAdminUserRequest {
  email: string;
  name: string;
  departmentId: string;
  role: UserRole;
  password: string;
}

export interface CreateAdminUserResponse {
  item: AdminUserSummary;
}

export const documentClassifications = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
] as const;

export type DocumentClassification = (typeof documentClassifications)[number];

export const documentAccessScopes = ['DEPARTMENT', 'ALL_EMPLOYEES'] as const;

export type DocumentAccessScope = (typeof documentAccessScopes)[number];

export const departmentShareStatuses = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export type DepartmentShareStatus = (typeof departmentShareStatuses)[number];

export const documentStatuses = [
  'UPLOAD_PENDING',
  'UPLOADED',
  'VALIDATING',
  'SCANNING',
  'READY',
  'INFECTED',
  'REJECTED',
  'FAILED',
] as const;

export type DocumentStatus = (typeof documentStatuses)[number];

export interface CreateUploadIntentRequest {
  title: string;
  departmentId: string;
  classification: DocumentClassification;
  accessScope: DocumentAccessScope;
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

export interface DocumentAuditEvent {
  eventId: string;
  action: AuditAction;
  actorType: AuditActorType;
  actorId: string;
  source: AuditSource;
  outcome: AuditOutcome;
  occurredAt: string;
  versionNumber: number;
  reason?: string;
  details?: Record<string, string | number | boolean>;
}

export interface ListDocumentAuditEventsResponse {
  items: DocumentAuditEvent[];
}

export interface DocumentPrincipal {
  userId: string;
  departmentId: string;
  roles: UserRole[];
  email?: string;
}

export interface ListDocumentsResponse {
  items: DocumentSummary[];
}

export const auditActions = [
  'UPLOAD_INTENT_CREATED',
  'UPLOAD_VALIDATED',
  'MALWARE_SCAN_STARTED',
  'DOCUMENT_READY',
  'DOCUMENT_REJECTED',
  'MALWARE_DETECTED',
  'PROCESSING_FAILED',
  'MESSAGE_DEAD_LETTERED',
  'DOCUMENT_DOWNLOAD_REQUESTED',
  'DOCUMENT_SHARE_REQUESTED',
  'DOCUMENT_SHARE_GRANTED',
  'DOCUMENT_SHARE_APPROVED',
  'DOCUMENT_SHARE_REJECTED',
  'DOCUMENT_SHARE_REVOKED',
] as const;

export type AuditAction = (typeof auditActions)[number];
export type AuditActorType = 'USER' | 'SYSTEM';
export type AuditSource = 'API' | 'UPLOAD_PROCESSOR' | 'DLQ_PROCESSOR';
export type AuditOutcome = 'SUCCESS' | 'REJECTED' | 'FAILED';
