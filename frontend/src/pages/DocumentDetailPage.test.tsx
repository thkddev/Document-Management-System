import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentDetailPage } from './DocumentDetailPage';

const mocks = vi.hoisted(() => ({
  getDocumentDetail: vi.fn(),
  createDownloadIntent: vi.fn(),
  triggerBrowserDownload: vi.fn(),
}));

vi.mock('../features/auth/AuthContext', () => ({
  useAuth: () => ({
    currentUser: {
      userId: 'user-1',
      email: 'user@example.com',
      displayName: 'Duy Admin',
      departmentId: 'TECH',
      roles: ['SYSTEM_ADMIN'],
    },
    logout: vi.fn(),
  }),
}));

vi.mock('../lib/documents', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDocumentDetail: mocks.getDocumentDetail,
  createDownloadIntent: mocks.createDownloadIntent,
  triggerBrowserDownload: mocks.triggerBrowserDownload,
}));

const detail = {
  documentId: 'document-1',
  title: 'Báo cáo tuần kỹ thuật',
  originalFileName: 'bao-cao.pdf',
  contentType: 'application/pdf',
  classification: 'INTERNAL',
  departmentId: 'TECH',
  ownerId: 'user-1',
  ownerEmail: 'user@example.com',
  sizeBytes: 1453085,
  currentVersion: 1,
  status: 'READY',
  createdAt: '2026-06-20T06:00:00.000Z',
  updatedAt: '2026-06-20T06:30:28.640Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/documents/document-1']}>
      <Routes>
        <Route path="/documents/:documentId" element={<DocumentDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DocumentDetailPage', () => {
  beforeEach(() => {
    mocks.getDocumentDetail.mockReset();
    mocks.createDownloadIntent.mockReset();
    mocks.triggerBrowserDownload.mockReset();
    mocks.getDocumentDetail.mockResolvedValue(detail);
    mocks.createDownloadIntent.mockResolvedValue({
      downloadUrl: 'https://signed.example/download',
      expiresAt: '2026-06-20T06:35:00.000Z',
      fileName: 'bao-cao.pdf',
    });
  });

  it('hiển thị metadata thật và trạng thái READY', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: detail.title })).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('Sẵn sàng').length).toBeGreaterThan(0);
  });

  it('tạo và kích hoạt download intent', async () => {
    renderPage();
    await screen.findByRole('heading', { name: detail.title });

    fireEvent.click(screen.getByRole('button', { name: 'Tải xuống' }));

    await vi.waitFor(() => expect(mocks.createDownloadIntent).toHaveBeenCalledWith('document-1'));
    expect(mocks.triggerBrowserDownload).toHaveBeenCalled();
  });

  it('vô hiệu hóa tải xuống khi tài liệu chưa READY', async () => {
    mocks.getDocumentDetail.mockResolvedValue({ ...detail, status: 'SCANNING' });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Tải xuống' })).toBeDisabled();
  });

  it('hiển thị trạng thái không tìm thấy an toàn', async () => {
    mocks.getDocumentDetail.mockRejectedValue(
      Object.assign(new Error('Không tìm thấy'), { name: 'ApiRequestError', status: 404 }),
    );
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Không thể mở tài liệu' }),
    ).toBeInTheDocument();
  });
});
