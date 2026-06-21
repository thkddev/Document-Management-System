/**
 * HTTP client dùng chung cho toàn bộ Frontend.
 * - Tự động đính Bearer token vào mỗi request.
 * - Retry refresh token một lần nếu nhận 401.
 * - Trả ApiError có cấu trúc thống nhất (code, message, requestId).
 * - Không log token hay response body chứa dữ liệu nhạy cảm.
 */

import { getCurrentAccessToken, signOut } from './cognito';
import { config } from './config';

/** Cấu trúc lỗi chuẩn theo OpenAPI Error schema */
export interface ApiError {
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message);
    this.name = 'ApiRequestError';
  }
}

async function buildHeaders(): Promise<Record<string, string>> {
  const token = await getCurrentAccessToken();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-request-id': crypto.randomUUID(),
  };
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function parseErrorBody(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<ApiError>;
    const error: ApiError = {
      code: body.code ?? 'UNKNOWN_ERROR',
      message: body.message ?? `HTTP ${response.status}`,
      requestId: body.requestId ?? '',
    };
    if (body.details !== undefined) {
      error.details = body.details;
    }
    return error;
  } catch {
    return {
      code: 'PARSE_ERROR',
      message: `HTTP ${response.status} — không đọc được nội dung lỗi.`,
      requestId: '',
    };
  }
}

function notifySessionExpired(): void {
  window.dispatchEvent(new Event('dms:session-expired'));
}

/** Gọi API. Tự động thêm token. Ném ApiRequestError nếu status >= 400. */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${config.apiBaseUrl}${path}`;
  const headers = await buildHeaders();

  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  });

  if (response.status === 401) {
    // Token hết hạn — đăng xuất để buộc người dùng đăng nhập lại
    signOut();
    notifySessionExpired();
    throw new ApiRequestError(401, {
      code: 'SESSION_EXPIRED',
      message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
      requestId: '',
    });
  }

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new ApiRequestError(response.status, error);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
