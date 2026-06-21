/**
 * Test cho AuthContext — kiểm tra lifecycle: restore session, login, logout, session expired.
 * Mock Cognito và api-client hoàn toàn để test không cần mạng.
 */

import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import type { CurrentUser } from '../../types/auth';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetCurrentAccessToken = vi.fn();
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();

vi.mock('../../lib/cognito', () => ({
  getCurrentAccessToken: () => mockGetCurrentAccessToken(),
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: () => mockSignOut(),
  hasValidSession: vi.fn(),
  AuthError: class AuthError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
      this.name = 'AuthError';
    }
  },
}));

const mockApiFetch = vi.fn();
vi.mock('../../lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    error: object;
    constructor(status: number, error: { code: string; message: string; requestId: string }) {
      super(error.message);
      this.status = status;
      this.error = error;
      this.name = 'ApiRequestError';
    }
  },
}));

// ---------------------------------------------------------------------------
// Helper component để đọc context state trong test
// ---------------------------------------------------------------------------

function AuthStateDisplay() {
  const { status, currentUser, errorMessage } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="displayName">{currentUser?.displayName ?? ''}</span>
      <span data-testid="error">{errorMessage ?? ''}</span>
    </div>
  );
}

const mockUser: CurrentUser = {
  userId: '064ecda0-f5c9-4fab-98f1-d16491ce6818',
  email: 'user@example.com',
  displayName: 'Trịnh Anh',
  departmentId: 'TECH',
  roles: ['EMPLOYEE'],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chuyển sang unauthenticated khi không có session', async () => {
    mockGetCurrentAccessToken.mockResolvedValueOnce(null);

    render(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
  });

  it('khôi phục session và gọi /me khi có token', async () => {
    mockGetCurrentAccessToken.mockResolvedValueOnce('valid-token');
    mockApiFetch.mockResolvedValueOnce(mockUser);

    render(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
      expect(screen.getByTestId('displayName').textContent).toBe('Trịnh Anh');
    });
  });

  it('chuyển sang unauthenticated khi /me trả lỗi không phải 403', async () => {
    mockGetCurrentAccessToken.mockResolvedValueOnce('stale-token');
    mockApiFetch.mockRejectedValueOnce(new Error('Network error'));

    render(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('login thành công cập nhật state sang authenticated', async () => {
    // Lần đầu restore: không có session
    mockGetCurrentAccessToken.mockResolvedValueOnce(null);
    mockSignIn.mockResolvedValueOnce({ accessToken: 'new-token', email: 'user@example.com' });
    mockApiFetch.mockResolvedValueOnce(mockUser);

    let loginFn!: (email: string, password: string) => Promise<void>;

    function LoginTrigger() {
      const { login } = useAuth();
      loginFn = login;
      return null;
    }

    render(
      <AuthProvider>
        <AuthStateDisplay />
        <LoginTrigger />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });

    await act(async () => {
      await loginFn('user@example.com', 'Pass1234!');
    });

    expect(screen.getByTestId('status').textContent).toBe('authenticated');
    expect(screen.getByTestId('displayName').textContent).toBe('Trịnh Anh');
  });

  it('logout xóa session và chuyển về unauthenticated', async () => {
    mockGetCurrentAccessToken.mockResolvedValueOnce('valid-token');
    mockApiFetch.mockResolvedValueOnce(mockUser);

    let logoutFn!: () => void;

    function LogoutTrigger() {
      const { logout } = useAuth();
      logoutFn = logout;
      return null;
    }

    render(
      <AuthProvider>
        <AuthStateDisplay />
        <LogoutTrigger />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });

    act(() => { logoutFn(); });

    expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    expect(mockSignOut).toHaveBeenCalled();
  });
});
