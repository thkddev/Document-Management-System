import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { userRoles, type CurrentUser, type UserRole } from '../domain/models.js';
import {
  parseCreateUploadIntentRequest,
  UploadIntentValidationError,
} from '../domain/upload-policy.js';
import { errorResponse, jsonResponse } from '../shared/http.js';
import { createUploadIntent } from '../services/upload-intents.js';

const dynamodb = new DynamoDBClient({});
const s3 = new S3Client({});

function parseGroups(rawGroups: unknown): UserRole[] {
  const groups = Array.isArray(rawGroups)
    ? rawGroups
    : typeof rawGroups === 'string'
      ? rawGroups.split(',').map((group) => group.trim())
      : [];

  return groups.filter((group): group is UserRole => userRoles.includes(group as UserRole));
}

function currentUserFromClaims(claims: Record<string, unknown> | undefined): CurrentUser | null {
  if (!claims || typeof claims.sub !== 'string') {
    return null;
  }

  const departmentId = claims['custom:departmentId'];
  if (typeof departmentId !== 'string' || departmentId.length === 0) {
    return null;
  }

  return {
    userId: claims.sub,
    email: typeof claims.email === 'string' ? claims.email.toLowerCase() : '',
    displayName:
      typeof claims.name === 'string' && claims.name.length > 0 ? claims.name : claims.sub,
    departmentId,
    roles: parseGroups(claims['cognito:groups']),
  };
}

function parseJsonBody(body: string | null): unknown {
  if (!body) {
    throw new UploadIntentValidationError([
      { field: 'body', message: 'Body không được để trống.' },
    ]);
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new UploadIntentValidationError([
      { field: 'body', message: 'Body phải là JSON hợp lệ.' },
    ]);
  }
}

export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  const user = currentUserFromClaims(event.requestContext.authorizer?.claims);

  if (!user) {
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

  if (!process.env.TABLE_NAME || !process.env.QUARANTINE_BUCKET_NAME) {
    return errorResponse(500, {
      code: 'CONFIGURATION_ERROR',
      message: 'Dịch vụ upload chưa được cấu hình đầy đủ.',
      requestId,
    });
  }

  try {
    const request = parseCreateUploadIntentRequest(parseJsonBody(event.body));
    const uploadIntent = await createUploadIntent(request, user, {
      dynamodb,
      s3,
      tableName: process.env.TABLE_NAME,
      quarantineBucketName: process.env.QUARANTINE_BUCKET_NAME,
      requestId,
    });

    return jsonResponse(201, uploadIntent);
  } catch (err) {
    if (err instanceof UploadIntentValidationError) {
      return errorResponse(400, {
        code: 'VALIDATION_ERROR',
        message: 'Thông tin upload không hợp lệ.',
        requestId,
        details: { issues: err.issues },
      });
    }

    console.error('createUploadIntent failed', { requestId, err });
    return errorResponse(500, {
      code: 'UPLOAD_INTENT_FAILED',
      message: 'Không thể tạo yêu cầu upload. Vui lòng thử lại.',
      requestId,
    });
  }
};
