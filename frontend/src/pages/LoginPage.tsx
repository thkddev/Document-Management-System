import { type FormEvent, useId, useState } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { AuthError } from '../lib/cognito';

export function LoginPage() {
  const { login, status, errorMessage } = useAuth();

  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFieldError('Vui lòng nhập địa chỉ email.');
      return;
    }
    if (!password) {
      setFieldError('Vui lòng nhập mật khẩu.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(trimmedEmail, password);
      // Thành công → AuthContext cập nhật status → ProtectedRoute tự render app
    } catch (err) {
      if (err instanceof AuthError) {
        setFieldError(err.message);
      } else {
        setFieldError('Đã xảy ra lỗi. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const displayError = fieldError || (status === 'error' ? errorMessage : null);

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Brand */}
        <div className="login-brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>Hồ sơ nội bộ</strong>
            <small>Document Management System</small>
          </div>
        </div>

        <div className="login-divider" />

        <h1 className="login-heading">Đăng nhập</h1>
        <p className="login-sub">Dùng tài khoản email công ty của bạn.</p>

        {/* Error banner */}
        {displayError && (
          <div id={errorId} className="login-error" role="alert" aria-live="assertive">
            <Lock size={14} aria-hidden="true" />
            {displayError}
          </div>
        )}

        <form
          id="login-form"
          className="login-form"
          onSubmit={handleSubmit}
          aria-describedby={displayError ? errorId : undefined}
          noValidate
        >
          <div className="login-field">
            <label htmlFor={emailId}>Email</label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              autoFocus
              disabled={isSubmitting}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ten@congty.vn"
              aria-required="true"
              aria-invalid={!!displayError}
            />
          </div>

          <div className="login-field">
            <label htmlFor={passwordId}>Mật khẩu</label>
            <input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              disabled={isSubmitting}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              aria-required="true"
              aria-invalid={!!displayError}
            />
          </div>

          <button
            id="login-submit"
            type="submit"
            className="login-submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <span className="login-spinner" aria-hidden="true" />
            ) : (
              <LogIn size={16} aria-hidden="true" />
            )}
            {isSubmitting ? 'Đang xác thực…' : 'Đăng nhập'}
          </button>
        </form>

        <p className="login-footer">
          Quên mật khẩu hoặc chưa có tài khoản?{' '}
          <a href="mailto:it@congty.vn">Liên hệ bộ phận IT</a>
        </p>
      </div>
    </div>
  );
}
