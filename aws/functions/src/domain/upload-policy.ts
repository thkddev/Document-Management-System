import {
  documentAccessScopes,
  documentClassifications,
  type CreateUploadIntentRequest,
  type DocumentAccessScope,
  type DocumentClassification,
} from './models.js';

export const maxUploadSizeBytes = 25 * 1024 * 1024;

export const allowedUploadContentTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
] as const;

export interface ValidationIssue {
  field: string;
  message: string;
}

export class UploadIntentValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super('Upload intent request is invalid.');
    this.name = 'UploadIntentValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isClassification(value: unknown): value is DocumentClassification {
  return (
    typeof value === 'string' &&
    documentClassifications.includes(value as DocumentClassification)
  );
}

function isAccessScope(value: unknown): value is DocumentAccessScope {
  return typeof value === 'string' && documentAccessScopes.includes(value as DocumentAccessScope);
}

function normalizeTags(value: unknown, issues: ValidationIssue[]): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    issues.push({ field: 'tags', message: 'Tags phải là danh sách.' });
    return undefined;
  }
  if (value.length > 20) {
    issues.push({ field: 'tags', message: 'Tối đa 20 tag.' });
    return undefined;
  }

  const tags: string[] = [];
  for (const [index, tag] of value.entries()) {
    if (typeof tag !== 'string' || tag.trim().length === 0 || tag.trim().length > 40) {
      issues.push({ field: `tags.${index}`, message: 'Tag phải có 1-40 ký tự.' });
      continue;
    }
    tags.push(tag.trim());
  }
  return tags.length > 0 ? tags : undefined;
}

export function parseCreateUploadIntentRequest(raw: unknown): CreateUploadIntentRequest {
  const issues: ValidationIssue[] = [];

  if (!isRecord(raw)) {
    throw new UploadIntentValidationError([
      { field: 'body', message: 'Body phải là JSON object.' },
    ]);
  }

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (title.length < 1 || title.length > 200) {
    issues.push({ field: 'title', message: 'Tiêu đề phải có 1-200 ký tự.' });
  }

  const departmentId = typeof raw.departmentId === 'string' ? raw.departmentId.trim() : '';
  if (departmentId.length < 2 || departmentId.length > 40) {
    issues.push({ field: 'departmentId', message: 'Phòng ban phải có 2-40 ký tự.' });
  }

  if (!isClassification(raw.classification)) {
    issues.push({ field: 'classification', message: 'Classification không hợp lệ.' });
  }

  const accessScope = raw.accessScope === undefined ? 'DEPARTMENT' : raw.accessScope;
  if (!isAccessScope(accessScope)) {
    issues.push({ field: 'accessScope', message: 'Phạm vi truy cập không hợp lệ.' });
  }

  const originalFileName =
    typeof raw.originalFileName === 'string' ? raw.originalFileName.trim() : '';
  if (originalFileName.length < 1 || originalFileName.length > 255) {
    issues.push({ field: 'originalFileName', message: 'Tên file phải có 1-255 ký tự.' });
  }

  const contentType = typeof raw.contentType === 'string' ? raw.contentType.trim() : '';
  if (!allowedUploadContentTypes.includes(contentType as (typeof allowedUploadContentTypes)[number])) {
    issues.push({ field: 'contentType', message: 'Định dạng file chưa được hỗ trợ.' });
  }

  const sizeBytes = typeof raw.sizeBytes === 'number' ? raw.sizeBytes : Number.NaN;
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxUploadSizeBytes) {
    issues.push({
      field: 'sizeBytes',
      message: `Dung lượng file phải lớn hơn 0 và không quá ${maxUploadSizeBytes} byte.`,
    });
  }

  const checksumSha256 = typeof raw.checksumSha256 === 'string' ? raw.checksumSha256.trim() : '';
  if (!/^[a-fA-F0-9]{64}$/.test(checksumSha256)) {
    issues.push({ field: 'checksumSha256', message: 'Checksum SHA-256 không hợp lệ.' });
  }

  const tags = normalizeTags(raw.tags, issues);

  if (issues.length > 0 || !isClassification(raw.classification) || !isAccessScope(accessScope)) {
    throw new UploadIntentValidationError(issues);
  }

  const request: CreateUploadIntentRequest = {
    title,
    departmentId,
    classification: raw.classification,
    accessScope,
    originalFileName,
    contentType,
    sizeBytes,
    checksumSha256: checksumSha256.toLowerCase(),
  };
  if (tags !== undefined) {
    request.tags = tags;
  }
  return request;
}
