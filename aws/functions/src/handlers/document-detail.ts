import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { getDocumentDetail } from '../services/document-access.js';
import { documentPrincipalFromClaims } from '../shared/auth.js';
import { errorResponse, jsonResponse } from '../shared/http.js';

const dynamodb = new DynamoDBClient({});

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
  if (event.httpMethod !== 'GET') {
    return errorResponse(405, {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Phương thức không được hỗ trợ.',
      requestId,
    });
  }
  const documentId = event.pathParameters?.documentId;
  if (!documentId) {
    return errorResponse(404, {
      code: 'DOCUMENT_NOT_FOUND',
      message: 'Không tìm thấy tài liệu.',
      requestId,
    });
  }
  if (!process.env.TABLE_NAME) {
    return errorResponse(500, {
      code: 'CONFIGURATION_ERROR',
      message: 'Dịch vụ tài liệu chưa được cấu hình đầy đủ.',
      requestId,
    });
  }

  try {
    const document = await getDocumentDetail(documentId, principal, {
      dynamodb,
      tableName: process.env.TABLE_NAME,
    });
    if (!document) {
      return errorResponse(404, {
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Không tìm thấy tài liệu.',
        requestId,
      });
    }
    return jsonResponse(200, document);
  } catch (err) {
    console.error('getDocumentDetail failed', {
      requestId,
      documentId,
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });
    return errorResponse(500, {
      code: 'GET_DOCUMENT_FAILED',
      message: 'Không thể tải thông tin tài liệu. Vui lòng thử lại.',
      requestId,
    });
  }
};
