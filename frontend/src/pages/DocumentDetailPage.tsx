import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  CircleUserRound,
  Download,
  FileClock,
  Send,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FileTypeMark,
  NavContent,
  accessScopeLabels,
  classificationLabels,
  departmentOptions,
  fileType,
  formatSize,
  formatUpdatedAt,
  statusLabels,
  toInitials,
} from '../App';
import { useAuth } from '../features/auth/AuthContext';
import { ApiRequestError } from '../lib/api-client';
import {
  createDepartmentShare,
  createDownloadIntent,
  getDocumentDetail,
  triggerBrowserDownload,
  type DocumentDetail,
} from '../lib/documents';

export function DocumentDetailPage() {
  const { documentId = '' } = useParams();
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [targetDepartmentId, setTargetDepartmentId] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [shareError, setShareError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void getDocumentDetail(documentId)
      .then((item) => {
        if (active) setDocument(item);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setDocument(null);
        setError(
          err instanceof ApiRequestError && err.status === 404
            ? 'Không tìm thấy tài liệu hoặc bạn không có quyền truy cập.'
            : err instanceof Error
              ? err.message
              : 'Không thể tải thông tin tài liệu. Vui lòng thử lại.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [documentId]);

  async function handleDownload(): Promise<void> {
    if (!document || document.status !== 'READY') return;
    setDownloading(true);
    setDownloadError('');
    try {
      triggerBrowserDownload(await createDownloadIntent(document.documentId));
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : 'Không thể tạo liên kết tải xuống. Vui lòng thử lại.',
      );
    } finally {
      setDownloading(false);
    }
  }

  const displayName = currentUser?.displayName ?? '';
  const departmentId = currentUser?.departmentId ?? '';
  const canCreateDepartmentShare =
    !!document &&
    !!currentUser &&
    (document.ownerId === currentUser.userId ||
      document.departmentId === currentUser.departmentId ||
      currentUser.roles.includes('SYSTEM_ADMIN'));
  const shareDepartmentOptions = departmentOptions.filter(
    (item) => item.id !== document?.departmentId,
  );
  const requiresShareApproval =
    document?.classification === 'CONFIDENTIAL' || document?.classification === 'RESTRICTED';

  async function handleDepartmentShare(): Promise<void> {
    if (!document || !targetDepartmentId) return;
    setSharing(true);
    setShareMessage('');
    setShareError('');
    try {
      const result = await createDepartmentShare(document.documentId, targetDepartmentId);
      setShareMessage(
        result.mode === 'GRANTED'
          ? 'Đã chia sẻ tài liệu cho phòng ban đã chọn.'
          : 'Đã gửi yêu cầu duyệt chia sẻ.',
      );
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Không thể chia sẻ tài liệu.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavContent
          displayName={displayName}
          departmentId={departmentId}
          onLogout={logout}
          onNavigate={() => navigate('/')}
        />
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
              onLogout={logout}
              onNavigate={() => {
                setMobileNavOpen(false);
                navigate('/');
              }}
            />
          </div>
        </div>
      )}

      <main className="main-content">
        <header className="topbar detail-topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Mở điều hướng"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="detail-breadcrumb">
            <span>Tài liệu</span>
            <span aria-hidden="true">/</span>
            <strong>{document?.title ?? 'Chi tiết'}</strong>
          </div>
          <button className="icon-button notification-button" aria-label="Thông báo">
            <Bell size={19} />
          </button>
          <button className="account-button" onClick={logout} title="Đăng xuất">
            <CircleUserRound size={20} />
            <span>{displayName || toInitials(displayName)}</span>
            <ChevronDown size={15} />
          </button>
        </header>

        <section className="workspace detail-workspace" aria-labelledby="detail-title">
          <button className="detail-back" onClick={() => navigate('/')}>
            <ArrowLeft size={16} />
            Quay lại danh sách
          </button>

          {loading && (
            <div className="detail-state" aria-live="polite">
              <FileClock size={30} />
              <h1 id="detail-title">Đang tải thông tin tài liệu</h1>
              <p>Hệ thống đang kiểm tra quyền truy cập và lấy metadata mới nhất.</p>
            </div>
          )}

          {!loading && error && (
            <div className="detail-state detail-state--error" role="alert">
              <FileClock size={30} />
              <h1 id="detail-title">Không thể mở tài liệu</h1>
              <p>{error}</p>
              <button className="quiet-button" onClick={() => navigate('/')}>
                Quay lại danh sách
              </button>
            </div>
          )}

          {!loading && document && (
            <>
              <div className="detail-heading">
                <div className="detail-identity">
                  <FileTypeMark type={fileType(document)} />
                  <div>
                    <p className="section-kicker">Hồ sơ tài liệu</p>
                    <h1 id="detail-title">{document.title}</h1>
                    <p>{document.originalFileName}</p>
                  </div>
                </div>
                <button
                  className="primary-action"
                  disabled={document.status !== 'READY' || downloading}
                  onClick={() => void handleDownload()}
                  title={
                    document.status === 'READY'
                      ? 'Tạo liên kết tải xuống có hiệu lực 5 phút'
                      : 'Tài liệu chưa sẵn sàng để tải xuống'
                  }
                >
                  <Download size={18} />
                  {downloading ? 'Đang tạo liên kết' : 'Tải xuống'}
                </button>
              </div>

              <div className={`detail-status detail-status--${document.status.toLowerCase()}`}>
                <ShieldCheck size={20} />
                <div>
                  <strong>{statusLabels[document.status]}</strong>
                  <p>
                    {document.status === 'READY'
                      ? 'Tài liệu đã vượt qua kiểm tra và sẵn sàng tải xuống.'
                      : (document.statusReason ?? 'Tài liệu chưa sẵn sàng để tải xuống.')}
                  </p>
                </div>
              </div>

              {downloadError && (
                <p className="document-load-error detail-download-error" role="alert">
                  {downloadError}
                </p>
              )}

              <div className="detail-grid">
                <section className="detail-section" aria-labelledby="metadata-heading">
                  <div className="detail-section-heading">
                    <p className="section-kicker">Metadata</p>
                    <h2 id="metadata-heading">Thông tin tài liệu</h2>
                  </div>
                  <dl className="detail-metadata">
                    <div>
                      <dt>Người sở hữu</dt>
                      <dd>{document.ownerEmail}</dd>
                    </div>
                    <div>
                      <dt>Phòng ban</dt>
                      <dd>{document.departmentId}</dd>
                    </div>
                    <div>
                      <dt>Phân loại</dt>
                      <dd>{classificationLabels[document.classification]}</dd>
                    </div>
                    <div>
                      <dt>Phạm vi truy cập</dt>
                      <dd>{accessScopeLabels[document.accessScope]}</dd>
                    </div>
                    <div>
                      <dt>Phiên bản hiện tại</dt>
                      <dd>v{document.currentVersion}</dd>
                    </div>
                    <div>
                      <dt>Dung lượng</dt>
                      <dd>{formatSize(document.sizeBytes)}</dd>
                    </div>
                    <div>
                      <dt>Loại nội dung</dt>
                      <dd>{document.contentType}</dd>
                    </div>
                    <div>
                      <dt>Ngày tạo</dt>
                      <dd>{formatUpdatedAt(document.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Cập nhật gần nhất</dt>
                      <dd>{formatUpdatedAt(document.updatedAt)}</dd>
                    </div>
                  </dl>
                </section>

                <aside className="detail-guidance" aria-labelledby="access-heading">
                  <p className="section-kicker">Truy cập an toàn</p>
                  <h2 id="access-heading">Liên kết tải có thời hạn</h2>
                  <p>Mỗi lần tải, hệ thống cấp một liên kết riêng có hiệu lực trong 5 phút.</p>
                  <dl>
                    <div>
                      <dt>Trạng thái</dt>
                      <dd>{statusLabels[document.status]}</dd>
                    </div>
                    <div>
                      <dt>Tài liệu</dt>
                      <dd>{document.documentId}</dd>
                    </div>
                  </dl>
                </aside>
              </div>

              {canCreateDepartmentShare && (
                <section className="detail-section share-section" aria-labelledby="share-heading">
                  <div className="detail-section-heading">
                    <p className="section-kicker">Chia sẻ an toàn</p>
                    <h2 id="share-heading">Chia sẻ phòng ban</h2>
                  </div>
                  <div className="share-form">
                    <label>
                      <span>Phòng ban nhận</span>
                      <select
                        value={targetDepartmentId}
                        onChange={(event) => setTargetDepartmentId(event.target.value)}
                        disabled={sharing}
                      >
                        <option value="">Chọn phòng ban</option>
                        {shareDepartmentOptions.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="primary-action"
                      type="button"
                      disabled={!targetDepartmentId || sharing}
                      onClick={() => void handleDepartmentShare()}
                    >
                      <Send size={18} />
                      {sharing ? 'Đang xử lý' : 'Chia sẻ'}
                    </button>
                  </div>
                  {requiresShareApproval && (
                    <p className="share-hint">
                      Tài liệu nhạy cảm cần Department Admin phê duyệt trước khi chia sẻ.
                    </p>
                  )}
                  {shareMessage && (
                    <p className="upload-status upload-status--success">{shareMessage}</p>
                  )}
                  {shareError && <p className="upload-status upload-status--error">{shareError}</p>}
                </section>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
