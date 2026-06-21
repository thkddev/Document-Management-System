/**
 * AuthContext — quản lý trạng thái phiên làm việc toàn ứng dụng.
 *
 * Lifecycle:
 * 1. Mount: kiểm tra session đã lưu → gọi GET /me để lấy CurrentUser.
 * 2. login(): gọi Cognito signIn → gọi GET /me → cập nhật state.
 * 3. logout(): gọi Cognito signOut → reset state về unauthenticated.
 * 4. Khi apiFetch nhận 401: gọi signOut() → AuthContext phát hiện
 *    qua event listener window 'dms:session-expired'.
 *
 * Không lưu token vào React state — token chỉ tồn tại trong SDK storage
 * và được lấy qua getCurrentAccessToken() mỗi request.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from 'react';
import { apiFetch, ApiRequestError } from '../../lib/api-client';
import { getCurrentAccessToken, signIn as cognitoSignIn, signOut as cognitoSignOut } from '../../lib/cognito';
import type { AuthState, CurrentUser } from '../../types/auth';

// ---------------------------------------------------------------------------
// State & Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: 'INIT_START' }
  | { type: 'AUTHENTICATED'; user: CurrentUser }
  | { type: 'UNAUTHENTICATED' }
  | { type: 'ERROR'; message: string }
  | { type: 'LOGOUT' };

function reducer(state: AuthState, action: Action): AuthState {
  switch (action.type) {
    case 'INIT_START':
      return { status: 'initializing', currentUser: null, errorMessage: null };
    case 'AUTHENTICATED':
      return { status: 'authenticated', currentUser: action.user, errorMessage: null };
    case 'UNAUTHENTICATED':
      return { status: 'unauthenticated', currentUser: null, errorMessage: null };
    case 'ERROR':
      return { status: 'error', currentUser: null, errorMessage: action.message };
    case 'LOGOUT':
      return { status: 'unauthenticated', currentUser: null, errorMessage: null };
  }
}

const initialState: AuthState = {
  status: 'initializing',
  currentUser: null,
  errorMessage: null,
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  /** Lấy CurrentUser từ /me và chuyển sang authenticated. */
  const loadCurrentUser = useCallback(async (): Promise<void> => {
    const user = await apiFetch<CurrentUser>('/me');
    dispatch({ type: 'AUTHENTICATED', user });
  }, []);

  /** Khôi phục session khi app khởi động. */
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      dispatch({ type: 'INIT_START' });
      try {
        const token = await getCurrentAccessToken();
        if (!token) {
          if (!cancelled) dispatch({ type: 'UNAUTHENTICATED' });
          return;
        }
        if (!cancelled) await loadCurrentUser();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.status === 403) {
          // Profile chưa hoàn chỉnh (thiếu departmentId)
          dispatch({
            type: 'ERROR',
            message: 'Tài khoản chưa được cấu hình đầy đủ. Liên hệ quản trị viên.',
          });
        } else {
          // Token tồn tại nhưng /me lỗi — xử lý an toàn bằng logout
          cognitoSignOut();
          dispatch({ type: 'UNAUTHENTICATED' });
        }
      }
    }

    void restoreSession();
    return () => { cancelled = true; };
  }, [loadCurrentUser]);

  /** Bắt sự kiện session-expired từ api-client (khi nhận 401). */
  useEffect(() => {
    function handleExpired() {
      cognitoSignOut();
      dispatch({ type: 'LOGOUT' });
    }
    window.addEventListener('dms:session-expired', handleExpired);
    return () => window.removeEventListener('dms:session-expired', handleExpired);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    // cognitoSignIn ném AuthError với message đã được sanitize
    await cognitoSignIn(email, password);
    await loadCurrentUser();
  }, [loadCurrentUser]);

  const logout = useCallback(() => {
    cognitoSignOut();
    dispatch({ type: 'LOGOUT' });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Phải dùng trong AuthProvider. Ném lỗi nếu dùng ngoài context. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth phải được gọi trong <AuthProvider>.');
  }
  return ctx;
}
