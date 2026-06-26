import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentDetailPage } from './DocumentDetailPage';
import { ApiRequestError } from '../lib/api-client';

const mocks = vi.hoisted(() => ({
  getDocumentDetail: vi.fn(),
  listDocumentAuditEvents: vi.fn(),
  listDepartmentShares: vi.fn(),
  revokeDepartmentShare: vi.fn(),
  createDownloadIntent: vi.fn(),
  triggerBrowserDownload: vi.fn(),
  currentUser: {
    userId: 'user-1',
    email: 'user@example.com',
    displayName: 'Duy Admin',
    departmentId: 'TECH',
    roles: ['SYSTEM_ADMIN'],
  },
}));

vi.mock('../features/auth/AuthContext', () => ({
  useAuth: () => ({
    currentUser: mocks.currentUser,
    logout: vi.fn(),
  }),
}));

vi.mock('../lib/documents', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDocumentDetail: mocks.getDocumentDetail,
  listDocumentAuditEvents: mocks.listDocumentAuditEvents,
  listDepartmentShares: mocks.listDepartmentShares,
  revokeDepartmentShare: mocks.revokeDepartmentShare,
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
  accessScope: 'DEPARTMENT',
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
    mocks.currentUser = {
      userId: 'user-1',
      email: 'user@example.com',
      displayName: 'Duy Admin',
      departmentId: 'TECH',
      roles: ['SYSTEM_ADMIN'],
    };
    mocks.getDocumentDetail.mockReset();
    mocks.listDocumentAuditEvents.mockReset();
    mocks.listDepartmentShares.mockReset();
    mocks.revokeDepartmentShare.mockReset();
    mocks.createDownloadIntent.mockReset();
    mocks.triggerBrowserDownload.mockReset();
    mocks.getDocumentDetail.mockResolvedValue(detail);
    mocks.listDocumentAuditEvents.mockResolvedValue([
      {
        eventId: 'event-1',
        action: 'DOCUMENT_READY',
        actorType: 'SYSTEM',
        actorId: 'upload-processor',
        source: 'UPLOAD_PROCESSOR',
        outcome: 'SUCCESS',
        occurredAt: '2026-06-20T06:30:28.640Z',
        versionNumber: 1,
      },
      {
        eventId: 'event-2',
        action: 'DOCUMENT_DOWNLOAD_REQUESTED',
        actorType: 'USER',
        actorId: 'user@example.com',
        source: 'API',
        outcome: 'SUCCESS',
        occurredAt: '2026-06-20T06:35:28.640Z',
        versionNumber: 1,
      },
    ]);
    mocks.listDepartmentShares.mockResolvedValue([]);
    mocks.revokeDepartmentShare.mockResolvedValue({
      documentId: 'document-1',
      targetDepartmentId: 'HR',
      status: 'REVOKED',
    });
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
    expect(await screen.findByText('Tài liệu chưa được chia sẻ cho phòng ban khác.')).toBeInTheDocument();
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

  it('hiển thị danh sách quyền đã chia sẻ', async () => {
    mocks.listDepartmentShares.mockResolvedValue([
      {
        documentId: 'document-1',
        sourceDepartmentId: 'TECH',
        targetDepartmentId: 'HR',
        requestedBy: 'user-1',
        approvedBy: 'admin-1',
        requestedAt: '2026-06-20T06:10:00.000Z',
        approvedAt: '2026-06-20T06:20:00.000Z',
      },
    ]);

    renderPage();

    const sharedAccessSection = await screen.findByRole('region', { name: 'Quyền đã chia sẻ' });
    expect(await within(sharedAccessSection).findByText('Nhân sự')).toBeInTheDocument();
    expect(within(sharedAccessSection).getByText('HR')).toBeInTheDocument();
    expect(within(sharedAccessSection).getByRole('button', { name: /Thu hồi/ })).toBeInTheDocument();
  });

  it('thu hồi quyền chia sẻ bằng xác nhận trong UI', async () => {
    mocks.listDepartmentShares
      .mockResolvedValueOnce([
        {
          documentId: 'document-1',
          sourceDepartmentId: 'TECH',
          targetDepartmentId: 'HR',
          requestedBy: 'user-1',
          approvedBy: 'admin-1',
          requestedAt: '2026-06-20T06:10:00.000Z',
          approvedAt: '2026-06-20T06:20:00.000Z',
        },
      ])
      .mockResolvedValueOnce([]);

    renderPage();
    const sharedAccessSection = await screen.findByRole('region', { name: 'Quyền đã chia sẻ' });
    await within(sharedAccessSection).findByText('Nhân sự');

    fireEvent.click(within(sharedAccessSection).getByRole('button', { name: /Thu hồi/ }));
    expect(screen.getByText('Thu hồi quyền của Nhân sự?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thu hồi' }));

    await vi.waitFor(() =>
      expect(mocks.revokeDepartmentShare).toHaveBeenCalledWith('document-1', 'HR'),
    );
    expect(await screen.findByText('Đã thu hồi quyền chia sẻ.')).toBeInTheDocument();
  });

  it('không hiển thị quản lý quyền đã chia sẻ cho Department Admin phòng nhận', async () => {
    mocks.currentUser = {
      ...mocks.currentUser,
      userId: 'hr-admin',
      departmentId: 'HR',
      roles: ['DEPARTMENT_ADMIN'],
    };

    renderPage();
    await screen.findByRole('heading', { name: detail.title });

    expect(screen.queryByRole('heading', { name: 'Quyền đã chia sẻ' })).not.toBeInTheDocument();
    expect(mocks.listDepartmentShares).not.toHaveBeenCalled();
  });

  it('shows no-permission audit error when Lambda returns DOCUMENT_NOT_FOUND', async () => {
    mocks.listDocumentAuditEvents.mockRejectedValue(
      new ApiRequestError(404, {
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Không tìm thấy tài liệu.',
        requestId: 'request-1',
      }),
    );

    renderPage();

    expect(
      await screen.findByText('Bạn không có quyền xem lịch sử hoạt động của tài liệu này.'),
    ).toBeInTheDocument();
  });

  it('shows deploy-route audit error when endpoint returns non-standard 404', async () => {
    mocks.listDocumentAuditEvents.mockRejectedValue(
      new ApiRequestError(404, {
        code: 'UNKNOWN_ERROR',
        message: 'HTTP 404',
        requestId: '',
      }),
    );

    renderPage();

    expect(
      await screen.findByText(
        'Chưa tải được lịch sử hoạt động. Vui lòng kiểm tra backend đã deploy route audit-events.',
      ),
    ).toBeInTheDocument();
  });

});
