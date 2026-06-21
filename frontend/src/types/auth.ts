// Các type dùng chung cho authentication layer.
// Nguồn sự thật: contracts/openapi.yaml #/components/schemas/CurrentUser

export type UserRole = 'EMPLOYEE' | 'DEPARTMENT_ADMIN' | 'SYSTEM_ADMIN';

/** Phản hồi từ GET /me — khớp với OpenAPI CurrentUser schema */
export interface CurrentUser {
  userId: string;
  email: string;
  displayName: string;
  departmentId: string;
  roles: UserRole[];
}

/** Trạng thái phiên làm việc trong AuthContext */
export type AuthStatus =
  | 'initializing' // Đang khôi phục session từ storage
  | 'authenticated' // Có session hợp lệ + currentUser đã load
  | 'unauthenticated' // Không có session hoặc đã logout
  | 'error'; // Lỗi không khôi phục được

export interface AuthState {
  status: AuthStatus;
  currentUser: CurrentUser | null;
  /** Lỗi hiển thị cho người dùng — không chứa token hay thông tin nhạy cảm */
  errorMessage: string | null;
}
