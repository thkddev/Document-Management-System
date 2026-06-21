import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
  createDownloadIntent,
  DocumentNotFoundError,
  DocumentNotReadyError,
} from '../services/document-download.js';
import { documentPrincipalFromClaims } from '../shared/auth.js';
import { errorResponse, jsonResponse } from '../shared/http.js';

const dynamodb = new DynamoDBClient({});
const s3 = new S3Client({});

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
  if (event.httpMethod !== 'POST') {
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
  if (!process.env.TABLE_NAME || !process.env.DOCUMENTS_BUCKET_NAME) {
    return errorResponse(500, {
      code: 'CONFIGURATION_ERROR',
      message: 'Dịch vụ tải tài liệu chưa được cấu hình đầy đủ.',
      requestId,
    });
  }

  try {
    const intent = await createDownloadIntent(documentId, principal, {
      dynamodb,
      s3,
      tableName: process.env.TABLE_NAME,
      documentsBucketName: process.env.DOCUMENTS_BUCKET_NAME,
      requestId,
    });
    return jsonResponse(201, intent);
  } catch (err) {
    if (err instanceof DocumentNotFoundError) {
      return errorResponse(404, {
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Không tìm thấy tài liệu.',
        requestId,
      });
    }
    if (err instanceof DocumentNotReadyError) {
      return errorResponse(409, {
        code: 'DOCUMENT_NOT_READY',
        message: 'Tài liệu chưa sẵn sàng để tải xuống.',
        requestId,
      });
    }
    console.error('createDownloadIntent failed', {
      requestId,
      documentId,
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });
    return errorResponse(500, {
      code: 'CREATE_DOWNLOAD_INTENT_FAILED',
      message: 'Không thể tạo liên kết tải xuống. Vui lòng thử lại.',
      requestId,
    });
  }
};
