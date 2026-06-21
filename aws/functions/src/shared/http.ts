import type { APIGatewayProxyResult } from 'aws-lambda';

interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}

const commonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': process.env.CORS_ALLOW_ORIGIN ?? 'http://localhost:5173',
  'access-control-allow-headers': 'authorization,content-type,x-request-id',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  vary: 'Origin',
};

export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: commonHeaders,
    body: JSON.stringify(body),
  };
}

export function errorResponse(statusCode: number, body: ApiErrorBody): APIGatewayProxyResult {
  return jsonResponse(statusCode, body);
}
