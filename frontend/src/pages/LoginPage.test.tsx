/**
 * Test cho LoginPage component.
 * Dùng vi.mock để tách khỏi Cognito thật — không cần credentials.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LoginPage } from './LoginPage';
import { AuthError } from '../lib/cognito';
import type { AuthState } from '../types/auth';

// Mock toàn bộ AuthContext để kiểm soát state trong test
const mockLogin = vi.fn();
let mockAuthState: AuthState & { login: typeof mockLogin; logout: () => void } = {
  status: 'unauthenticated',
  currentUser: null,
  errorMessage: null,
  login: mockLogin,
  logout: vi.fn(),
};

vi.mock('../features/auth/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = {
      status: 'unauthenticated',
      currentUser: null,
      errorMessage: null,
      login: mockLogin,
      logout: vi.fn(),
    };
  });

  it('render form với email và password', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Mật khẩu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /đăng nhập/i })).toBeInTheDocument();
  });

  it('hiển thị lỗi khi submit email trống', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /đăng nhập/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('hiển thị lỗi khi submit không có password', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user@test.vn' },
    });
    fireEvent.click(screen.getByRole('button', { name: /đăng nhập/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('gọi login khi form hợp lệ', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user@test.vn' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), {
      target: { value: 'SecureP@ss1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /đăng nhập/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@test.vn', 'SecureP@ss1');
    });
  });

  it('hiển thị thông báo lỗi khi login thất bại', async () => {
    mockLogin.mockRejectedValueOnce(
      new AuthError('Email hoặc mật khẩu không đúng.', 'NotAuthorizedException'),
    );
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user@test.vn' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), {
      target: { value: 'WrongPass1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /đăng nhập/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng.');
    });
  });

  it('hiển thị error từ AuthContext khi status=error', () => {
    mockAuthState = {
      ...mockAuthState,
      status: 'error',
      errorMessage: 'Tài khoản chưa được cấu hình đầy đủ.',
    };
    render(<LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Tài khoản chưa được cấu hình đầy đủ.');
  });
});
