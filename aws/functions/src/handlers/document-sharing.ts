import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
  approveShareRequest,
  createDepartmentShare,
  DepartmentShareNotFoundError,
  DocumentShareConflictError,
  DocumentShareNotFoundError,
  DocumentShareValidationError,
  listApprovedDepartmentShares,
  listPendingShareRequests,
  rejectShareRequest,
  revokeDepartmentShare,
} from '../services/document-sharing.js';
import { documentPrincipalFromClaims } from '../shared/auth.js';
import { errorResponse, jsonResponse } from '../shared/http.js';

const dynamodb = new DynamoDBClient({});

function parseBody(body: string | null): unknown {
  if (!body) return {};
  return JSON.parse(body) as unknown;
}

function bodyRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  const principal = documentPrincipalFromClaims(event.requestContext.authorizer?.claims);
  if (!principal) {
    return errorResponse(401, {
      code: 'UNAUTHORIZED',
      message: 'Thông tin xác thực không hợp lệ hoặc tài khoản chưa đủ hồ sơ.',
      requestId,
    });
  }

  if (!process.env.TABLE_NAME) {
    return errorResponse(500, {
      code: 'CONFIGURATION_ERROR',
      message: 'Dịch vụ chia sẻ tài liệu chưa được cấu hình đầy đủ.',
      requestId,
    });
  }

  const deps = {
    dynamodb,
    tableName: process.env.TABLE_NAME,
    requestId,
  };

  try {
    if (event.resource === '/documents/{documentId}/department-shares') {
      const documentId = event.pathParameters?.documentId;
      if (!documentId) {
        return errorResponse(404, {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Không tìm thấy tài liệu.',
          requestId,
        });
      }
      if (event.httpMethod === 'GET') {
        return jsonResponse(200, {
          items: await listApprovedDepartmentShares(documentId, principal, deps),
        });
      }
      if (event.httpMethod !== 'POST') {
        return errorResponse(405, {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Phương thức không được hỗ trợ.',
          requestId,
        });
      }
      const body = bodyRecord(parseBody(event.body));
      const result = await createDepartmentShare(
        documentId,
        body.targetDepartmentId,
        principal,
        deps,
      );
      return jsonResponse(result.mode === 'GRANTED' ? 201 : 202, result);
    }

    if (event.resource === '/documents/{documentId}/department-shares/{targetDepartmentId}') {
      if (event.httpMethod !== 'DELETE') {
        return errorResponse(405, {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Phương thức không được hỗ trợ.',
          requestId,
        });
      }
      const documentId = event.pathParameters?.documentId;
      const targetDepartmentId = event.pathParameters?.targetDepartmentId;
      if (!documentId) {
        return errorResponse(404, {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Không tìm thấy tài liệu.',
          requestId,
        });
      }
      if (!targetDepartmentId) {
        return errorResponse(404, {
          code: 'DEPARTMENT_SHARE_NOT_FOUND',
          message: 'Không tìm thấy quyền chia sẻ phòng ban.',
          requestId,
        });
      }
      return jsonResponse(
        200,
        await revokeDepartmentShare(
          documentId,
          decodeURIComponent(targetDepartmentId),
          principal,
          deps,
        ),
      );
    }

    if (event.resource === '/share-requests') {
      if (event.httpMethod !== 'GET') {
        return errorResponse(405, {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Phương thức không được hỗ trợ.',
          requestId,
        });
      }
      return jsonResponse(200, { items: await listPendingShareRequests(principal, deps) });
    }

    if (event.resource === '/share-requests/{shareRequestId}/approve') {
      if (event.httpMethod !== 'POST') {
        return errorResponse(405, {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Phương thức không được hỗ trợ.',
          requestId,
        });
      }
      const shareRequestId = event.pathParameters?.shareRequestId;
      if (!shareRequestId) {
        return errorResponse(404, {
          code: 'SHARE_REQUEST_NOT_FOUND',
          message: 'Không tìm thấy yêu cầu chia sẻ.',
          requestId,
        });
      }
      return jsonResponse(200, await approveShareRequest(shareRequestId, principal, deps));
    }

    if (event.resource === '/share-requests/{shareRequestId}/reject') {
      if (event.httpMethod !== 'POST') {
        return errorResponse(405, {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Phương thức không được hỗ trợ.',
          requestId,
        });
      }
      const shareRequestId = event.pathParameters?.shareRequestId;
      if (!shareRequestId) {
        return errorResponse(404, {
          code: 'SHARE_REQUEST_NOT_FOUND',
          message: 'Không tìm thấy yêu cầu chia sẻ.',
          requestId,
        });
      }
      const body = bodyRecord(parseBody(event.body));
      return jsonResponse(
        200,
        await rejectShareRequest(shareRequestId, body.reason, principal, deps),
      );
    }

    return errorResponse(404, {
      code: 'ROUTE_NOT_FOUND',
      message: 'Không tìm thấy API chia sẻ tài liệu.',
      requestId,
    });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return errorResponse(400, {
        code: 'VALIDATION_ERROR',
        message: 'Nội dung request không phải JSON hợp lệ.',
        requestId,
      });
    }
    if (err instanceof DocumentShareValidationError) {
      return errorResponse(400, {
        code: 'VALIDATION_ERROR',
        message: err.message,
        requestId,
      });
    }
    if (err instanceof DepartmentShareNotFoundError) {
      return errorResponse(404, {
        code: 'DEPARTMENT_SHARE_NOT_FOUND',
        message: err.message,
        requestId,
      });
    }
    if (err instanceof DocumentShareNotFoundError) {
      return errorResponse(404, {
        code: event.resource?.startsWith('/share-requests')
          ? 'SHARE_REQUEST_NOT_FOUND'
          : 'DOCUMENT_NOT_FOUND',
        message: err.message,
        requestId,
      });
    }
    if (err instanceof DocumentShareConflictError) {
      return errorResponse(409, {
        code: err.code,
        message: err.message,
        requestId,
      });
    }

    console.error('documentSharing failed', {
      requestId,
      resource: event.resource,
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });
    return errorResponse(500, {
      code: 'DOCUMENT_SHARING_FAILED',
      message: 'Không thể xử lý chia sẻ tài liệu. Vui lòng thử lại.',
      requestId,
    });
  }
};
