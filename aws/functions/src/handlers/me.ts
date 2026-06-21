import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import type { CurrentUser } from '../domain/models.js';
import { parseUserRoles } from '../shared/auth.js';
import { errorResponse, jsonResponse } from '../shared/http.js';

export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  const claims = event.requestContext.authorizer?.claims;

  if (!claims || typeof claims.sub !== 'string') {
    return errorResponse(401, {
      code: 'UNAUTHORIZED',
      message: 'Thông tin xác thực không hợp lệ hoặc đã hết hạn.',
      requestId,
    });
  }

  const departmentId = claims['custom:departmentId'];
  if (typeof departmentId !== 'string' || departmentId.length === 0) {
    return errorResponse(403, {
      code: 'PROFILE_INCOMPLETE',
      message: 'Tài khoản chưa được gán phòng ban.',
      requestId,
    });
  }

  const currentUser: CurrentUser = {
    userId: claims.sub,
    email: typeof claims.email === 'string' ? claims.email.toLowerCase() : '',
    displayName:
      typeof claims.name === 'string' && claims.name.length > 0 ? claims.name : claims.sub,
    departmentId,
    roles: parseUserRoles(claims['cognito:groups']),
  };

  return jsonResponse(200, currentUser);
};
