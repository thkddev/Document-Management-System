import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  createDownloadIntent: vi.fn(),
  triggerBrowserDownload: vi.fn(),
}));

vi.mock('./features/auth/AuthContext', () => ({
  useAuth: () => ({
    status: 'authenticated',
    currentUser: {
      userId: 'user-1',
      email: 'user@example.com',
      displayName: 'Trịnh Anh',
      departmentId: 'TECH',
      roles: ['EMPLOYEE'],
    },
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

describe('App', () => {
  beforeEach(() => {
    mocks.listDocuments.mockReset();
    mocks.createDownloadIntent.mockReset();
    mocks.triggerBrowserDownload.mockReset();
    mocks.listDocuments.mockResolvedValue([readyDocument]);
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
});
