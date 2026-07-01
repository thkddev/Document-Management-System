import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import type {
  AdminAuditAction,
  AdminUserActionRequest,
  CreateAdminUserRequest,
  UpdateAdminUserRequest,
} from '../domain/models.js';
import { documentPrincipalFromClaims } from '../shared/auth.js';
import { errorResponse, jsonResponse } from '../shared/http.js';
import {
  AdminUserAlreadyExistsError,
  AdminUserNotFoundError,
  AdminUserValidationError,
  AdminUsersForbiddenError,
  createAdminUser,
  listAdminUsers,
  runAdminUserAction,
  updateAdminUser,
} from '../services/admin-users.js';
import { listAdminAuditEvents, writeAdminAuditEvent } from '../services/admin-audit.js';

const cognito = new CognitoIdentityProviderClient({});
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

function parseUpdateAdminUserRequest(body: unknown): UpdateAdminUserRequest {
  const record = bodyRecord(body);
  return {
    email: typeof record.email === 'string' ? record.email : '',
    departmentId: typeof record.departmentId === 'string' ? record.departmentId : '',
    role: record.role as UpdateAdminUserRequest['role'],
  };
}

function parseAdminUserActionRequest(body: unknown): AdminUserActionRequest {
  const record = bodyRecord(body);
  const request: AdminUserActionRequest = {
    email: typeof record.email === 'string' ? record.email : '',
    action: record.action as AdminUserActionRequest['action'],
  };
  if (typeof record.password === 'string') {
    request.password = record.password;
  }
  return request;
}

function adminAuditActionForRequest(action: AdminUserActionRequest['action']): AdminAuditAction {
  if (action === 'DISABLE') return 'ADMIN_USER_DISABLED';
  if (action === 'ENABLE') return 'ADMIN_USER_ENABLED';
  return 'ADMIN_USER_PASSWORD_RESET';
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

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST' && event.httpMethod !== 'PATCH') {
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
  if (!process.env.TABLE_NAME) {
    return errorResponse(500, {
      code: 'CONFIGURATION_ERROR',
      message: 'Dịch vụ quản trị chưa được cấu hình bảng dữ liệu.',
      requestId,
    });
  }

  try {
    if (event.resource === '/admin/users/audit-events') {
      if (event.httpMethod !== 'GET') {
        return errorResponse(405, {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Phương thức không được hỗ trợ.',
          requestId,
        });
      }
      const items = await listAdminAuditEvents(principal, {
        dynamodb,
        tableName: process.env.TABLE_NAME,
      });
      return jsonResponse(200, { items });
    }

    if (event.resource === '/admin/users/actions') {
      if (event.httpMethod !== 'POST') {
        return errorResponse(405, {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Phương thức không được hỗ trợ.',
          requestId,
        });
      }
      const request = parseAdminUserActionRequest(parseBody(event.body));
      const item = await runAdminUserAction(principal, request, {
        cognito,
        userPoolId: process.env.USER_POOL_ID,
      });
      await writeAdminAuditEvent(
        {
          action: adminAuditActionForRequest(request.action),
          actor: principal,
          targetEmail: item.email,
          outcome: 'SUCCESS',
          requestId,
        },
        { dynamodb, tableName: process.env.TABLE_NAME },
      );
      console.info('ADMIN_USER_ACTION', {
        requestId,
        actorId: principal.userId,
        email: item.email,
        status: item.status,
      });
      return jsonResponse(200, { item });
    }

    if (event.httpMethod === 'POST') {
      const item = await createAdminUser(
        principal,
        parseCreateAdminUserRequest(parseBody(event.body)),
        {
          cognito,
          userPoolId: process.env.USER_POOL_ID,
        },
      );
      await writeAdminAuditEvent(
        {
          action: 'ADMIN_USER_CREATED',
          actor: principal,
          targetEmail: item.email,
          targetDepartmentId: item.departmentId,
          targetRoles: item.roles,
          outcome: 'SUCCESS',
          requestId,
        },
        { dynamodb, tableName: process.env.TABLE_NAME },
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

    if (event.httpMethod === 'PATCH') {
      const item = await updateAdminUser(
        principal,
        parseUpdateAdminUserRequest(parseBody(event.body)),
        {
          cognito,
          userPoolId: process.env.USER_POOL_ID,
        },
      );
      await writeAdminAuditEvent(
        {
          action: 'ADMIN_USER_UPDATED',
          actor: principal,
          targetEmail: item.email,
          targetDepartmentId: item.departmentId,
          targetRoles: item.roles,
          outcome: 'SUCCESS',
          requestId,
        },
        { dynamodb, tableName: process.env.TABLE_NAME },
      );
      console.info('ADMIN_USER_UPDATED', {
        requestId,
        actorId: principal.userId,
        email: item.email,
        departmentId: item.departmentId,
        roles: item.roles,
      });
      return jsonResponse(200, { item });
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

    if (err instanceof AdminUserNotFoundError) {
      return errorResponse(404, {
        code: 'ADMIN_USER_NOT_FOUND',
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

    const failureCode =
      event.resource === '/admin/users/actions'
        ? 'ADMIN_USER_ACTION_FAILED'
        : event.httpMethod === 'POST'
        ? 'CREATE_ADMIN_USER_FAILED'
        : event.httpMethod === 'PATCH'
          ? 'UPDATE_ADMIN_USER_FAILED'
          : 'LIST_ADMIN_USERS_FAILED';
    const failureMessage =
      event.resource === '/admin/users/actions'
        ? 'Không thể thực hiện thao tác tài khoản. Vui lòng thử lại.'
        : event.httpMethod === 'POST'
        ? 'Không thể tạo người dùng. Vui lòng thử lại.'
        : event.httpMethod === 'PATCH'
          ? 'Không thể cập nhật người dùng. Vui lòng thử lại.'
          : 'Không thể tải danh sách người dùng. Vui lòng thử lại.';

    console.error('adminUsers request failed', { requestId, method: event.httpMethod, err });
    return errorResponse(500, {
      code: failureCode,
      message: failureMessage,
      requestId,
    });
  }
};
