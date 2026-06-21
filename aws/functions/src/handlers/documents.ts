import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { errorResponse, jsonResponse } from '../shared/http.js';
import { listDocumentsByDepartment } from '../services/documents.js';

const dynamodb = new DynamoDBClient({});

export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  const claims = event.requestContext.authorizer?.claims;
  const departmentId = claims?.['custom:departmentId'];

  if (typeof claims?.sub !== 'string' || typeof departmentId !== 'string' || !departmentId) {
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

  if (!process.env.TABLE_NAME) {
    return errorResponse(500, {
      code: 'CONFIGURATION_ERROR',
      message: 'Dịch vụ tài liệu chưa được cấu hình đầy đủ.',
      requestId,
    });
  }

  try {
    const items = await listDocumentsByDepartment(departmentId, {
      dynamodb,
      tableName: process.env.TABLE_NAME,
    });
    return jsonResponse(200, { items });
  } catch (err) {
    console.error('listDocuments failed', { requestId, err });
    return errorResponse(500, {
      code: 'LIST_DOCUMENTS_FAILED',
      message: 'Không thể tải danh sách tài liệu. Vui lòng thử lại.',
      requestId,
    });
  }
};
