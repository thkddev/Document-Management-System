import type { APIGatewayProxyEvent } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { handler } from '../src/handlers/me.js';

function createEvent(claims?: Record<string, unknown>): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    path: '/me',
    pathParameters: null,
    queryStringParameters: null,
    resource: '/me',
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      authorizer: claims ? { claims } : undefined,
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'vitest',
        userArn: null,
      },
      path: '/me',
      requestId: 'request-123',
      requestTimeEpoch: 0,
      resourceId: 'resource-id',
      resourcePath: '/me',
      stage: 'test',
    },
  };
}

describe('GET /me handler', () => {
  it('trả thông tin user từ Cognito claims', async () => {
    const response = await handler(
      createEvent({
        sub: '064ecda0-f5c9-4fab-98f1-d16491ce6818',
        email: 'USER@EXAMPLE.COM',
        name: 'Trịnh Anh',
        'custom:departmentId': 'TECH',
        'cognito:groups': 'EMPLOYEE,DEPARTMENT_ADMIN',
      }),
      {} as never,
      () => undefined,
    );

    expect(response?.statusCode).toBe(200);
    expect(JSON.parse(response?.body ?? '{}')).toMatchObject({
      email: 'user@example.com',
      departmentId: 'TECH',
      roles: ['EMPLOYEE', 'DEPARTMENT_ADMIN'],
    });
  });

  it('từ chối request không có claims', async () => {
    const response = await handler(createEvent(), {} as never, () => undefined);

    expect(response?.statusCode).toBe(401);
  });
});
