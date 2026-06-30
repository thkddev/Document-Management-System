import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import type { CreateAdminUserRequest } from '../domain/models.js';
import { documentPrincipalFromClaims } from '../shared/auth.js';
import { errorResponse, jsonResponse } from '../shared/http.js';
import {
  AdminUserAlreadyExistsError,
  AdminUserValidationError,
  AdminUsersForbiddenError,
  createAdminUser,
  listAdminUsers,
} from '../services/admin-users.js';

const cognito = new CognitoIdentityProviderClient({});

function parseBody(body: string | null): unknown {
  if (!body) return {};
  return JSON.parse(body) as unknown;
}

function bodyRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function parseCreateAdminUserRequest(body: unknown): CreateAdminUserRequest {
  const record = bodyRecord(body);
  return {
    email: typeof record.email === 'string' ? record.email : '',
    name: typeof record.name === 'string' ? record.name : '',
    departmentId: typeof record.departmentId === 'string' ? record.departmentId : '',
    role: record.role as CreateAdminUserRequest['role'],
    password: typeof record.password === 'string' ? record.password : '',
  };
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

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return errorResponse(405, {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Phương thức không được hỗ trợ.',
      requestId,
    });
  }

  if (!process.env.USER_POOL_ID) {
    return errorResponse(500, {
      code: 'CONFIGURATION_ERROR',
      message: 'Dịch vụ quản trị chưa được cấu hình User Pool.',
      requestId,
    });
  }

  try {
    if (event.httpMethod === 'POST') {
      const item = await createAdminUser(
        principal,
        parseCreateAdminUserRequest(parseBody(event.body)),
        {
          cognito,
          userPoolId: process.env.USER_POOL_ID,
        },
      );
      console.info('ADMIN_USER_CREATED', {
        requestId,
        actorId: principal.userId,
        email: item.email,
        departmentId: item.departmentId,
        roles: item.roles,
      });
      return jsonResponse(201, { item });
    }

    const items = await listAdminUsers(principal, {
      cognito,
      userPoolId: process.env.USER_POOL_ID,
    });
    return jsonResponse(200, { items });
  } catch (err) {
    if (err instanceof AdminUsersForbiddenError) {
      return errorResponse(403, {
        code: 'FORBIDDEN',
        message: err.message,
        requestId,
      });
    }

    if (err instanceof AdminUserValidationError) {
      return errorResponse(400, {
        code: 'VALIDATION_ERROR',
        message: err.message,
        requestId,
        details: { issues: err.issues },
      });
    }

    if (err instanceof AdminUserAlreadyExistsError) {
      return errorResponse(409, {
        code: 'ADMIN_USER_ALREADY_EXISTS',
        message: err.message,
        requestId,
      });
    }

    if (err instanceof SyntaxError) {
      return errorResponse(400, {
        code: 'VALIDATION_ERROR',
        message: 'Body phải là JSON hợp lệ.',
        requestId,
      });
    }

    console.error('listAdminUsers failed', { requestId, err });
    return errorResponse(500, {
      code: event.httpMethod === 'POST' ? 'CREATE_ADMIN_USER_FAILED' : 'LIST_ADMIN_USERS_FAILED',
      message:
        event.httpMethod === 'POST'
          ? 'Không thể tạo người dùng. Vui lòng thử lại.'
          : 'Không thể tải danh sách người dùng. Vui lòng thử lại.',
      requestId,
    });
  }
};
