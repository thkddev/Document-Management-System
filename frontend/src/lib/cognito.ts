/**
 * Wrapper mỏng quanh amazon-cognito-identity-js.
 * React component và hook không import trực tiếp từ thư viện này —
 * chỉ import từ module này để dễ mock trong test.
 *
 * Quy tắc bảo mật:
 * - Không log ID token, refresh token hay password.
 * - Token chỉ được lưu trong bộ nhớ của CognitoUserPool (localStorage mặc định của SDK).
 * - Không truyền token vào URL hay custom header không cần thiết.
 */

import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { config } from './config';

// Pool singleton — khởi tạo lazy để test có thể mock config trước khi import
let _pool: CognitoUserPool | null = null;

function getPool(): CognitoUserPool {
  if (!_pool) {
    _pool = new CognitoUserPool({
      UserPoolId: config.cognitoUserPoolId,
      ClientId: config.cognitoClientId,
    });
  }
  return _pool;
}

export interface SignInResult {
  /** ID token để gọi API Gateway Cognito authorizer */
  idToken: string;
  /** Thông tin cơ bản từ ID token claims */
  email: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function mapCognitoAuthFailure(err: { code?: string; message?: string }): AuthError {
  const code = err.code ?? 'UnknownError';
  const detail = err.message?.toLocaleLowerCase('en') ?? '';
  let message = 'Đăng nhập thất bại. Vui lòng thử lại.';

  if (code === 'UserDisabledException' || detail.includes('disabled')) {
    message = 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.';
  } else if (code === 'NotAuthorizedException') {
    message = 'Email hoặc mật khẩu không đúng.';
  } else if (code === 'UserNotFoundException') {
    // Trả cùng message để không tiết lộ user có tồn tại hay không
    message = 'Email hoặc mật khẩu không đúng.';
  } else if (code === 'UserNotConfirmedException') {
    message = 'Tài khoản chưa được xác nhận. Liên hệ quản trị viên.';
  } else if (code === 'PasswordResetRequiredException') {
    message = 'Mật khẩu cần được đặt lại. Liên hệ quản trị viên.';
  }

  return new AuthError(message, code);
}

/** Đăng nhập bằng email và mật khẩu. Trả ID token khi thành công. */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  return new Promise((resolve, reject) => {
    const pool = getPool();
    const user = new CognitoUser({ Username: email.toLowerCase().trim(), Pool: pool });
    user.setAuthenticationFlowType('USER_PASSWORD_AUTH');
    const authDetails = new AuthenticationDetails({
      Username: email.toLowerCase().trim(),
      Password: password,
    });

    user.authenticateUser(authDetails, {
      onSuccess(session) {
        resolve({
          idToken: session.getIdToken().getJwtToken(),
          email: session.getIdToken().payload['email'] as string,
        });
      },
      onFailure(err: { code?: string; message?: string }) {
        reject(mapCognitoAuthFailure(err));
      },
      newPasswordRequired() {
        reject(
          new AuthError(
            'Tài khoản yêu cầu đổi mật khẩu lần đầu. Liên hệ quản trị viên.',
            'NewPasswordRequired',
          ),
        );
      },
    });
  });
}

/** Lấy ID token hiện tại. Tự động refresh nếu cần. Trả null nếu không có session. */
export async function getCurrentAccessToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const user = getPool().getCurrentUser();
    if (!user) {
      resolve(null);
      return;
    }

    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }
      resolve(session.getIdToken().getJwtToken());
    });
  });
}

/** Đăng xuất khỏi Cognito và xóa token khỏi storage. */
export function signOut(): void {
  const user = getPool().getCurrentUser();
  user?.signOut();
}

/** Kiểm tra có session hợp lệ đang tồn tại không (không gọi network). */
export async function hasValidSession(): Promise<boolean> {
  const token = await getCurrentAccessToken();
  return token !== null;
}
