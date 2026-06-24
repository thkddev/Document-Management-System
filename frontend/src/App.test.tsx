import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  listPendingShareRequests: vi.fn(),
  approveShareRequest: vi.fn(),
  rejectShareRequest: vi.fn(),
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

vi.mock('./lib/documents', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listDocuments: mocks.listDocuments,
  listPendingShareRequests: mocks.listPendingShareRequests,
  approveShareRequest: mocks.approveShareRequest,
  rejectShareRequest: mocks.rejectShareRequest,
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

describe('App', () => {
  beforeEach(() => {
    mocks.currentUser = {
      userId: 'user-1',
      email: 'user@example.com',
      displayName: 'Trịnh Anh',
      departmentId: 'TECH',
      roles: ['EMPLOYEE'],
    };
    mocks.listDocuments.mockReset();
    mocks.listPendingShareRequests.mockReset();
    mocks.approveShareRequest.mockReset();
    mocks.rejectShareRequest.mockReset();
    mocks.createDownloadIntent.mockReset();
    mocks.triggerBrowserDownload.mockReset();
    mocks.listDocuments.mockResolvedValue([readyDocument]);
    mocks.listPendingShareRequests.mockResolvedValue([]);
    mocks.approveShareRequest.mockResolvedValue({ shareRequestId: 'share-request-1', status: 'APPROVED' });
    mocks.rejectShareRequest.mockResolvedValue({ shareRequestId: 'share-request-1', status: 'REJECTED' });
    mocks.createDownloadIntent.mockResolvedValue({
      downloadUrl: 'https://signed.example/download',
      expiresAt: '2026-06-20T06:35:00.000Z',
      fileName: 'bao-cao.pdf',
    });
  });

  function renderApp() {
    return render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
  }

  it('hiển thị dashboard với tài liệu từ API', async () => {
    renderApp();

    expect(screen.getByRole('heading', { name: 'Tài liệu cần bạn chú ý' })).toBeInTheDocument();
    expect(await screen.findByText('Báo cáo tuần kỹ thuật')).toBeInTheDocument();
    expect(screen.getByText('Sẵn sàng')).toBeInTheDocument();
  });

  it('lọc tài liệu theo từ khóa', async () => {
    renderApp();

    await screen.findByText('Báo cáo tuần kỹ thuật');

    fireEvent.change(screen.getByPlaceholderText('Tìm theo tên, người tạo, phòng ban...'), {
      target: { value: 'không tồn tại' },
    });

    expect(screen.getByText('Không tìm thấy tài liệu')).toBeInTheDocument();
    expect(screen.queryByText('Báo cáo tuần kỹ thuật')).not.toBeInTheDocument();
  });

  it('mở form tạo yêu cầu tải lên', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Tải tài liệu lên' }));

    expect(screen.getByRole('heading', { name: 'Tạo yêu cầu tải lên' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu đề')).toBeInTheDocument();
    expect(screen.getByLabelText('Phân loại')).toBeInTheDocument();
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
});
