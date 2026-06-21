/**
 * Đọc và validate biến môi trường runtime từ Vite.
 * Tất cả biến bắt buộc phải có trong .env (xem .env.example).
 * Không chứa giá trị mặc định cho production — lỗi rõ ràng tốt hơn im lặng.
 */

function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value || typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Biến môi trường "${key}" chưa được cấu hình. Kiểm tra file .env và tham chiếu .env.example.`,
    );
  }
  return value.trim();
}

function optionalEnv(key: string, fallback: string): string {
  const value = import.meta.env[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

export const config = {
  /** Cognito User Pool ID — lấy từ CDK output UserPoolId */
  cognitoUserPoolId: requireEnv('VITE_COGNITO_USER_POOL_ID'),
  /** Cognito App Client ID — lấy từ CDK output UserPoolClientId */
  cognitoClientId: requireEnv('VITE_COGNITO_CLIENT_ID'),
  /** Base URL của API Gateway — lấy từ CDK output ApiUrl */
  apiBaseUrl: requireEnv('VITE_API_BASE_URL').replace(/\/$/, ''),
  /** Tên môi trường để phân biệt dev/staging/production */
  environmentName: optionalEnv('VITE_ENVIRONMENT_NAME', 'dev'),
} as const;
