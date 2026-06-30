import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { documentPrincipalFromClaims } from '../shared/auth.js';
import { errorResponse, jsonResponse } from '../shared/http.js';
import { AdminUsersForbiddenError, listAdminUsers } from '../services/admin-users.js';

const cognito = new CognitoIdentityProviderClient({});

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

  if (!process.env.USER_POOL_ID) {
    return errorResponse(500, {
      code: 'CONFIGURATION_ERROR',
      message: 'Dịch vụ quản trị chưa được cấu hình User Pool.',
      requestId,
    });
  }

  try {
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

    console.error('listAdminUsers failed', { requestId, err });
    return errorResponse(500, {
      code: 'LIST_ADMIN_USERS_FAILED',
      message: 'Không thể tải danh sách người dùng. Vui lòng thử lại.',
      requestId,
    });
  }
};
