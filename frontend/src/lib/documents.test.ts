import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('./api-client', () => ({ apiFetch }));

const { createDownloadIntent, getDocumentDetail, hasProcessingDocuments, listDocuments } =
  await import('./documents');

const document = {
  documentId: 'document-1',
  title: 'Báo cáo',
  originalFileName: 'bao-cao.pdf',
  contentType: 'application/pdf',
  classification: 'INTERNAL' as const,
  departmentId: 'TECH',
  ownerId: 'user-1',
  ownerEmail: 'user@example.com',
  accessScope: 'DEPARTMENT' as const,
  sizeBytes: 1024,
  currentVersion: 1,
  status: 'READY' as const,
  updatedAt: '2026-06-20T06:30:28.640Z',
};

describe('documents client', () => {
  beforeEach(() => apiFetch.mockReset());

  it('lấy danh sách từ GET /documents', async () => {
    apiFetch.mockResolvedValue({ items: [document] });

    await expect(listDocuments()).resolves.toEqual([document]);
    expect(apiFetch).toHaveBeenCalledWith('/documents');
  });

  it('nhận diện đúng trạng thái cần polling', () => {
    expect(hasProcessingDocuments([{ ...document, status: 'SCANNING' }])).toBe(true);
    expect(hasProcessingDocuments([document])).toBe(false);
  });

  it('lấy chi tiết tài liệu theo documentId đã encode', async () => {
    apiFetch.mockResolvedValue({ ...document, createdAt: '2026-06-20T06:00:00.000Z' });

    await getDocumentDetail('document/1');

    expect(apiFetch).toHaveBeenCalledWith('/documents/document%2F1');
  });

  it('tạo download intent bằng POST', async () => {
    apiFetch.mockResolvedValue({
      downloadUrl: 'https://signed.example/download',
      expiresAt: '2026-06-20T06:35:00.000Z',
      fileName: 'bao-cao.pdf',
    });

    await createDownloadIntent('document-1');

    expect(apiFetch).toHaveBeenCalledWith('/documents/document-1/download-intents', {
      method: 'POST',
    });
  });
});
