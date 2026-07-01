import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from './App';

const mocks = vi.hoisted(() => ({
  createAdminUser: vi.fn(),
  listAdminAuditEvents: vi.fn(),
  listAdminUsers: vi.fn(),
  runAdminUserAction: vi.fn(),
  updateAdminUser: vi.fn(),
  listDocuments: vi.fn(),
  listPendingShareRequests: vi.fn(),
  approveShareRequest: vi.fn(),
  rejectShareRequest: vi.fn(),
  createDepartmentShare: vi.fn(),
  createDownloadIntent: vi.fn(),
  triggerBrowserDownload: vi.fn(),
  currentUser: {
    userId: 'user-1',
    email: 'user@example.com',
    displayName: 'Trịnh Anh',
    departmentId: 'TECH',
    roles: ['EMPLOYEE'],
  },
}));

vi.mock('./features/auth/AuthContext', () => ({
  useAuth: () => ({
    status: 'authenticated',
    currentUser: mocks.currentUser,
    errorMessage: null,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('./lib/uploads', () => ({
  calculateSha256: vi.fn(),
  createUploadIntent: vi.fn(),
  uploadFileToSignedUrl: vi.fn(),
}));

vi.mock('./lib/admin-users', () => ({
  createAdminUser: mocks.createAdminUser,
  listAdminAuditEvents: mocks.listAdminAuditEvents,
  listAdminUsers: mocks.listAdminUsers,
  runAdminUserAction: mocks.runAdminUserAction,
  updateAdminUser: mocks.updateAdminUser,
}));

vi.mock('./lib/documents', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listDocuments: mocks.listDocuments,
  listPendingShareRequests: mocks.listPendingShareRequests,
  approveShareRequest: mocks.approveShareRequest,
  rejectShareRequest: mocks.rejectShareRequest,
  createDepartmentShare: mocks.createDepartmentShare,
  createDownloadIntent: mocks.createDownloadIntent,
  triggerBrowserDownload: mocks.triggerBrowserDownload,
}));

const readyDocument = {
  documentId: 'document-1',
  title: 'Báo cáo tuần kỹ thuật',
  originalFileName: 'bao-cao.pdf',
  contentType: 'application/pdf',
  classification: 'INTERNAL',
  departmentId: 'TECH',
  ownerId: 'user-1',
  ownerEmail: 'user@example.com',
  accessScope: 'DEPARTMENT',
  sizeBytes: 1453085,
  currentVersion: 1,
  status: 'READY',
  updatedAt: '2026-06-20T06:30:28.640Z',
};

const scanningDocument = {
  ...readyDocument,
  documentId: 'document-2',
  title: 'Quy trình toàn công ty',
  originalFileName: 'quy-trinh.pdf',
  classification: 'PUBLIC',
  departmentId: 'HR',
  ownerId: 'user-2',
  ownerEmail: 'hr@example.com',
  accessScope: 'ALL_EMPLOYEES',
  status: 'SCANNING',
};

const rejectedDocument = {
  ...readyDocument,
  documentId: 'document-3',
  title: 'Tài liệu định dạng lỗi',
  originalFileName: 'loi.pdf',
  classification: 'RESTRICTED',
  departmentId: 'SA',
  ownerId: 'user-3',
  ownerEmail: 'sales@example.com',
  accessScope: 'DEPARTMENT',
  status: 'REJECTED',
  statusReason: 'Không thể nhận diện định dạng thực của file.',
};

function makeDocument(index: number, overrides: Record<string, unknown> = {}) {
  return {
    ...readyDocument,
    documentId: `document-${index}`,
    title: `Tài liệu ${String(index).padStart(2, '0')}`,
    originalFileName: `tai-lieu-${index}.pdf`,
    ownerEmail: `user-${index}@example.com`,
    updatedAt: `2026-06-${String(Math.min(index, 28)).padStart(2, '0')}T06:00:00.000Z`,
    ...overrides,
  };
}

const pendingShareRequests = [
  {
    shareRequestId: 'share-request-1',
    documentId: 'document-1',
    title: 'Bảng lương kỹ thuật',
    classification: 'CONFIDENTIAL',
    sourceDepartmentId: 'TECH',
    targetDepartmentId: 'HR',
    requestedByEmail: 'owner@example.com',
    createdAt: '2026-06-24T02:08:53.000Z',
  },
  {
    shareRequestId: 'share-request-2',
    documentId: 'document-2',
    title: 'Mã nguồn dự án',
    classification: 'RESTRICTED',
    sourceDepartmentId: 'TECH',
    targetDepartmentId: 'SA',
    requestedByEmail: 'dev@example.com',
    createdAt: '2026-06-24T03:10:00.000Z',
  },
];

const adminUsers = [
  {
    id: 'user-admin-duy',
    name: 'Duy Admin',
    email: 'thkd811@gmail.com',
    departmentId: 'TECH',
    roles: ['SYSTEM_ADMIN', 'EMPLOYEE'],
    status: 'CONFIRMED',
    enabled: true,
    createdAt: '2026-06-29T08:30:00.000Z',
    updatedAt: '2026-06-29T08:30:00.000Z',
  },
  {
    id: 'user-han-hr',
    name: 'Han HR',
    email: 'hanlap0908@gmail.com',
    departmentId: 'HR',
    roles: ['EMPLOYEE'],
    status: 'CONFIRMED',
    enabled: true,
    createdAt: '2026-06-29T08:35:00.000Z',
    updatedAt: '2026-06-29T08:35:00.000Z',
  },
  {
    id: 'user-hr-admin',
    name: 'Nguyễn An',
    email: 'admin.hr@example.com',
    departmentId: 'HR',
    roles: ['DEPARTMENT_ADMIN', 'EMPLOYEE'],
    status: 'CONFIRMED',
    enabled: true,
    createdAt: '2026-06-28T15:10:00.000Z',
    updatedAt: '2026-06-28T15:10:00.000Z',
  },
  {
    id: 'user-sa-staff',
    name: 'Lê Hà',
    email: 'sale@example.com',
    departmentId: 'SA',
    roles: ['EMPLOYEE'],
    status: 'CONFIRMED',
    enabled: false,
    createdAt: '2026-06-27T10:45:00.000Z',
    updatedAt: '2026-06-27T10:45:00.000Z',
  },
];

describe('App', () => {
  function LocationProbe() {
    const location = useLocation();
    return <span data-testid="location">{`${location.pathname}${location.hash}`}</span>;
  }

  beforeEach(() => {
    mocks.currentUser = {
      userId: 'user-1',
      email: 'user@example.com',
      displayName: 'Trịnh Anh',
      departmentId: 'TECH',
      roles: ['EMPLOYEE'],
    };
    mocks.listAdminUsers.mockReset();
    mocks.listAdminAuditEvents.mockReset();
    mocks.runAdminUserAction.mockReset();
    mocks.createAdminUser.mockReset();
    mocks.updateAdminUser.mockReset();
    mocks.listDocuments.mockReset();
    mocks.listPendingShareRequests.mockReset();
    mocks.approveShareRequest.mockReset();
    mocks.rejectShareRequest.mockReset();
    mocks.createDepartmentShare.mockReset();
    mocks.createDownloadIntent.mockReset();
    mocks.triggerBrowserDownload.mockReset();
    mocks.listAdminUsers.mockResolvedValue(adminUsers);
    mocks.listAdminAuditEvents.mockResolvedValue([
      {
        eventId: 'event-1',
        action: 'ADMIN_USER_CREATED',
        actorId: 'admin-1',
        actorEmail: 'admin@example.com',
        targetEmail: 'test123@gmail.com',
        targetDepartmentId: 'TECH',
        targetRoles: ['EMPLOYEE'],
        outcome: 'SUCCESS',
        occurredAt: '2026-07-01T05:00:00.000Z',
      },
    ]);
    mocks.createAdminUser.mockResolvedValue({
      id: 'user-new',
      name: 'Test Employee',
      email: 'test123@gmail.com',
      departmentId: 'TECH',
      roles: ['EMPLOYEE'],
      status: 'CONFIRMED',
      enabled: true,
      createdAt: '2026-06-30T04:36:48.000Z',
      updatedAt: '2026-06-30T04:36:48.000Z',
    });
    mocks.updateAdminUser.mockResolvedValue({
      id: 'user-2',
      name: 'Han HR',
      email: 'hanlap0908@gmail.com',
      departmentId: 'TECH',
      roles: ['DEPARTMENT_ADMIN'],
      status: 'CONFIRMED',
      enabled: true,
      createdAt: '2026-06-30T04:36:48.000Z',
      updatedAt: '2026-06-30T05:36:48.000Z',
    });
    mocks.runAdminUserAction.mockResolvedValue({
      id: 'user-2',
      name: 'Han HR',
      email: 'hanlap0908@gmail.com',
      departmentId: 'HR',
      roles: ['EMPLOYEE'],
      status: 'DISABLED',
      enabled: false,
      createdAt: '2026-06-30T04:36:48.000Z',
      updatedAt: '2026-06-30T05:36:48.000Z',
    });
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    mocks.listPendingShareRequests.mockResolvedValue([]);
    mocks.approveShareRequest.mockResolvedValue({ shareRequestId: 'share-request-1', status: 'APPROVED' });
    mocks.rejectShareRequest.mockResolvedValue({ shareRequestId: 'share-request-1', status: 'REJECTED' });
    mocks.createDepartmentShare.mockResolvedValue({
      mode: 'GRANTED',
      documentId: 'document-1',
      targetDepartmentId: 'HR',
    });
    mocks.createDownloadIntent.mockResolvedValue({
      downloadUrl: 'https://signed.example/download',
      expiresAt: '2026-06-20T06:35:00.000Z',
      fileName: 'bao-cao.pdf',
    });
    window.localStorage.clear();
  });

  function renderApp() {
    return render(
      <MemoryRouter>
        <LocationProbe />
        <App />
      </MemoryRouter>,
    );
  }

  it('hiển thị dashboard với tài liệu từ API', async () => {
    renderApp();

    expect(screen.getByRole('heading', { name: 'Tài liệu cần bạn chú ý' })).toBeInTheDocument();
    expect(await screen.findByText('Báo cáo tuần kỹ thuật')).toBeInTheDocument();
    expect(screen.getAllByText('Sẵn sàng').length).toBeGreaterThan(0);
    expect(screen.getByText(/Cập nhật lần cuối/)).toBeInTheDocument();
  });

  it('ẩn mục quản trị với nhân viên thường', async () => {
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    expect(screen.queryByRole('button', { name: 'Quản trị' })).not.toBeInTheDocument();
  });

  it('hiển thị trang quản trị hệ thống cho System Admin', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['SYSTEM_ADMIN'],
      displayName: 'Duy Admin',
    };
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Quản trị' }));

    expect(screen.getByRole('heading', { name: 'Quản trị hệ thống' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Người dùng nội bộ' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.listAdminUsers).toHaveBeenCalled());
    expect(await screen.findByText('thkd811@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('hanlap0908@gmail.com')).toBeInTheDocument();
    expect(mocks.listAdminUsers).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Tải tài liệu lên' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo người dùng' })).toBeEnabled();
    expect(screen.getByText(/được đọc trực tiếp từ AWS Cognito/)).toBeInTheDocument();
    expect(screen.getByText(/khóa\/mở khóa/)).toBeInTheDocument();
    expect(screen.getByText(/Phiên cũ sẽ bị thu hồi/)).toBeInTheDocument();
    expect(screen.getByText('Tổng người dùng').nextElementSibling).toHaveTextContent('4');
    expect(screen.getAllByText('Đang hoạt động')[0]?.nextElementSibling).toHaveTextContent('3');
    expect(screen.getAllByText('Đã khóa')[0]?.nextElementSibling).toHaveTextContent('1');
  });

  it('tạo người dùng Cognito từ trang quản trị', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['SYSTEM_ADMIN'],
      displayName: 'Duy Admin',
    };
    mocks.listAdminUsers
      .mockResolvedValueOnce(adminUsers)
      .mockResolvedValueOnce([
        ...adminUsers,
        {
          id: 'user-new',
          name: 'Test Employee',
          email: 'test123@gmail.com',
          departmentId: 'TECH',
          roles: ['EMPLOYEE'],
          status: 'CONFIRMED',
          enabled: true,
          createdAt: '2026-06-30T04:36:48.000Z',
          updatedAt: '2026-06-30T04:36:48.000Z',
        },
      ]);
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Quản trị' }));
    await waitFor(() => expect(mocks.listAdminUsers).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Tạo người dùng' }));
    const dialog = screen.getByRole('form', { name: 'Tạo người dùng' });

    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: 'test123@gmail.com' },
    });
    fireEvent.change(within(dialog).getByLabelText('Tên hiển thị'), {
      target: { value: 'Test Employee' },
    });
    fireEvent.change(within(dialog).getByLabelText('Phòng ban'), {
      target: { value: 'TECH' },
    });
    fireEvent.change(within(dialog).getByLabelText('Vai trò'), {
      target: { value: 'EMPLOYEE' },
    });
    fireEvent.change(within(dialog).getByLabelText('Mật khẩu'), {
      target: { value: 'Duy8112004.@A' },
    });
    fireEvent.submit(dialog);

    await waitFor(() =>
      expect(mocks.createAdminUser).toHaveBeenCalledWith({
        email: 'test123@gmail.com',
        name: 'Test Employee',
        departmentId: 'TECH',
        role: 'EMPLOYEE',
        password: 'Duy8112004.@A',
      }),
    );
    await screen.findByText('Đã tạo người dùng test123@gmail.com.');
    expect(mocks.listAdminUsers).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('form', { name: 'Tạo người dùng' })).not.toBeInTheDocument();
  });

  it('đổi phòng ban và vai trò người dùng từ trang quản trị', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['SYSTEM_ADMIN'],
      displayName: 'Duy Admin',
    };
    mocks.listAdminUsers
      .mockResolvedValueOnce(adminUsers)
      .mockResolvedValueOnce([
        adminUsers[0],
        {
          ...adminUsers[1],
          departmentId: 'TECH',
          roles: ['DEPARTMENT_ADMIN'],
          updatedAt: '2026-06-30T05:36:48.000Z',
        },
        adminUsers[2],
        adminUsers[3],
      ]);
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Quản trị' }));
    await waitFor(() => expect(mocks.listAdminUsers).toHaveBeenCalledTimes(1));
    await screen.findByText('hanlap0908@gmail.com');

    const editButtons = screen.getAllByRole('button', { name: 'Đổi vai trò' });
    expect(editButtons).toHaveLength(4);
    fireEvent.click(editButtons[1]!);
    const dialog = screen.getByRole('form', { name: 'Đổi vai trò' });
    expect(within(dialog).getByText(/sau khi phiên cũ bị thu hồi/)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Phòng ban'), {
      target: { value: 'TECH' },
    });
    fireEvent.change(within(dialog).getByLabelText('Vai trò'), {
      target: { value: 'DEPARTMENT_ADMIN' },
    });
    fireEvent.submit(dialog);

    await waitFor(() =>
      expect(mocks.updateAdminUser).toHaveBeenCalledWith({
        email: 'hanlap0908@gmail.com',
        departmentId: 'TECH',
        role: 'DEPARTMENT_ADMIN',
      }),
    );
    await screen.findByText(
      'Đã cập nhật người dùng hanlap0908@gmail.com. Phiên cũ đã bị thu hồi, người dùng cần đăng nhập lại để nhận quyền mới.',
    );
    expect(mocks.listAdminUsers).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('form', { name: 'Đổi vai trò' })).not.toBeInTheDocument();
  });

  it('khóa tài khoản người dùng từ trang quản trị', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      email: 'thkd811@gmail.com',
      roles: ['SYSTEM_ADMIN'],
      displayName: 'Duy Admin',
    };
    mocks.listAdminUsers
      .mockResolvedValueOnce(adminUsers)
      .mockResolvedValueOnce([
        adminUsers[0],
        { ...adminUsers[1], enabled: false, status: 'DISABLED' },
        adminUsers[2],
        adminUsers[3],
      ]);
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Quản trị' }));
    await waitFor(() => expect(mocks.listAdminUsers).toHaveBeenCalledTimes(1));
    await screen.findByText('hanlap0908@gmail.com');

    const lockButtons = screen.getAllByRole('button', { name: 'Khóa tài khoản' });
    fireEvent.click(lockButtons[1]!);

    await waitFor(() =>
      expect(mocks.runAdminUserAction).toHaveBeenCalledWith({
        email: 'hanlap0908@gmail.com',
        action: 'DISABLE',
      }),
    );
    await screen.findByText(
      'Đã khóa tài khoản hanlap0908@gmail.com và thu hồi phiên đăng nhập hiện có.',
    );
    expect(mocks.listAdminUsers).toHaveBeenCalledTimes(2);
  });

  it('mở khóa tài khoản người dùng từ trang quản trị', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      email: 'thkd811@gmail.com',
      roles: ['SYSTEM_ADMIN'],
      displayName: 'Duy Admin',
    };
    mocks.runAdminUserAction.mockResolvedValueOnce({
      ...adminUsers[3],
      enabled: true,
      status: 'ENABLED',
    });
    mocks.listAdminUsers
      .mockResolvedValueOnce(adminUsers)
      .mockResolvedValueOnce([
        adminUsers[0],
        adminUsers[1],
        adminUsers[2],
        { ...adminUsers[3], enabled: true, status: 'ENABLED' },
      ]);
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Quản trị' }));
    await waitFor(() => expect(mocks.listAdminUsers).toHaveBeenCalledTimes(1));
    await screen.findByText('sale@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Mở khóa' }));

    await waitFor(() =>
      expect(mocks.runAdminUserAction).toHaveBeenCalledWith({
        email: 'sale@example.com',
        action: 'ENABLE',
      }),
    );
    await screen.findByText('Đã mở khóa tài khoản sale@example.com.');
    expect(mocks.listAdminUsers).toHaveBeenCalledTimes(2);
  });

  it('reset mật khẩu người dùng từ trang quản trị', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['SYSTEM_ADMIN'],
      displayName: 'Duy Admin',
    };
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Quản trị' }));
    await waitFor(() => expect(mocks.listAdminUsers).toHaveBeenCalledTimes(1));
    await screen.findByText('hanlap0908@gmail.com');

    const resetButtons = screen.getAllByRole('button', { name: 'Reset mật khẩu' });
    fireEvent.click(resetButtons[1]!);
    const dialog = screen.getByRole('form', { name: 'Reset mật khẩu' });
    fireEvent.change(within(dialog).getByLabelText('Mật khẩu mới'), {
      target: { value: 'Duy8112004.@A' },
    });
    fireEvent.submit(dialog);

    await waitFor(() =>
      expect(mocks.runAdminUserAction).toHaveBeenCalledWith({
        email: 'hanlap0908@gmail.com',
        action: 'RESET_PASSWORD',
        password: 'Duy8112004.@A',
      }),
    );
    await screen.findByText(
      'Đã reset mật khẩu cho hanlap0908@gmail.com và thu hồi phiên đăng nhập hiện có.',
    );
    expect(screen.queryByRole('form', { name: 'Reset mật khẩu' })).not.toBeInTheDocument();
  });

  it('lọc người dùng quản trị theo từ khóa, phòng ban và vai trò', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['SYSTEM_ADMIN'],
      displayName: 'Duy Admin',
    };
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Quản trị' }));
    await waitFor(() => expect(mocks.listAdminUsers).toHaveBeenCalled());
    await screen.findByText('thkd811@gmail.com');

    fireEvent.change(screen.getByPlaceholderText('Tên hoặc email'), {
      target: { value: 'han' },
    });
    expect(screen.getByText('hanlap0908@gmail.com')).toBeInTheDocument();
    expect(screen.queryByText('thkd811@gmail.com')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Tên hoặc email'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Phòng ban'), {
      target: { value: 'HR' },
    });
    expect(screen.getByText('hanlap0908@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('admin.hr@example.com')).toBeInTheDocument();
    expect(screen.queryByText('sale@example.com')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Vai trò'), {
      target: { value: 'DEPARTMENT_ADMIN' },
    });
    expect(screen.getByText('admin.hr@example.com')).toBeInTheDocument();
    expect(screen.queryByText('hanlap0908@gmail.com')).not.toBeInTheDocument();
  });

  it('lọc người dùng quản trị theo trạng thái tài khoản', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['SYSTEM_ADMIN'],
      displayName: 'Duy Admin',
    };
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Quản trị' }));
    await waitFor(() => expect(mocks.listAdminUsers).toHaveBeenCalled());
    await screen.findByText('sale@example.com');

    fireEvent.change(screen.getByLabelText('Trạng thái'), {
      target: { value: 'LOCKED' },
    });
    expect(screen.getByText('sale@example.com')).toBeInTheDocument();
    expect(screen.queryByText('hanlap0908@gmail.com')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Trạng thái'), {
      target: { value: 'ACTIVE' },
    });
    expect(screen.getByText('hanlap0908@gmail.com')).toBeInTheDocument();
    expect(screen.queryByText('sale@example.com')).not.toBeInTheDocument();
  });

  it('hiển thị lỗi khi không tải được người dùng quản trị từ Cognito', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['SYSTEM_ADMIN'],
      displayName: 'Duy Admin',
    };
    mocks.listAdminUsers.mockRejectedValue(new Error('fail'));
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Quản trị' }));

    expect(
      await screen.findByText('Không thể tải danh sách người dùng từ Cognito. Vui lòng thử lại.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('thkd811@gmail.com')).not.toBeInTheDocument();
  });

  it('làm mới danh sách tài liệu thủ công', async () => {
    mocks.listDocuments
      .mockResolvedValueOnce([readyDocument])
      .mockResolvedValueOnce([
        {
          ...readyDocument,
          documentId: 'document-new',
          title: 'Tài liệu vừa cập nhật',
          updatedAt: '2026-06-29T07:30:00.000Z',
        },
      ]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));

    expect(await screen.findByText('Tài liệu vừa cập nhật')).toBeInTheDocument();
    expect(screen.queryByText('Báo cáo tuần kỹ thuật')).not.toBeInTheDocument();
    expect(mocks.listDocuments).toHaveBeenCalledTimes(2);
  });

  it('hiển thị lỗi khi làm mới danh sách tài liệu thất bại', async () => {
    mocks.listDocuments.mockResolvedValueOnce([readyDocument]).mockRejectedValueOnce(new Error('fail'));
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));

    expect(
      await screen.findByText('Không thể cập nhật danh sách tài liệu. Vui lòng thử lại.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Làm mới' })).toBeEnabled();
  });

  it('tính số liệu dashboard từ tài liệu và yêu cầu chia sẻ thật', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['SYSTEM_ADMIN'],
    };
    mocks.listDocuments.mockResolvedValue([
      makeDocument(1, {
        title: 'Tài liệu kỹ thuật',
        departmentId: 'TECH',
        sizeBytes: 5 * 1024 ** 3,
        status: 'READY',
        updatedAt: '2026-06-26T09:00:00.000Z',
      }),
      makeDocument(2, {
        title: 'Tài liệu nhân sự',
        departmentId: 'HR',
        sizeBytes: 2 * 1024 ** 3,
        status: 'SCANNING',
        updatedAt: '2026-06-26T10:00:00.000Z',
      }),
      makeDocument(3, {
        title: 'Tài liệu kinh doanh',
        departmentId: 'SA',
        sizeBytes: 1024 ** 3,
        status: 'REJECTED',
        updatedAt: '2026-06-26T08:00:00.000Z',
      }),
    ]);
    mocks.listPendingShareRequests.mockResolvedValue(pendingShareRequests);

    renderApp();

    expect(await screen.findByText('Tài liệu nhân sự')).toBeInTheDocument();
    expect(screen.getByText('1 tài liệu đang kiểm tra')).toBeInTheDocument();
    expect(screen.getByText('2 yêu cầu chia sẻ')).toBeInTheDocument();
    expect(screen.getByText('8,0 / 50 GB')).toBeInTheDocument();
    expect(screen.getByText('16% đã sử dụng')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hoạt động gần đây' })).toBeInTheDocument();
    expect(screen.getByText('Tài liệu đang được kiểm tra')).toBeInTheDocument();
  });

  it('điều hướng sidebar sang trang tất cả tài liệu và quay lại tổng quan', async () => {
    renderApp();

    expect(await screen.findByText('Báo cáo tuần kỹ thuật')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tất cả tài liệu' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Tất cả tài liệu' })).toBeInTheDocument();
    expect(screen.queryByText('Tài liệu gần đây')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hoạt động gần đây' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tổng quan' }));

    expect(screen.getByRole('heading', { name: 'Tài liệu cần bạn chú ý' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tài liệu gần đây' })).toBeInTheDocument();
  });

  it('mở trang tất cả tài liệu từ nút xem tất cả của dashboard', async () => {
    renderApp();

    expect(await screen.findByText('Báo cáo tuần kỹ thuật')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Tất cả tài liệu' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hoạt động gần đây' })).not.toBeInTheDocument();
  });

  it('hiển thị riêng tài liệu được chia sẻ với người dùng', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument, rejectedDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: /Được chia sẻ/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Được chia sẻ với tôi' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tài liệu được chia sẻ' })).toBeInTheDocument();
    expect(screen.getByText('Quy trình toàn công ty')).toBeInTheDocument();
    expect(screen.getByText('Tài liệu định dạng lỗi')).toBeInTheDocument();
    expect(screen.queryByText('Báo cáo tuần kỹ thuật')).not.toBeInTheDocument();
  });

  it('hiển thị trạng thái rỗng khi chưa có tài liệu được chia sẻ', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: /Được chia sẻ/ }));

    expect(screen.getByText('Chưa có tài liệu được chia sẻ')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Khi có tài liệu toàn bộ nhân viên hoặc tài liệu phòng ban khác được chia sẻ, chúng sẽ xuất hiện tại đây.',
      ),
    ).toBeInTheDocument();
  });

  it('hiển thị trang gần đây theo thứ tự cập nhật mới nhất', async () => {
    mocks.listDocuments.mockResolvedValue([
      makeDocument(1, { title: 'Tài liệu cũ', updatedAt: '2026-06-01T06:00:00.000Z' }),
      makeDocument(2, { title: 'Tài liệu mới', updatedAt: '2026-06-27T06:00:00.000Z' }),
      makeDocument(3, { title: 'Tài liệu giữa', updatedAt: '2026-06-15T06:00:00.000Z' }),
    ]);
    renderApp();

    await screen.findByText('Tài liệu mới');

    fireEvent.click(screen.getByRole('button', { name: 'Gần đây' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Gần đây' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tài liệu cập nhật gần đây' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hoạt động gần đây' })).not.toBeInTheDocument();

    const newest = screen.getByText('Tài liệu mới');
    const middle = screen.getByText('Tài liệu giữa');
    const oldest = screen.getByText('Tài liệu cũ');
    expect(newest.compareDocumentPosition(middle)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(middle.compareDocumentPosition(oldest)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('hiển thị trạng thái rỗng khi chưa có hoạt động gần đây', async () => {
    mocks.listDocuments.mockResolvedValue([]);
    renderApp();

    await screen.findByText('Chưa có tài liệu');

    fireEvent.click(screen.getByRole('button', { name: 'Gần đây' }));

    expect(screen.getByText('Chưa có hoạt động gần đây')).toBeInTheDocument();
    expect(
      screen.getByText('Khi tài liệu được tải lên, kiểm tra hoặc cập nhật, chúng sẽ xuất hiện tại đây.'),
    ).toBeInTheDocument();
  });

  it('đánh dấu tài liệu và hiển thị trong trang đã đánh dấu', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu Báo cáo tuần kỹ thuật' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đã đánh dấu' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Đã đánh dấu' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tài liệu đã đánh dấu' })).toBeInTheDocument();
    expect(screen.getByText('Báo cáo tuần kỹ thuật')).toBeInTheDocument();
    expect(screen.queryByText('Quy trình toàn công ty')).not.toBeInTheDocument();
  });

  it('bỏ đánh dấu tài liệu khỏi trang đã đánh dấu', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu Báo cáo tuần kỹ thuật' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đã đánh dấu' }));
    expect(screen.getByText('Báo cáo tuần kỹ thuật')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ đánh dấu Báo cáo tuần kỹ thuật' }));

    expect(screen.getByText('Chưa có tài liệu đánh dấu')).toBeInTheDocument();
    expect(screen.queryByText('Báo cáo tuần kỹ thuật')).not.toBeInTheDocument();
  });

  it('khôi phục tài liệu đã đánh dấu từ localStorage', async () => {
    window.localStorage.setItem('dms:bookmarked-documents', JSON.stringify(['document-2']));
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Đã đánh dấu' }));

    expect(screen.getByText('Quy trình toàn công ty')).toBeInTheDocument();
    expect(screen.queryByText('Báo cáo tuần kỹ thuật')).not.toBeInTheDocument();
  });

  it('lọc tài liệu theo phòng ban từ sidebar', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument, rejectedDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: /Nhân sự/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Tài liệu phòng Nhân sự' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Danh sách tài liệu phòng ban' })).toBeInTheDocument();
    expect(screen.getByText('Quy trình toàn công ty')).toBeInTheDocument();
    expect(screen.queryByText('Báo cáo tuần kỹ thuật')).not.toBeInTheDocument();
    expect(screen.queryByText('Tài liệu định dạng lỗi')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Kỹ thuật/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Tài liệu phòng Kỹ thuật' })).toBeInTheDocument();
    expect(screen.getByText('Báo cáo tuần kỹ thuật')).toBeInTheDocument();
    expect(screen.queryByText('Quy trình toàn công ty')).not.toBeInTheDocument();
  });

  it('bỏ lọc phòng ban khi chuyển sang tất cả tài liệu', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument, rejectedDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: /Nhân sự/ }));
    expect(screen.queryByText('Báo cáo tuần kỹ thuật')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tất cả tài liệu' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Tất cả tài liệu' })).toBeInTheDocument();
    expect(screen.getByText('Báo cáo tuần kỹ thuật')).toBeInTheDocument();
    expect(screen.getByText('Quy trình toàn công ty')).toBeInTheDocument();
    expect(screen.getByText('Tài liệu định dạng lỗi')).toBeInTheDocument();
  });

  it('hiển thị trạng thái rỗng theo phòng ban được chọn', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: /Nhân sự/ }));

    expect(screen.getByText('Chưa có tài liệu phòng Nhân sự')).toBeInTheDocument();
    expect(
      screen.getByText('Tài liệu thuộc phòng Nhân sự sẽ xuất hiện tại đây.'),
    ).toBeInTheDocument();
  });

  it('kết hợp lọc phòng ban với trạng thái, phân loại và phạm vi', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument, rejectedDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: /Nhân sự/ }));
    expect(screen.getByText('Đang xem tài liệu phòng Nhân sự')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Trạng thái'), {
      target: { value: 'PROCESSING' },
    });
    fireEvent.change(screen.getByLabelText('Phân loại'), {
      target: { value: 'PUBLIC' },
    });
    fireEvent.change(screen.getByLabelText('Phạm vi'), {
      target: { value: 'ALL_EMPLOYEES' },
    });

    expect(screen.getByText('Quy trình toàn công ty')).toBeInTheDocument();
    expect(screen.queryByText('Báo cáo tuần kỹ thuật')).not.toBeInTheDocument();
    expect(screen.queryByText('Tài liệu định dạng lỗi')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Trạng thái'), {
      target: { value: 'READY' },
    });

    expect(screen.getByText('Không tìm thấy tài liệu phù hợp')).toBeInTheDocument();
    expect(screen.queryByText('Quy trình toàn công ty')).not.toBeInTheDocument();
  });

  it('quay về trang đầu khi đổi phòng ban', async () => {
    const hrDocuments = Array.from({ length: 15 }, (_, index) =>
      makeDocument(101 + index, {
        title: `Tài liệu nhân sự ${String(index + 1).padStart(2, '0')}`,
        departmentId: 'HR',
        ownerEmail: `hr-${index + 1}@example.com`,
      }),
    );
    mocks.listDocuments.mockResolvedValue([
      ...hrDocuments,
      ...Array.from({ length: 10 }, (_, index) =>
        makeDocument(index + 1, {
          title: `Tài liệu kỹ thuật ${String(index + 1).padStart(2, '0')}`,
          departmentId: 'TECH',
        }),
      ),
    ]);
    renderApp();

    await screen.findByText('Tài liệu nhân sự 01');

    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
    expect(screen.getByText('Trang 2 / 3')).toBeInTheDocument();
    expect(screen.getByText('Tài liệu nhân sự 11')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Nhân sự/ }));

    expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Tài liệu nhân sự 01')).toBeInTheDocument();
    expect(screen.queryByText('Tài liệu nhân sự 11')).not.toBeInTheDocument();
  });

  it('chọn một tài liệu sẵn sàng và tải xuống từ thanh hành động', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn Báo cáo tuần kỹ thuật' }));

    expect(screen.getByText('Đã chọn 1 tài liệu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tải xuống' }));

    await waitFor(() => expect(mocks.createDownloadIntent).toHaveBeenCalledWith('document-1'));
    expect(mocks.triggerBrowserDownload).toHaveBeenCalledWith({
      downloadUrl: 'https://signed.example/download',
      expiresAt: '2026-06-20T06:35:00.000Z',
      fileName: 'bao-cao.pdf',
    });
  });

  it('không cho tải xuống khi chọn tài liệu chưa sẵn sàng', async () => {
    mocks.listDocuments.mockResolvedValue([scanningDocument]);
    renderApp();

    await screen.findByText('Quy trình toàn công ty');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn Quy trình toàn công ty' }));

    expect(screen.getByText('Đã chọn 1 tài liệu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải xuống' })).toBeDisabled();
  });

  it('chọn tất cả tài liệu trên trang hiện tại và bỏ chọn', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument, rejectedDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn tất cả tài liệu trên trang' }));

    expect(screen.getByText('Đã chọn 3 tài liệu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải xuống' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chọn' }));

    expect(screen.queryByText('Đã chọn 3 tài liệu')).not.toBeInTheDocument();
  });

  it('tự bỏ chọn tài liệu không còn trong danh sách sau khi lọc', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn Báo cáo tuần kỹ thuật' }));
    expect(screen.getByText('Đã chọn 1 tài liệu')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Trạng thái'), {
      target: { value: 'PROCESSING' },
    });

    await waitFor(() => {
      expect(screen.queryByText('Đã chọn 1 tài liệu')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Quy trình toàn công ty')).toBeInTheDocument();
  });

  it('mở menu thao tác nhanh của tài liệu', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn cho Báo cáo tuần kỹ thuật' }));

    expect(screen.getByRole('menuitem', { name: 'Xem chi tiết' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Tải xuống' })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: 'Đánh dấu' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Lịch sử hoạt động' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Chia sẻ' })).toBeInTheDocument();
  });

  it('mở trang chi tiết khi bấm tên tài liệu', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Báo cáo tuần kỹ thuật' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/documents/document-1');
  });

  it('không điều hướng khi bấm checkbox, tải xuống hoặc menu thao tác nhanh', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn Báo cáo tuần kỹ thuật' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/');

    fireEvent.click(screen.getByRole('button', { name: 'Tải Báo cáo tuần kỹ thuật' }));
    await waitFor(() => expect(mocks.createDownloadIntent).toHaveBeenCalledWith('document-1'));
    expect(screen.getByTestId('location')).toHaveTextContent('/');

    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn cho Báo cáo tuần kỹ thuật' }));
    expect(screen.getByRole('menuitem', { name: 'Chia sẻ' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('hiển thị trạng thái đang tải khi tạo liên kết tải xuống', async () => {
    let resolveDownload!: (value: {
      downloadUrl: string;
      expiresAt: string;
      fileName: string;
    }) => void;
    mocks.createDownloadIntent.mockReturnValue(
      new Promise((resolve) => {
        resolveDownload = resolve;
      }),
    );
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Tải Báo cáo tuần kỹ thuật' }));

    const loadingButton = await screen.findByRole('button', {
      name: 'Đang tải Báo cáo tuần kỹ thuật',
    });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveAttribute('title', 'Đang tạo liên kết tải xuống');

    resolveDownload({
      downloadUrl: 'https://signed.example/download',
      expiresAt: '2026-06-20T06:35:00.000Z',
      fileName: 'bao-cao.pdf',
    });
  });

  it('chỉ mở một menu thao tác nhanh tại một thời điểm', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    const readyOptions = screen.getByRole('button', {
      name: 'Tùy chọn cho Báo cáo tuần kỹ thuật',
    });
    const scanningOptions = screen.getByRole('button', {
      name: 'Tùy chọn cho Quy trình toàn công ty',
    });

    fireEvent.click(readyOptions);
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(readyOptions).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(scanningOptions);

    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(readyOptions).toHaveAttribute('aria-expanded', 'false');
    expect(scanningOptions).toHaveAttribute('aria-expanded', 'true');
  });

  it('đóng menu thao tác nhanh khi bấm ra ngoài', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn cho Báo cáo tuần kỹ thuật' }));
    expect(screen.getByRole('menuitem', { name: 'Chia sẻ' })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menuitem', { name: 'Chia sẻ' })).not.toBeInTheDocument();
  });

  it('đóng menu thao tác nhanh bằng phím Esc', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn cho Báo cáo tuần kỹ thuật' }));
    expect(screen.getByRole('menuitem', { name: 'Chia sẻ' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menuitem', { name: 'Chia sẻ' })).not.toBeInTheDocument();
  });

  it('mở modal chia sẻ phòng ban từ menu thao tác nhanh', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn cho Báo cáo tuần kỹ thuật' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Chia sẻ' }));

    expect(screen.queryByRole('menuitem', { name: 'Chia sẻ' })).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Chia sẻ phòng ban' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Báo cáo tuần kỹ thuật')).toBeInTheDocument();
    expect(screen.getByLabelText('Phòng ban nhận')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Kỹ thuật' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Phòng ban nhận')).toHaveFocus());

    fireEvent.change(screen.getByLabelText('Phòng ban nhận'), {
      target: { value: 'HR' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Chia sẻ' }));

    await waitFor(() =>
      expect(mocks.createDepartmentShare).toHaveBeenCalledWith('document-1', 'HR'),
    );
    expect(screen.getByText('Đã chia sẻ tài liệu cho phòng ban đã chọn.')).toBeInTheDocument();
  });

  it('đóng modal chia sẻ phòng ban bằng phím Esc', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn cho Báo cáo tuần kỹ thuật' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Chia sẻ' }));
    expect(screen.getByRole('dialog', { name: 'Chia sẻ phòng ban' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Chia sẻ phòng ban' })).not.toBeInTheDocument();
  });

  it('đóng modal chia sẻ phòng ban bằng nút hủy', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn cho Báo cáo tuần kỹ thuật' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Chia sẻ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(screen.queryByRole('dialog', { name: 'Chia sẻ phòng ban' })).not.toBeInTheDocument();
  });

  it('hiển thị thông báo chờ duyệt khi chia sẻ tài liệu cần phê duyệt', async () => {
    mocks.listDocuments.mockResolvedValue([{ ...readyDocument, classification: 'CONFIDENTIAL' }]);
    mocks.createDepartmentShare.mockResolvedValue({
      mode: 'PENDING_APPROVAL',
      documentId: 'document-1',
      targetDepartmentId: 'HR',
      shareRequestId: 'share-request-1',
    });
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn cho Báo cáo tuần kỹ thuật' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Chia sẻ' }));
    fireEvent.change(screen.getByLabelText('Phòng ban nhận'), {
      target: { value: 'HR' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Chia sẻ' }));

    expect(
      await screen.findByText('Đã gửi yêu cầu chia sẻ, đang chờ quản trị phòng ban duyệt.'),
    ).toBeInTheDocument();
  });

  it('tải xuống từ menu thao tác nhanh và đóng menu', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn cho Báo cáo tuần kỹ thuật' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tải xuống' }));

    await waitFor(() => expect(mocks.createDownloadIntent).toHaveBeenCalledWith('document-1'));
    expect(screen.queryByRole('menuitem', { name: 'Tải xuống' })).not.toBeInTheDocument();
  });

  it('đánh dấu tài liệu từ menu thao tác nhanh', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn cho Báo cáo tuần kỹ thuật' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Đánh dấu' }));

    expect(screen.queryByRole('menuitem', { name: 'Đánh dấu' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn cho Báo cáo tuần kỹ thuật' }));

    expect(screen.getByRole('menuitem', { name: 'Bỏ đánh dấu' })).toBeInTheDocument();
  });

  it('không cho tải xuống từ menu khi tài liệu chưa sẵn sàng', async () => {
    mocks.listDocuments.mockResolvedValue([scanningDocument]);
    renderApp();

    await screen.findByText('Quy trình toàn công ty');

    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn cho Quy trình toàn công ty' }));

    expect(screen.getByRole('menuitem', { name: 'Tải xuống' })).toBeDisabled();
  });

  it('lọc tài liệu theo từ khóa', async () => {
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.change(screen.getByPlaceholderText('Tìm theo tên, người tạo, phòng ban...'), {
      target: { value: 'không tồn tại' },
    });

    expect(screen.getByText('Không tìm thấy tài liệu phù hợp')).toBeInTheDocument();
    expect(screen.queryByText('Báo cáo tuần kỹ thuật')).not.toBeInTheDocument();

    const clearFilterButtons = screen.getAllByRole('button', { name: 'Xóa lọc' });
    expect(clearFilterButtons.length).toBeGreaterThan(0);
    fireEvent.click(clearFilterButtons[clearFilterButtons.length - 1]!);

    expect(screen.getByText('Báo cáo tuần kỹ thuật')).toBeInTheDocument();
  });

  it('lọc tài liệu theo trạng thái đang xử lý', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument, rejectedDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.change(screen.getByLabelText('Trạng thái'), {
      target: { value: 'PROCESSING' },
    });

    expect(screen.getByText('Quy trình toàn công ty')).toBeInTheDocument();
    expect(screen.queryByText('Báo cáo tuần kỹ thuật')).not.toBeInTheDocument();
    expect(screen.queryByText('Tài liệu định dạng lỗi')).not.toBeInTheDocument();
  });

  it('lọc tài liệu theo phân loại', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument, rejectedDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.change(screen.getByLabelText('Phân loại'), {
      target: { value: 'RESTRICTED' },
    });

    expect(screen.getByText('Tài liệu định dạng lỗi')).toBeInTheDocument();
    expect(screen.queryByText('Báo cáo tuần kỹ thuật')).not.toBeInTheDocument();
    expect(screen.queryByText('Quy trình toàn công ty')).not.toBeInTheDocument();
  });

  it('lọc tài liệu theo phạm vi toàn bộ nhân viên', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument, rejectedDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.change(screen.getByLabelText('Phạm vi'), {
      target: { value: 'ALL_EMPLOYEES' },
    });

    expect(screen.getByText('Quy trình toàn công ty')).toBeInTheDocument();
    expect(screen.getAllByText('Toàn bộ nhân viên').length).toBeGreaterThan(0);
    expect(screen.queryByText('Báo cáo tuần kỹ thuật')).not.toBeInTheDocument();
  });

  it('xóa toàn bộ bộ lọc tài liệu', async () => {
    mocks.listDocuments.mockResolvedValue([readyDocument, scanningDocument]);
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.change(screen.getByLabelText('Trạng thái'), {
      target: { value: 'PROCESSING' },
    });
    expect(screen.queryByText('Báo cáo tuần kỹ thuật')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa lọc' }));

    expect(screen.getByText('Báo cáo tuần kỹ thuật')).toBeInTheDocument();
    expect(screen.getByText('Quy trình toàn công ty')).toBeInTheDocument();
  });

  it('sắp xếp tài liệu theo tên A-Z', async () => {
    mocks.listDocuments.mockResolvedValue([
      makeDocument(1, { title: 'Gamma' }),
      makeDocument(2, { title: 'Alpha' }),
      makeDocument(3, { title: 'Beta' }),
    ]);
    renderApp();

    await screen.findByText('Gamma');
    fireEvent.change(screen.getByLabelText('Sắp xếp'), {
      target: { value: 'TITLE_ASC' },
    });

    const alpha = screen.getByText('Alpha');
    const beta = screen.getByText('Beta');
    const gamma = screen.getByText('Gamma');
    expect(alpha.compareDocumentPosition(beta)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(beta.compareDocumentPosition(gamma)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('sắp xếp tài liệu theo thời gian cũ nhất', async () => {
    mocks.listDocuments.mockResolvedValue([
      makeDocument(1, { title: 'Mới', updatedAt: '2026-06-24T06:00:00.000Z' }),
      makeDocument(2, { title: 'Cũ', updatedAt: '2026-06-01T06:00:00.000Z' }),
    ]);
    renderApp();

    await screen.findByText('Mới');
    fireEvent.change(screen.getByLabelText('Sắp xếp'), {
      target: { value: 'UPDATED_ASC' },
    });

    const oldDocument = screen.getByText('Cũ');
    const newDocument = screen.getByText('Mới');
    expect(oldDocument.compareDocumentPosition(newDocument)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('phân trang tài liệu sang trang sau', async () => {
    mocks.listDocuments.mockResolvedValue(Array.from({ length: 12 }, (_, index) => makeDocument(index + 1)));
    renderApp();

    expect(await screen.findByText('Tài liệu 12')).toBeInTheDocument();
    expect(screen.queryByText('Tài liệu 02')).not.toBeInTheDocument();
    expect(screen.getByText('Đang xem 1-10 trong 12 tài liệu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));

    expect(screen.getByText('Tài liệu 02')).toBeInTheDocument();
    expect(screen.getByText('Tài liệu 01')).toBeInTheDocument();
    expect(screen.queryByText('Tài liệu 12')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
  });

  it('quay về trang 1 khi đổi bộ lọc tài liệu', async () => {
    mocks.listDocuments.mockResolvedValue([
      ...Array.from({ length: 10 }, (_, index) => makeDocument(index + 1)),
      makeDocument(11, {
        title: 'File đang quét',
        status: 'SCANNING',
        updatedAt: '2026-05-01T06:00:00.000Z',
      }),
      makeDocument(12, { updatedAt: '2026-04-01T06:00:00.000Z' }),
    ]);
    renderApp();

    await screen.findByText('Tài liệu 10');
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
    expect(screen.getByText('File đang quét')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Trạng thái'), {
      target: { value: 'PROCESSING' },
    });

    expect(screen.getByText('File đang quét')).toBeInTheDocument();
    expect(screen.getByText('Trang 1 / 1')).toBeInTheDocument();
  });

  it('mở form tạo yêu cầu tải lên', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Tải tài liệu lên' }));

    expect(screen.getByRole('heading', { name: 'Tạo yêu cầu tải lên' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu đề')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Phân loại').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('File')).toBeInTheDocument();
  });

  it('poll lại sau 5 giây khi còn tài liệu đang xử lý', async () => {
    vi.useFakeTimers();
    mocks.listDocuments.mockResolvedValue([{ ...readyDocument, status: 'SCANNING' }]);

    renderApp();

    await vi.waitFor(() => expect(mocks.listDocuments).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(screen.getByText('Đang quét')).toBeInTheDocument());
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(mocks.listDocuments.mock.calls.length).toBeGreaterThanOrEqual(2));
    vi.useRealTimers();
  });

  it('hiển thị lý do khi tài liệu bị từ chối', async () => {
    mocks.listDocuments.mockResolvedValue([
      {
        ...readyDocument,
        status: 'REJECTED',
        statusReason: 'Định dạng thực của file không khớp phần mở rộng và MIME type.',
      },
    ]);

    renderApp();

    expect(await screen.findByText('Bị từ chối')).toBeInTheDocument();
    expect(
      screen.getByText('Định dạng thực của file không khớp phần mở rộng và MIME type.'),
    ).toBeInTheDocument();
  });

  it('tạo download intent từ nút tải nhanh', async () => {
    renderApp();
    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Tải Báo cáo tuần kỹ thuật' }));

    await vi.waitFor(() => expect(mocks.createDownloadIntent).toHaveBeenCalledWith('document-1'));
    expect(mocks.triggerBrowserDownload).toHaveBeenCalled();
  });

  it('không hiển thị hàng đợi duyệt chia sẻ cho nhân viên thường', async () => {
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    expect(screen.queryByRole('heading', { name: 'Yêu cầu chia sẻ chờ duyệt' })).not.toBeInTheDocument();
    expect(mocks.listPendingShareRequests).not.toHaveBeenCalled();
  });

  it('hiển thị hàng đợi duyệt chia sẻ cho Department Admin', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['DEPARTMENT_ADMIN'],
    };
    mocks.listPendingShareRequests.mockResolvedValue(pendingShareRequests);

    renderApp();

    expect(await screen.findByRole('heading', { name: 'Yêu cầu chia sẻ chờ duyệt' })).toBeInTheDocument();
    expect(screen.getByText('2 yêu cầu đang chờ')).toBeInTheDocument();
    expect(screen.getByText('Bảng lương kỹ thuật')).toBeInTheDocument();
    expect(screen.getByText('Mã nguồn dự án')).toBeInTheDocument();
    expect(screen.getByText(/owner@example.com/)).toBeInTheDocument();
  });

  it('lọc yêu cầu chia sẻ theo nhãn dữ liệu', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['DEPARTMENT_ADMIN'],
    };
    mocks.listPendingShareRequests.mockResolvedValue(pendingShareRequests);

    renderApp();
    await screen.findByText('Bảng lương kỹ thuật');

    fireEvent.click(screen.getByRole('button', { name: 'Hạn chế' }));

    expect(screen.queryByText('Bảng lương kỹ thuật')).not.toBeInTheDocument();
    expect(screen.getByText('Mã nguồn dự án')).toBeInTheDocument();
  });

  it('duyệt yêu cầu chia sẻ và refresh dữ liệu', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['DEPARTMENT_ADMIN'],
    };
    mocks.listPendingShareRequests.mockResolvedValue(pendingShareRequests);

    renderApp();
    await screen.findByText('Bảng lương kỹ thuật');

    fireEvent.click(screen.getAllByRole('button', { name: 'Duyệt' })[0]!);

    await vi.waitFor(() => expect(mocks.approveShareRequest).toHaveBeenCalledWith('share-request-1'));
    expect(await screen.findByText('Đã duyệt yêu cầu chia sẻ.')).toBeInTheDocument();
    expect(mocks.listDocuments.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('từ chối yêu cầu chia sẻ bằng form lý do', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['DEPARTMENT_ADMIN'],
    };
    mocks.listPendingShareRequests.mockResolvedValue(pendingShareRequests);

    renderApp();
    await screen.findByText('Bảng lương kỹ thuật');

    fireEvent.click(screen.getAllByRole('button', { name: 'Từ chối' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }));

    expect(screen.getByText('Vui lòng nhập lý do từ chối từ 3 ký tự trở lên.')).toBeInTheDocument();
    expect(mocks.rejectShareRequest).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Nhập lý do để người yêu cầu biết cần điều chỉnh gì.'), {
      target: { value: 'Tài liệu chứa dữ liệu nhạy cảm chưa đủ căn cứ chia sẻ.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }));

    await vi.waitFor(() =>
      expect(mocks.rejectShareRequest).toHaveBeenCalledWith(
        'share-request-1',
        'Tài liệu chứa dữ liệu nhạy cảm chưa đủ căn cứ chia sẻ.',
      ),
    );
    expect(await screen.findByText('Đã từ chối yêu cầu chia sẻ.')).toBeInTheDocument();
  });

  it('mở panel thông báo từ biểu tượng chuông', async () => {
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');
    fireEvent.click(screen.getByRole('button', { name: 'Thông báo (1)' }));

    const dialog = screen.getByRole('dialog', { name: 'Thông báo' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Tài liệu đã sẵn sàng')).toBeInTheDocument();
  });

  it('hiển thị thông báo yêu cầu chia sẻ cho Department Admin', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['DEPARTMENT_ADMIN'],
    };
    mocks.listPendingShareRequests.mockResolvedValue(pendingShareRequests);

    renderApp();

    await screen.findByText('Bảng lương kỹ thuật');
    fireEvent.click(await screen.findByRole('button', { name: 'Thông báo (3)' }));

    expect(screen.getByRole('dialog', { name: 'Thông báo' })).toBeInTheDocument();
    expect(screen.getAllByText('Yêu cầu chia sẻ chờ duyệt').length).toBeGreaterThan(0);
    expect(screen.getByText(/từ TECH đến HR/)).toBeInTheDocument();
  });

  it('đánh dấu thông báo đã xem khi bấm vào', async () => {
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');
    fireEvent.click(screen.getByRole('button', { name: 'Thông báo (1)' }));

    const notification = screen.getByRole('button', { name: /Tài liệu đã sẵn sàng/ });
    fireEvent.click(notification);

    expect(window.localStorage.getItem('dms:seen-notifications')).toContain(
      'document-document-1-READY',
    );
    expect(screen.queryByRole('button', { name: 'Thông báo (1)' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Thông báo' }));
    expect(screen.getByRole('button', { name: /Tài liệu đã sẵn sàng/ })).toHaveClass('is-seen');
  });

  it('không xóa thông báo đã xem trong lúc danh sách tài liệu đang tải', async () => {
    window.localStorage.setItem('dms:seen-notifications', JSON.stringify(['document-document-1-READY']));
    let resolveDocuments: (items: typeof readyDocument[]) => void = () => undefined;
    mocks.listDocuments.mockReturnValue(
      new Promise((resolve) => {
        resolveDocuments = resolve;
      }),
    );

    renderApp();

    expect(window.localStorage.getItem('dms:seen-notifications')).toContain(
      'document-document-1-READY',
    );

    resolveDocuments([readyDocument]);
    await screen.findByText('Báo cáo tuần kỹ thuật');

    expect(screen.getByRole('button', { name: 'Thông báo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thông báo (1)' })).not.toBeInTheDocument();
  });

  it('hiển thị trang lịch sử quản trị riêng cho System Admin', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      roles: ['SYSTEM_ADMIN'],
      displayName: 'Duy Admin',
    };
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Lịch sử quản trị' }));

    expect(screen.getByRole('heading', { name: 'Lịch sử quản trị' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lịch sử thao tác tài khoản' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.listAdminAuditEvents).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Tạo người dùng')).toBeInTheDocument();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('test123@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('Thành công')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tải tài liệu lên' })).not.toBeInTheDocument();
    expect(screen.queryByText('Kho tài liệu')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tất cả tài liệu' })).not.toBeInTheDocument();

    const auditPanel = screen.getByRole('table', { name: 'Lịch sử quản trị' }).closest('section');
    if (!auditPanel) throw new Error('Admin audit panel was not rendered');
    fireEvent.click(within(auditPanel).getByRole('button', { name: 'Làm mới' }));
    await waitFor(() => expect(mocks.listAdminAuditEvents).toHaveBeenCalledTimes(2));
  });
});
