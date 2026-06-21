/**
 * ProtectedRoute — chặn render nội dung nhạy cảm khi chưa xác thực.
 *
 * Quy tắc:
 * - Trong khi initializing: hiển thị skeleton toàn màn hình.
 * - unauthenticated / error: render children của fallback (LoginPage).
 * - authenticated: render children.
 * - Không flash nội dung nhạy cảm trong bất kỳ trạng thái nào.
 */

import { type ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback: ReactNode;
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { status } = useAuth();

  if (status === 'initializing') {
    return <AppLoadingScreen />;
  }

  if (status === 'authenticated') {
    return <>{children}</>;
  }

  // unauthenticated | error
  return <>{fallback}</>;
}

// ---------------------------------------------------------------------------
// Loading screen hiển thị khi khôi phục session
// ---------------------------------------------------------------------------

function AppLoadingScreen() {
  return (
    <div className="auth-loading-screen" aria-label="Đang khởi động ứng dụng" aria-busy="true">
      <div className="auth-loading-brand">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="auth-loading-label">Đang khôi phục phiên làm việc…</span>
      </div>
      <div className="auth-loading-bar" role="progressbar" aria-label="Đang tải" />
    </div>
  );
}
