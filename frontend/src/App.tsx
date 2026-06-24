import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Archive,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Download,
  FileClock,
  FilePlus2,
  Files,
  FolderKanban,
  History,
  LogOut,
  Menu,
  MoreHorizontal,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './features/auth/AuthContext';
import {
  createDownloadIntent as requestDownloadIntent,
  approveShareRequest,
  hasProcessingDocuments,
  listPendingShareRequests,
  listDocuments,
  rejectShareRequest,
  triggerBrowserDownload,
  type DepartmentShareRequestSummary,
  type DocumentStatus,
  type DocumentSummary,
} from './lib/documents';
import {
  calculateSha256,
  createUploadIntent,
  uploadFileToSignedUrl,
  type DocumentAccessScope,
  type DocumentClassification,
} from './lib/uploads';

type Classification = 'Công khai' | 'Nội bộ' | 'Mật' | 'Hạn chế';
type ShareRequestFilter = 'ALL' | 'CONFIDENTIAL' | 'RESTRICTED';

interface DocumentItem {
  id: string;
  title: string;
  type: 'PDF' | 'DOCX' | 'XLSX' | 'PNG' | 'JPG' | 'FILE';
  department: string;
  owner: string;
  version: number;
  size: string;
  updated: string;
  classification: Classification;
  accessScope: DocumentAccessScope;
  status: DocumentStatus;
  statusReason?: string;
}

export const classificationLabels: Record<DocumentSummary['classification'], Classification> = {
  PUBLIC: 'Công khai',
  INTERNAL: 'Nội bộ',
  CONFIDENTIAL: 'Mật',
  RESTRICTED: 'Hạn chế',
};

export const accessScopeLabels: Record<DocumentAccessScope, string> = {
  DEPARTMENT: 'Phòng ban',
  ALL_EMPLOYEES: 'Toàn công ty',
};

export const statusLabels: Record<DocumentStatus, string> = {
  UPLOAD_PENDING: 'Đang tải lên',
  UPLOADED: 'Đã nhận',
  VALIDATING: 'Đang xác minh',
  SCANNING: 'Đang quét',
  READY: 'Sẵn sàng',
  INFECTED: 'Có mã độc',
  REJECTED: 'Bị từ chối',
  FAILED: 'Xử lý lỗi',
};

export function fileType(document: DocumentSummary): DocumentItem['type'] {
  const extension = document.originalFileName.split('.').pop()?.toUpperCase();
  if (extension === 'PDF' || extension === 'DOCX' || extension === 'XLSX' || extension === 'PNG') {
    return extension;
  }
  return extension === 'JPG' || extension === 'JPEG' ? 'JPG' : 'FILE';
}

export function formatSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
}

export function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function toDocumentItem(document: DocumentSummary): DocumentItem {
  const item: DocumentItem = {
    id: document.documentId,
    title: document.title,
    type: fileType(document),
    department: document.departmentId,
    owner: document.ownerEmail,
    version: document.currentVersion,
    size: formatSize(document.sizeBytes),
    updated: formatUpdatedAt(document.updatedAt),
    classification: classificationLabels[document.classification],
    accessScope: document.accessScope,
    status: document.status,
  };
  if (document.statusReason) {
    item.statusReason = document.statusReason;
  }
  return item;
}

const navItems = [
  { label: 'Tổng quan', icon: FolderKanban, active: true },
  { label: 'Tất cả tài liệu', icon: Files },
  { label: 'Được chia sẻ', icon: Users },
  { label: 'Gần đây', icon: Clock3 },
  { label: 'Đã đánh dấu', icon: Star },
];

export const departmentOptions = [
  { id: 'HR', label: 'Nhân sự' },
  { id: 'TECH', label: 'Kỹ thuật' },
  { id: 'SA', label: 'Kinh doanh' },
] as const;

const activities = [
  { time: '10:15', action: 'Trần Minh tạo phiên bản 7', target: 'Đặc tả DMS' },
  { time: '09:42', action: 'Nguyễn An chia sẻ với phòng Nhân sự', target: 'Quy trình tiếp nhận' },
  { time: '08:03', action: 'Hệ thống hoàn tất kiểm tra an toàn', target: 'Biểu mẫu đánh giá' },
];

const uploadClassifications: Array<{ value: DocumentClassification; label: string }> = [
  { value: 'INTERNAL', label: 'Nội bộ' },
  { value: 'CONFIDENTIAL', label: 'Mật' },
  { value: 'RESTRICTED', label: 'Hạn chế' },
  { value: 'PUBLIC', label: 'Công khai' },
];

const shareRequestFilters: Array<{ value: ShareRequestFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'CONFIDENTIAL', label: 'Mật' },
  { value: 'RESTRICTED', label: 'Hạn chế' },
];

function inferContentType(file: File): string {
  if (file.type) return file.type;
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lowerName.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

export function FileTypeMark({ type }: { type: DocumentItem['type'] }) {
  return (
    <span className={`file-mark file-mark--${type.toLowerCase()}`} aria-label={`Tệp ${type}`}>
      {type}
    </span>
  );
}

/** Tạo initials từ display name (2 chữ cái cuối) */
export function toInitials(name: string): string {
  return name
    .split(' ')
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function NavContent({
  onNavigate,
  displayName,
  departmentId,
  onLogout,
}: {
  onNavigate?: () => void;
  displayName: string;
  departmentId: string;
  onLogout: () => void;
}) {
  const initials = toInitials(displayName);

  return (
    <>
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <strong>Hồ sơ nội bộ</strong>
          <small>Document register</small>
        </div>
      </div>

      <nav aria-label="Điều hướng chính">
        <p className="nav-eyebrow">Tủ tài liệu</p>
        <ul className="nav-list">
          {navItems.map(({ label, icon: Icon, active }) => (
            <li key={label}>
              <button className={active ? 'nav-link is-active' : 'nav-link'} onClick={onNavigate}>
                <Icon size={18} strokeWidth={1.7} />
                <span>{label}</span>
                {label === 'Được chia sẻ' && <span className="nav-count">12</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="cabinet-section">
        <p className="nav-eyebrow">Phòng ban</p>
        <button className="cabinet-row" onClick={onNavigate}>
          <span className="cabinet-code">HR</span>
          Nhân sự
          <span>38</span>
        </button>
        <button className="cabinet-row" onClick={onNavigate}>
          <span className="cabinet-code">TE</span>
          Kỹ thuật
          <span>86</span>
        </button>
        <button className="cabinet-row" onClick={onNavigate}>
          <span className="cabinet-code">SA</span>
          Kinh doanh
          <span>51</span>
        </button>
      </div>

      <div className="storage-note">
        <div className="storage-note__heading">
          <span>Dung lượng</span>
          <strong>18,4 / 50 GB</strong>
        </div>
        <div className="storage-bar" aria-label="Đã dùng 37 phần trăm dung lượng">
          <span />
        </div>
        <small>37% đã sử dụng</small>
      </div>

      <button className="profile-chip" onClick={onNavigate}>
        <span className="avatar">{initials}</span>
        <span>
          <strong>{displayName}</strong>
          <small>{departmentId}</small>
        </span>
        <ChevronRight size={16} />
      </button>

      <button className="nav-logout" onClick={onLogout} aria-label="Đăng xuất">
        <LogOut size={15} strokeWidth={1.8} />
        Đăng xuất
      </button>
    </>
  );
}

export function App() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadClassification, setUploadClassification] =
    useState<DocumentClassification>('INTERNAL');
  const [uploadAccessScope, setUploadAccessScope] = useState<DocumentAccessScope>('DEPARTMENT');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [documentSummaries, setDocumentSummaries] = useState<DocumentSummary[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [shareRequests, setShareRequests] = useState<DepartmentShareRequestSummary[]>([]);
  const [shareRequestsError, setShareRequestsError] = useState('');
  const [shareReviewMessage, setShareReviewMessage] = useState('');
  const [reviewingShareRequestId, setReviewingShareRequestId] = useState<string | null>(null);
  const [shareRequestFilter, setShareRequestFilter] = useState<ShareRequestFilter>('ALL');
  const [rejectingShareRequest, setRejectingShareRequest] =
    useState<DepartmentShareRequestSummary | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState('');

  // currentUser luôn có giá trị khi App được render (ProtectedRoute đảm bảo điều này)
  const displayName = currentUser?.displayName ?? '';
  const departmentId = currentUser?.departmentId ?? '';
  const canPublishToAllEmployees = currentUser?.roles.includes('SYSTEM_ADMIN') ?? false;
  const canReviewShareRequests =
    currentUser?.roles.some((role) => role === 'DEPARTMENT_ADMIN' || role === 'SYSTEM_ADMIN') ??
    false;
  const initials = toInitials(displayName);
  const documents = useMemo(() => documentSummaries.map(toDocumentItem), [documentSummaries]);
  const processingCount = documentSummaries.filter((document) =>
    hasProcessingDocuments([document]),
  ).length;
  const filteredShareRequests = useMemo(() => {
    if (shareRequestFilter === 'ALL') return shareRequests;
    return shareRequests.filter((request) => request.classification === shareRequestFilter);
  }, [shareRequestFilter, shareRequests]);

  const refreshDocuments = useCallback(async (showLoading = false): Promise<void> => {
    if (showLoading) setDocumentsLoading(true);
    try {
      const items = await listDocuments();
      setDocumentSummaries(items);
      setDocumentsError('');
    } catch {
      setDocumentsError('Không thể cập nhật danh sách tài liệu. Vui lòng thử lại.');
    } finally {
      if (showLoading) setDocumentsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDocuments(true);
  }, [refreshDocuments]);

  useEffect(() => {
    if (!hasProcessingDocuments(documentSummaries)) return;
    const timer = window.setInterval(() => void refreshDocuments(), 5000);
    return () => window.clearInterval(timer);
  }, [documentSummaries, refreshDocuments]);

  const refreshShareRequests = useCallback(async (): Promise<void> => {
    if (!canReviewShareRequests) {
      setShareRequests([]);
      setShareReviewMessage('');
      setRejectingShareRequest(null);
      return;
    }
    try {
      setShareRequests(await listPendingShareRequests());
      setShareRequestsError('');
    } catch {
      setShareRequestsError('Không thể tải yêu cầu chia sẻ chờ duyệt.');
    }
  }, [canReviewShareRequests]);

  useEffect(() => {
    void refreshShareRequests();
  }, [refreshShareRequests]);

  useEffect(() => {
    if (!canPublishToAllEmployees && uploadAccessScope !== 'DEPARTMENT') {
      setUploadAccessScope('DEPARTMENT');
    }
  }, [canPublishToAllEmployees, uploadAccessScope]);

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi');
    if (!normalized) return documents;
    return documents.filter((document) =>
      [document.title, document.department, document.owner, document.type]
        .join(' ')
        .toLocaleLowerCase('vi')
        .includes(normalized),
    );
  }, [documents, query]);

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError('');
    setUploadMessage('');

    if (!uploadFile) {
      setUploadError('Vui lòng chọn một file để tải lên.');
      return;
    }

    const title = uploadTitle.trim() || uploadFile.name.replace(/\.[^.]+$/, '');
    setIsUploading(true);
    try {
      const checksumSha256 = await calculateSha256(uploadFile);
      const intent = await createUploadIntent({
        title,
        departmentId,
        classification: uploadClassification,
        accessScope: canPublishToAllEmployees ? uploadAccessScope : 'DEPARTMENT',
        originalFileName: uploadFile.name,
        contentType: inferContentType(uploadFile),
        sizeBytes: uploadFile.size,
        checksumSha256,
      });

      await uploadFileToSignedUrl(uploadFile, intent);
      await refreshDocuments();
      setUploadMessage('File đã được gửi vào vùng kiểm tra. Trạng thái sẽ tự động cập nhật.');
      setUploadTitle('');
      setUploadAccessScope('DEPARTMENT');
      setUploadFile(null);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Không thể tải file lên. Vui lòng thử lại.',
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleQuickDownload(documentId: string): Promise<void> {
    setDownloadError('');
    setDownloadingDocumentId(documentId);
    try {
      triggerBrowserDownload(await requestDownloadIntent(documentId));
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : 'Không thể tạo liên kết tải xuống. Vui lòng thử lại.',
      );
    } finally {
      setDownloadingDocumentId(null);
    }
  }

  async function handleApproveShareRequest(shareRequestId: string): Promise<void> {
    setReviewingShareRequestId(shareRequestId);
    setShareRequestsError('');
    setShareReviewMessage('');
    try {
      await approveShareRequest(shareRequestId);
      await Promise.all([refreshShareRequests(), refreshDocuments()]);
      setShareReviewMessage('Đã duyệt yêu cầu chia sẻ.');
    } catch (err) {
      setShareRequestsError(
        err instanceof Error
          ? err.message
          : 'Không thể duyệt yêu cầu chia sẻ. Vui lòng thử lại.',
      );
    } finally {
      setReviewingShareRequestId(null);
    }
  }

  function openRejectShareRequest(request: DepartmentShareRequestSummary): void {
    setRejectingShareRequest(request);
    setRejectionReason('');
    setRejectionError('');
    setShareRequestsError('');
    setShareReviewMessage('');
  }

  function closeRejectShareRequest(): void {
    setRejectingShareRequest(null);
    setRejectionReason('');
    setRejectionError('');
  }

  async function handleRejectShareRequest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!rejectingShareRequest) return;

    const reason = rejectionReason.trim();
    if (reason.length < 3) {
      setRejectionError('Vui lòng nhập lý do từ chối từ 3 ký tự trở lên.');
      return;
    }

    setReviewingShareRequestId(rejectingShareRequest.shareRequestId);
    setShareRequestsError('');
    setShareReviewMessage('');
    setRejectionError('');
    try {
      await rejectShareRequest(rejectingShareRequest.shareRequestId, reason);
      await refreshShareRequests();
      setShareReviewMessage('Đã từ chối yêu cầu chia sẻ.');
      closeRejectShareRequest();
    } catch (err) {
      setShareRequestsError(
        err instanceof Error
          ? err.message
          : 'Không thể từ chối yêu cầu chia sẻ. Vui lòng thử lại.',
      );
    } finally {
      setReviewingShareRequestId(null);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavContent displayName={displayName} departmentId={departmentId} onLogout={logout} />
      </aside>

      {mobileNavOpen && (
        <div className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Điều hướng">
          <button
            className="drawer-backdrop"
            aria-label="Đóng điều hướng"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="drawer-panel">
            <button
              className="icon-button drawer-close"
              aria-label="Đóng"
              onClick={() => setMobileNavOpen(false)}
            >
              <X size={20} />
            </button>
            <NavContent
              displayName={displayName}
              departmentId={departmentId}
              onLogout={() => {
                logout();
                setMobileNavOpen(false);
              }}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}

      <main className="main-content">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Mở điều hướng"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={21} />
          </button>
          <label className="global-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Tìm kiếm tài liệu</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên, người tạo, phòng ban..."
            />
            <kbd>⌘ K</kbd>
          </label>
          <button className="icon-button notification-button" aria-label="Thông báo">
            <Bell size={19} />
            <span className="notification-dot" />
          </button>
          <button className="account-button" onClick={logout} title="Đăng xuất">
            <CircleUserRound size={20} />
            <span>{displayName || initials}</span>
            <ChevronDown size={15} />
          </button>
        </header>

        <section className="workspace" aria-labelledby="page-title">
          <div className="page-heading">
            <div>
              <p className="section-kicker">Thứ sáu · 19 tháng 6</p>
              <h1 id="page-title">Tài liệu cần bạn chú ý</h1>
              <p>Phiên bản, quyền truy cập và trạng thái kiểm tra được tập trung tại một nơi.</p>
            </div>
            <button className="primary-action" onClick={() => setUploadOpen((open) => !open)}>
              <FilePlus2 size={18} />
              Tải tài liệu lên
            </button>
          </div>

          {uploadOpen && (
            <section className="upload-panel" aria-labelledby="upload-heading">
              <div>
                <p className="section-kicker">Upload an toàn</p>
                <h2 id="upload-heading">Tạo yêu cầu tải lên</h2>
              </div>
              <form className="upload-form" onSubmit={handleUploadSubmit}>
                <label>
                  <span>Tiêu đề</span>
                  <input
                    value={uploadTitle}
                    onChange={(event) => setUploadTitle(event.target.value)}
                    placeholder="Mặc định lấy theo tên file"
                    disabled={isUploading}
                  />
                </label>
                <label>
                  <span>Phân loại</span>
                  <select
                    value={uploadClassification}
                    onChange={(event) =>
                      setUploadClassification(event.target.value as DocumentClassification)
                    }
                    disabled={isUploading}
                  >
                    {uploadClassifications.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Phạm vi truy cập</span>
                  <select
                    value={uploadAccessScope}
                    onChange={(event) =>
                      setUploadAccessScope(event.target.value as DocumentAccessScope)
                    }
                    disabled={isUploading || !canPublishToAllEmployees}
                  >
                    <option value="DEPARTMENT">Phòng ban hiện tại</option>
                    {canPublishToAllEmployees && (
                      <option value="ALL_EMPLOYEES">Toàn bộ nhân viên</option>
                    )}
                  </select>
                </label>
                <label>
                  <span>File</span>
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
                    onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                    disabled={isUploading}
                  />
                </label>
                <button
                  className="primary-action upload-submit"
                  type="submit"
                  disabled={isUploading}
                >
                  <FilePlus2 size={18} />
                  {isUploading ? 'Đang tải lên...' : 'Gửi file'}
                </button>
              </form>
              {uploadError && <p className="upload-status upload-status--error">{uploadError}</p>}
              {uploadMessage && (
                <p className="upload-status upload-status--success">{uploadMessage}</p>
              )}
            </section>
          )}

          <div className="attention-strip">
            <div className="attention-number">
              <span>{String(processingCount).padStart(2, '0')}</span>
              <small>tài liệu đang xử lý</small>
            </div>
            <div className="attention-item">
              <ShieldCheck size={20} />
              <span>
                <strong>{processingCount} tài liệu đang kiểm tra</strong>
                <small>Thường hoàn tất trong dưới 2 phút</small>
              </span>
            </div>
            <div className="attention-item">
              <FileClock size={20} />
              <span>
                <strong>{shareRequests.length} yêu cầu chia sẻ</strong>
                <small>Đang chờ bạn phản hồi</small>
              </span>
            </div>
            <button className="text-action">
              Xem hàng đợi
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="content-grid">
            <section className="document-panel" aria-labelledby="recent-heading">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">Sổ cập nhật</p>
                  <h2 id="recent-heading">Tài liệu gần đây</h2>
                </div>
                <div className="panel-tools">
                  <button className="quiet-button">
                    <SlidersHorizontal size={16} />
                    Lọc
                  </button>
                  <button className="quiet-button">Xem tất cả</button>
                </div>
              </div>

              <div className="document-header" aria-hidden="true">
                <span>Tài liệu</span>
                <span>Người cập nhật</span>
                <span>Phiên bản</span>
                <span />
              </div>

              <div className="document-list">
                {documentsError && (
                  <p className="document-load-error" role="alert">
                    {documentsError}
                  </p>
                )}
                {downloadError && (
                  <p className="document-load-error" role="alert">
                    {downloadError}
                  </p>
                )}

                {documentsLoading && documents.length === 0 && (
                  <div className="empty-state" aria-live="polite">
                    <FileClock size={28} />
                    <h3>Đang tải tài liệu</h3>
                    <p>Hệ thống đang lấy danh sách mới nhất.</p>
                  </div>
                )}

                {filteredDocuments.map((document) => (
                  <article className="document-row" key={document.id}>
                    <div className="document-identity">
                      <FileTypeMark type={document.type} />
                      <div>
                        <div className="document-title-line">
                          <h3>
                            <button
                              className="document-title-button"
                              onClick={() => navigate(`/documents/${document.id}`)}
                            >
                              {document.title}
                            </button>
                          </h3>
                        </div>
                        <p>
                          {document.department}
                          <span aria-hidden="true">·</span>
                          {document.size}
                          <span
                            className={`classification classification--${document.classification.replaceAll(' ', '-')}`}
                          >
                            {document.classification}
                          </span>
                          <span className="access-scope-label">
                            {accessScopeLabels[document.accessScope]}
                          </span>
                        </p>
                        {document.statusReason && (
                          <p className="document-reason" title={document.statusReason}>
                            {document.statusReason}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="document-owner">
                      <strong>{document.owner}</strong>
                      <small>{document.updated}</small>
                    </div>
                    <div className="version-spine">
                      <span>v{document.version}</span>
                      <small
                        className={`document-status document-status--${document.status.toLowerCase()}`}
                      >
                        {statusLabels[document.status]}
                      </small>
                    </div>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={`Tải ${document.title}`}
                        disabled={
                          document.status !== 'READY' || downloadingDocumentId === document.id
                        }
                        title={
                          document.status === 'READY'
                            ? 'Tải tài liệu xuống'
                            : 'Tài liệu chưa sẵn sàng để tải xuống'
                        }
                        onClick={() => void handleQuickDownload(document.id)}
                      >
                        <Download size={17} />
                      </button>
                      <button className="icon-button" aria-label={`Tùy chọn cho ${document.title}`}>
                        <MoreHorizontal size={18} />
                      </button>
                    </div>
                  </article>
                ))}

                {!documentsLoading && !documentsError && filteredDocuments.length === 0 && (
                  <div className="empty-state">
                    <Archive size={28} />
                    <h3>
                      {documents.length === 0 ? 'Chưa có tài liệu' : 'Không tìm thấy tài liệu'}
                    </h3>
                    <p>
                      {documents.length === 0
                        ? 'Tài liệu tải lên sẽ xuất hiện tại đây.'
                        : 'Thử tên ngắn hơn hoặc tìm theo phòng ban và người cập nhật.'}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <aside className="activity-panel" aria-labelledby="activity-heading">
              {canReviewShareRequests && (
                <section className="share-review-panel" aria-labelledby="share-review-heading">
                  <div className="panel-heading panel-heading--compact">
                    <div>
                      <p className="section-kicker">Duyệt chia sẻ</p>
                      <h2 id="share-review-heading">Yêu cầu chia sẻ chờ duyệt</h2>
                      <small>{shareRequests.length} yêu cầu đang chờ</small>
                    </div>
                    <Users size={19} />
                  </div>

                  <div className="share-review-filters" aria-label="Lọc yêu cầu chia sẻ">
                    {shareRequestFilters.map((filter) => (
                      <button
                        key={filter.value}
                        className={
                          shareRequestFilter === filter.value
                            ? 'share-review-filter is-active'
                            : 'share-review-filter'
                        }
                        type="button"
                        aria-pressed={shareRequestFilter === filter.value}
                        onClick={() => setShareRequestFilter(filter.value)}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>

                  {shareRequestsError && (
                    <p className="document-load-error" role="alert">
                      {shareRequestsError}
                    </p>
                  )}
                  {shareReviewMessage && (
                    <p className="share-review-message" role="status">
                      {shareReviewMessage}
                    </p>
                  )}

                  {shareRequests.length === 0 && !shareRequestsError ? (
                    <p className="share-review-empty">Không có yêu cầu nào đang chờ.</p>
                  ) : filteredShareRequests.length === 0 && !shareRequestsError ? (
                    <p className="share-review-empty">Không có yêu cầu phù hợp bộ lọc.</p>
                  ) : (
                    <ul className="share-review-list">
                      {filteredShareRequests.map((request) => (
                        <li key={request.shareRequestId}>
                          <div>
                            <strong>{request.title}</strong>
                            <span className="share-review-label">
                              {classificationLabels[request.classification]}
                            </span>
                            <dl>
                              <div>
                                <dt>Sở hữu</dt>
                                <dd>{request.sourceDepartmentId}</dd>
                              </div>
                              <div>
                                <dt>Nhận</dt>
                                <dd>{request.targetDepartmentId}</dd>
                              </div>
                            </dl>
                            <small>
                              {request.requestedByEmail} · {formatUpdatedAt(request.createdAt)}
                            </small>
                          </div>
                          <div className="share-review-actions">
                            <button
                              className="quiet-button"
                              disabled={reviewingShareRequestId === request.shareRequestId}
                              onClick={() => void handleApproveShareRequest(request.shareRequestId)}
                            >
                              Duyệt
                            </button>
                            <button
                              className="quiet-button quiet-button--danger"
                              disabled={reviewingShareRequestId === request.shareRequestId}
                              onClick={() => openRejectShareRequest(request)}
                            >
                              Từ chối
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {rejectingShareRequest && (
                    <form className="share-reject-form" onSubmit={handleRejectShareRequest}>
                      <div>
                        <p className="section-kicker">Lý do từ chối</p>
                        <strong>{rejectingShareRequest.title}</strong>
                      </div>
                      <label>
                        <span className="sr-only">Lý do từ chối</span>
                        <textarea
                          value={rejectionReason}
                          onChange={(event) => setRejectionReason(event.target.value)}
                          placeholder="Nhập lý do để người yêu cầu biết cần điều chỉnh gì."
                          disabled={
                            reviewingShareRequestId === rejectingShareRequest.shareRequestId
                          }
                          rows={3}
                        />
                      </label>
                      {rejectionError && (
                        <p className="share-reject-error" role="alert">
                          {rejectionError}
                        </p>
                      )}
                      <div className="share-review-actions">
                        <button
                          className="quiet-button quiet-button--danger"
                          type="submit"
                          disabled={reviewingShareRequestId === rejectingShareRequest.shareRequestId}
                        >
                          Xác nhận từ chối
                        </button>
                        <button
                          className="quiet-button"
                          type="button"
                          disabled={reviewingShareRequestId === rejectingShareRequest.shareRequestId}
                          onClick={closeRejectShareRequest}
                        >
                          Hủy
                        </button>
                      </div>
                    </form>
                  )}
                </section>
              )}

              <div className="panel-heading panel-heading--compact">
                <div>
                  <p className="section-kicker">Dòng thời gian</p>
                  <h2 id="activity-heading">Hoạt động hôm nay</h2>
                </div>
                <History size={19} />
              </div>

              <ol className="activity-list">
                {activities.map((activity) => (
                  <li key={`${activity.time}-${activity.target}`}>
                    <time>{activity.time}</time>
                    <div>
                      <p>{activity.action}</p>
                      <button>{activity.target}</button>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="security-note">
                <ShieldCheck size={22} />
                <div>
                  <strong>Không có cảnh báo quyền truy cập</strong>
                  <p>Lần kiểm tra gần nhất lúc 10:30.</p>
                </div>
              </div>

              <button className="activity-link">
                Mở lịch sử đầy đủ
                <ChevronRight size={16} />
              </button>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
