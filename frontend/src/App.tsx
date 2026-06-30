import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  Archive,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Download,
  Eye,
  FileClock,
  FilePlus2,
  Files,
  FolderKanban,
  History,
  LogOut,
  Menu,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Star,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './features/auth/AuthContext';
import {
  createAdminUser,
  listAdminUsers,
  runAdminUserAction,
  updateAdminUser,
  type AdminUserRole,
  type AdminUserSummary,
} from './lib/admin-users';
import {
  createDepartmentShare,
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
type DocumentStatusFilter = 'ALL' | 'PROCESSING' | 'READY' | 'BLOCKED';
type DocumentClassificationFilter = 'ALL' | DocumentClassification;
type DocumentAccessScopeFilter = 'ALL' | DocumentAccessScope;
type DocumentSort = 'UPDATED_DESC' | 'UPDATED_ASC' | 'TITLE_ASC' | 'TITLE_DESC';
type MainView =
  | 'OVERVIEW'
  | 'ALL_DOCUMENTS'
  | 'SHARED_DOCUMENTS'
  | 'RECENT_DOCUMENTS'
  | 'BOOKMARKED_DOCUMENTS'
  | 'DEPARTMENT_DOCUMENTS'
  | 'ADMIN';
type NotificationTone = 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';
type AdminRoleFilter = 'ALL' | 'SYSTEM_ADMIN' | 'DEPARTMENT_ADMIN' | 'EMPLOYEE';
type AdminStatusFilter = 'ALL' | 'ACTIVE' | 'LOCKED';
type AdminRole = AdminUserRole;

interface AppNotification {
  id: string;
  title: string;
  description: string;
  meta: string;
  tone: NotificationTone;
  target: { type: 'DOCUMENT'; documentId: string } | { type: 'SHARE_REVIEW' };
}

interface DocumentItem {
  id: string;
  title: string;
  type: 'PDF' | 'DOCX' | 'XLSX' | 'PNG' | 'JPG' | 'FILE';
  department: string;
  departmentId: string;
  owner: string;
  version: number;
  size: string;
  updated: string;
  updatedAt: string;
  classification: Classification;
  accessScope: DocumentAccessScope;
  status: DocumentStatus;
  statusReason?: string;
}

interface DashboardActivity {
  time: string;
  action: string;
  target: string;
}

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  departmentId: string;
  roles: AdminRole[];
  status: string;
  enabled: boolean;
  updatedAt: string;
}

interface CreateAdminUserForm {
  email: string;
  name: string;
  departmentId: DepartmentId;
  role: AdminRole;
  password: string;
}

interface EditAdminUserForm {
  email: string;
  name: string;
  departmentId: DepartmentId;
  role: AdminRole;
}

export const classificationLabels: Record<DocumentSummary['classification'], Classification> = {
  PUBLIC: 'Công khai',
  INTERNAL: 'Nội bộ',
  CONFIDENTIAL: 'Mật',
  RESTRICTED: 'Hạn chế',
};

export const accessScopeLabels: Record<DocumentAccessScope, string> = {
  DEPARTMENT: 'Phòng ban',
  ALL_EMPLOYEES: 'Toàn bộ nhân viên',
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

function formatStorageGb(
  sizeBytes: number,
  options: { minimumFractionDigits?: number } = {},
): string {
  return (sizeBytes / 1024 ** 3).toLocaleString('vi-VN', {
    maximumFractionDigits: 1,
    minimumFractionDigits: options.minimumFractionDigits ?? (sizeBytes > 0 ? 1 : 0),
  });
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

function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatRefreshTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function activityActionForStatus(status: DocumentStatus): string {
  if (status === 'READY') return 'Tài liệu đã sẵn sàng';
  if (processingStatuses.has(status)) return 'Tài liệu đang được kiểm tra';
  if (status === 'REJECTED') return 'Tài liệu bị từ chối';
  if (status === 'INFECTED') return 'Phát hiện rủi ro an toàn';
  if (status === 'FAILED') return 'Xử lý tài liệu thất bại';
  return 'Cập nhật trạng thái tài liệu';
}

function isSharedDocument(document: DocumentSummary, currentDepartmentId: string): boolean {
  return document.accessScope === 'ALL_EMPLOYEES' || document.departmentId !== currentDepartmentId;
}

function toDocumentItem(document: DocumentSummary): DocumentItem {
  const item: DocumentItem = {
    id: document.documentId,
    title: document.title,
    type: fileType(document),
    department: document.departmentId,
    departmentId: document.departmentId,
    owner: document.ownerEmail,
    version: document.currentVersion,
    size: formatSize(document.sizeBytes),
    updated: formatUpdatedAt(document.updatedAt),
    updatedAt: document.updatedAt,
    classification: classificationLabels[document.classification],
    accessScope: document.accessScope,
    status: document.status,
  };
  if (document.statusReason) {
    item.statusReason = document.statusReason;
  }
  return item;
}

function toAdminUserRow(user: AdminUserSummary): AdminUserRow {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    departmentId: user.departmentId,
    roles: user.roles,
    status: user.status,
    enabled: user.enabled,
    updatedAt: user.updatedAt || user.createdAt,
  };
}

const navItems = [
  { label: 'Tổng quan', icon: FolderKanban, view: 'OVERVIEW' as MainView },
  { label: 'Tất cả tài liệu', icon: Files, view: 'ALL_DOCUMENTS' as MainView },
  { label: 'Được chia sẻ', icon: Users, view: 'SHARED_DOCUMENTS' as MainView },
  { label: 'Gần đây', icon: Clock3, view: 'RECENT_DOCUMENTS' as MainView },
  { label: 'Đã đánh dấu', icon: Star, view: 'BOOKMARKED_DOCUMENTS' as MainView },
];

export const departmentOptions = [
  { id: 'HR', label: 'Nhân sự' },
  { id: 'TECH', label: 'Kỹ thuật' },
  { id: 'SA', label: 'Kinh doanh' },
] as const;

type DepartmentId = (typeof departmentOptions)[number]['id'];

const defaultDepartmentCounts: Record<DepartmentId, number> = { HR: 0, TECH: 0, SA: 0 };

function departmentLabelFor(departmentId: string): string {
  return departmentOptions.find((department) => department.id === departmentId)?.label ?? departmentId;
}

const adminRoleLabels: Record<AdminRole, string> = {
  SYSTEM_ADMIN: 'System Admin',
  DEPARTMENT_ADMIN: 'Department Admin',
  EMPLOYEE: 'Nhân viên',
};

const adminRoleFilters: Array<{ value: AdminRoleFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả vai trò' },
  { value: 'SYSTEM_ADMIN', label: 'System Admin' },
  { value: 'DEPARTMENT_ADMIN', label: 'Department Admin' },
  { value: 'EMPLOYEE', label: 'Nhân viên' },
];

const adminStatusFilters: Array<{ value: AdminStatusFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'LOCKED', label: 'Đã khóa' },
];

const defaultCreateAdminUserForm: CreateAdminUserForm = {
  email: '',
  name: '',
  departmentId: 'TECH',
  role: 'EMPLOYEE',
  password: '',
};

function primaryAdminRole(user: AdminUserRow): AdminRole {
  return user.roles.find((role) => role === 'SYSTEM_ADMIN' || role === 'DEPARTMENT_ADMIN') ?? 'EMPLOYEE';
}

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

const documentStatusFilters: Array<{ value: DocumentStatusFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'PROCESSING', label: 'Đang xử lý' },
  { value: 'READY', label: 'Sẵn sàng' },
  { value: 'BLOCKED', label: 'Bị từ chối/lỗi' },
];

const documentClassificationFilters: Array<{
  value: DocumentClassificationFilter;
  label: string;
}> = [
  { value: 'ALL', label: 'Tất cả phân loại' },
  { value: 'PUBLIC', label: 'Công khai' },
  { value: 'INTERNAL', label: 'Nội bộ' },
  { value: 'CONFIDENTIAL', label: 'Mật' },
  { value: 'RESTRICTED', label: 'Hạn chế' },
];

const documentAccessScopeFilters: Array<{ value: DocumentAccessScopeFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả phạm vi' },
  { value: 'DEPARTMENT', label: 'Phòng ban' },
  { value: 'ALL_EMPLOYEES', label: 'Toàn bộ nhân viên' },
];

const documentSortOptions: Array<{ value: DocumentSort; label: string }> = [
  { value: 'UPDATED_DESC', label: 'Mới cập nhật nhất' },
  { value: 'UPDATED_ASC', label: 'Cũ nhất' },
  { value: 'TITLE_ASC', label: 'Tên A-Z' },
  { value: 'TITLE_DESC', label: 'Tên Z-A' },
];

const documentPageSizeOptions = [10, 20, 50] as const;
const seenNotificationsStorageKey = 'dms:seen-notifications';
const bookmarkedDocumentsStorageKey = 'dms:bookmarked-documents';
const storageQuotaBytes = 50 * 1024 ** 3;

const processingStatuses = new Set<DocumentStatus>([
  'UPLOAD_PENDING',
  'UPLOADED',
  'VALIDATING',
  'SCANNING',
]);

const blockedStatuses = new Set<DocumentStatus>(['REJECTED', 'INFECTED', 'FAILED']);

function notificationToneForStatus(status: DocumentStatus): NotificationTone {
  if (status === 'READY') return 'SUCCESS';
  if (blockedStatuses.has(status)) return 'DANGER';
  return 'INFO';
}

function notificationDescriptionForDocument(document: DocumentSummary): string {
  if (document.status === 'READY') {
    return 'Tài liệu đã sẵn sàng để xem và tải xuống.';
  }
  if (document.statusReason) return document.statusReason;
  if (blockedStatuses.has(document.status)) {
    return 'Tài liệu cần được kiểm tra lại trước khi sử dụng.';
  }
  return 'Hệ thống đang xử lý và sẽ tự động cập nhật trạng thái.';
}

function readSeenNotificationIds(): ReadonlySet<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const rawValue = window.localStorage.getItem(seenNotificationsStorageKey);
    const parsed = rawValue ? (JSON.parse(rawValue) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistSeenNotificationIds(ids: ReadonlySet<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(seenNotificationsStorageKey, JSON.stringify([...ids]));
  } catch {
    // Local notification state is non-critical.
  }
}

function readBookmarkedDocumentIds(): ReadonlySet<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(bookmarkedDocumentsStorageKey);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistBookmarkedDocumentIds(ids: ReadonlySet<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(bookmarkedDocumentsStorageKey, JSON.stringify([...ids]));
  } catch {
    // Bookmark state is local UI convenience only.
  }
}

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
  activeView = 'OVERVIEW',
  onViewChange,
  selectedDepartmentId,
  onDepartmentSelect,
  displayName,
  departmentId,
  departmentCounts = defaultDepartmentCounts,
  sharedCount = 0,
  storageUsedBytes = 0,
  storageQuotaBytes = 50 * 1024 ** 3,
  canManageSystem = false,
  onLogout,
}: {
  onNavigate?: () => void;
  activeView?: MainView;
  onViewChange?: (view: MainView) => void;
  selectedDepartmentId?: DepartmentId | null;
  onDepartmentSelect?: (departmentId: DepartmentId) => void;
  displayName: string;
  departmentId: string;
  departmentCounts?: Record<DepartmentId, number>;
  sharedCount?: number;
  storageUsedBytes?: number;
  storageQuotaBytes?: number;
  canManageSystem?: boolean;
  onLogout: () => void;
}) {
  const initials = toInitials(displayName);
  const storagePercent =
    storageQuotaBytes > 0 ? Math.min(100, Math.round((storageUsedBytes / storageQuotaBytes) * 100)) : 0;
  const storageSummary = `${formatStorageGb(storageUsedBytes)} / ${formatStorageGb(storageQuotaBytes, {
    minimumFractionDigits: 0,
  })} GB`;

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
          {navItems.map(({ label, icon: Icon, view }) => (
            <li key={label}>
              <button
                className={view === activeView ? 'nav-link is-active' : 'nav-link'}
                onClick={() => {
                  if (view) {
                    onViewChange?.(view);
                  }
                  onNavigate?.();
                }}
              >
                <Icon size={18} strokeWidth={1.7} />
                <span>{label}</span>
                {label === 'Được chia sẻ' && <span className="nav-count">{sharedCount}</span>}
              </button>
            </li>
          ))}
        </ul>
        {canManageSystem && (
          <>
            <p className="nav-eyebrow nav-eyebrow--admin">Hệ thống</p>
            <ul className="nav-list">
              <li>
                <button
                  className={activeView === 'ADMIN' ? 'nav-link is-active' : 'nav-link'}
                  onClick={() => {
                    onViewChange?.('ADMIN');
                    onNavigate?.();
                  }}
                >
                  <Settings size={18} strokeWidth={1.7} />
                  <span>Quản trị</span>
                </button>
              </li>
            </ul>
          </>
        )}
      </nav>

      <div className="cabinet-section">
        <p className="nav-eyebrow">Phòng ban</p>
        {departmentOptions.map((department) => (
          <button
            className={
              activeView === 'DEPARTMENT_DOCUMENTS' && selectedDepartmentId === department.id
                ? 'cabinet-row is-active'
                : 'cabinet-row'
            }
            key={department.id}
            onClick={() => {
              onDepartmentSelect?.(department.id);
              onNavigate?.();
            }}
          >
            <span className="cabinet-code">{department.id === 'TECH' ? 'TE' : department.id}</span>
            {department.label}
            <span>{departmentCounts[department.id]}</span>
          </button>
        ))}
      </div>

      <div className="storage-note">
        <div className="storage-note__heading">
          <span>Dung lượng</span>
          <strong>{storageSummary}</strong>
        </div>
        <div className="storage-bar" aria-label={`Đã dùng ${storagePercent} phần trăm dung lượng`}>
          <span style={{ width: `${storagePercent}%` }} />
        </div>
        <small>{storagePercent}% đã sử dụng</small>
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
  const [activeView, setActiveView] = useState<MainView>('OVERVIEW');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<DepartmentId | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatusFilter>('ALL');
  const [classificationFilter, setClassificationFilter] =
    useState<DocumentClassificationFilter>('ALL');
  const [accessScopeFilter, setAccessScopeFilter] = useState<DocumentAccessScopeFilter>('ALL');
  const [documentSort, setDocumentSort] = useState<DocumentSort>('UPDATED_DESC');
  const [pageSize, setPageSize] = useState<(typeof documentPageSizeOptions)[number]>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState('');
  const [adminQuery, setAdminQuery] = useState('');
  const [adminDepartmentFilter, setAdminDepartmentFilter] = useState<'ALL' | DepartmentId>('ALL');
  const [adminRoleFilter, setAdminRoleFilter] = useState<AdminRoleFilter>('ALL');
  const [adminStatusFilter, setAdminStatusFilter] = useState<AdminStatusFilter>('ALL');
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createUserForm, setCreateUserForm] =
    useState<CreateAdminUserForm>(defaultCreateAdminUserForm);
  const [createUserSubmitting, setCreateUserSubmitting] = useState(false);
  const [createUserError, setCreateUserError] = useState('');
  const [createUserMessage, setCreateUserMessage] = useState('');
  const [editUserForm, setEditUserForm] = useState<EditAdminUserForm | null>(null);
  const [editUserSubmitting, setEditUserSubmitting] = useState(false);
  const [editUserError, setEditUserError] = useState('');
  const [editUserMessage, setEditUserMessage] = useState('');
  const [adminAccountActionMessage, setAdminAccountActionMessage] = useState('');
  const [adminAccountActionError, setAdminAccountActionError] = useState('');
  const [adminAccountActionEmail, setAdminAccountActionEmail] = useState<string | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<AdminUserRow | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordSubmitting, setResetPasswordSubmitting] = useState(false);
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
  const [lastDocumentsUpdatedAt, setLastDocumentsUpdatedAt] = useState<string | null>(null);
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [seenNotificationIds, setSeenNotificationIds] =
    useState<ReadonlySet<string>>(readSeenNotificationIds);
  const [bookmarkedDocumentIds, setBookmarkedDocumentIds] =
    useState<ReadonlySet<string>>(readBookmarkedDocumentIds);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [openDocumentMenuId, setOpenDocumentMenuId] = useState<string | null>(null);
  const [shareDialogDocument, setShareDialogDocument] = useState<DocumentItem | null>(null);
  const [inlineShareDepartmentId, setInlineShareDepartmentId] = useState('');
  const [inlineShareSubmitting, setInlineShareSubmitting] = useState(false);
  const [inlineShareMessage, setInlineShareMessage] = useState('');
  const [inlineShareError, setInlineShareError] = useState('');
  const shareReviewPanelRef = useRef<HTMLElement | null>(null);
  const documentMenuRef = useRef<HTMLDivElement | null>(null);
  const shareDepartmentSelectRef = useRef<HTMLSelectElement | null>(null);

  // currentUser luôn có giá trị khi App được render (ProtectedRoute đảm bảo điều này)
  const displayName = currentUser?.displayName ?? '';
  const departmentId = currentUser?.departmentId ?? '';
  const canPublishToAllEmployees = currentUser?.roles.includes('SYSTEM_ADMIN') ?? false;
  const canManageSystem = currentUser?.roles.includes('SYSTEM_ADMIN') ?? false;
  const canReviewShareRequests =
    currentUser?.roles.some((role) => role === 'DEPARTMENT_ADMIN' || role === 'SYSTEM_ADMIN') ??
    false;
  const initials = toInitials(displayName);
  const isOverviewView = activeView === 'OVERVIEW';
  const isSharedView = activeView === 'SHARED_DOCUMENTS';
  const isRecentView = activeView === 'RECENT_DOCUMENTS';
  const isBookmarkedView = activeView === 'BOOKMARKED_DOCUMENTS';
  const isDepartmentView = activeView === 'DEPARTMENT_DOCUMENTS';
  const isAdminView = activeView === 'ADMIN';
  const selectedDepartmentLabel =
    departmentOptions.find((department) => department.id === selectedDepartmentId)?.label ??
    'phòng ban';
  const documentViewContext = isSharedView
    ? 'Đang xem tài liệu được chia sẻ với bạn'
    : isRecentView
      ? 'Đang xem tài liệu cập nhật gần đây'
      : isBookmarkedView
        ? 'Đang xem tài liệu đã đánh dấu'
        : isDepartmentView
          ? `Đang xem tài liệu phòng ${selectedDepartmentLabel}`
          : 'Đang xem tất cả tài liệu';
  const pageKicker = isOverviewView
    ? 'Thứ sáu · 19 tháng 6'
    : isAdminView
      ? 'Quản trị'
      : 'Kho tài liệu';
  const pageTitle = isOverviewView
    ? 'Tài liệu cần bạn chú ý'
    : isSharedView
      ? 'Được chia sẻ với tôi'
      : isRecentView
        ? 'Gần đây'
        : isBookmarkedView
          ? 'Đã đánh dấu'
          : isAdminView
            ? 'Quản trị hệ thống'
          : isDepartmentView
            ? `Tài liệu phòng ${selectedDepartmentLabel}`
          : 'Tất cả tài liệu';
  const pageDescription = isOverviewView
    ? 'Phiên bản, quyền truy cập và trạng thái kiểm tra được tập trung tại một nơi.'
    : isSharedView
      ? 'Các tài liệu bạn có quyền xem nhờ phạm vi chia sẻ.'
      : isRecentView
        ? 'Các tài liệu vừa được cập nhật, kiểm tra hoặc xử lý gần đây.'
        : isBookmarkedView
          ? 'Các tài liệu bạn đã lưu lại để truy cập nhanh.'
          : isAdminView
            ? 'Theo dõi người dùng, phòng ban và vai trò từ AWS Cognito.'
          : isDepartmentView
            ? `Danh sách tài liệu thuộc phòng ${selectedDepartmentLabel}.`
          : 'Danh sách tài liệu thật với bộ lọc, sắp xếp và phân trang tập trung.';
  const viewDocumentSummaries = useMemo(
    () =>
      isSharedView
        ? documentSummaries.filter((document) => isSharedDocument(document, departmentId))
        : isBookmarkedView
          ? documentSummaries.filter((document) => bookmarkedDocumentIds.has(document.documentId))
        : isDepartmentView && selectedDepartmentId
          ? documentSummaries.filter((document) => document.departmentId === selectedDepartmentId)
        : documentSummaries,
    [
      bookmarkedDocumentIds,
      departmentId,
      documentSummaries,
      isBookmarkedView,
      isDepartmentView,
      isSharedView,
      selectedDepartmentId,
    ],
  );
  const documents = useMemo(() => viewDocumentSummaries.map(toDocumentItem), [viewDocumentSummaries]);
  const processingCount = documentSummaries.filter((document) =>
    hasProcessingDocuments([document]),
  ).length;
  const departmentCounts = useMemo(
    () =>
      departmentOptions.reduce(
        (counts, department) => ({
          ...counts,
          [department.id]: documentSummaries.filter(
            (document) => document.departmentId === department.id,
          ).length,
        }),
        { HR: 0, TECH: 0, SA: 0 } as Record<DepartmentId, number>,
      ),
    [documentSummaries],
  );
  const sharedDocumentCount = documentSummaries.filter((document) =>
    isSharedDocument(document, departmentId),
  ).length;
  const filteredAdminUsers = useMemo(() => {
    const normalized = adminQuery.trim().toLocaleLowerCase('vi');
    return adminUsers.filter(
      (user) =>
        (!normalized ||
          [user.name, user.email, user.departmentId, ...user.roles.map((role) => adminRoleLabels[role])]
            .join(' ')
            .toLocaleLowerCase('vi')
            .includes(normalized)) &&
        (adminDepartmentFilter === 'ALL' || user.departmentId === adminDepartmentFilter) &&
        (adminRoleFilter === 'ALL' || user.roles.includes(adminRoleFilter)) &&
        (adminStatusFilter === 'ALL' ||
          (adminStatusFilter === 'ACTIVE' ? user.enabled : !user.enabled)),
    );
  }, [adminDepartmentFilter, adminQuery, adminRoleFilter, adminStatusFilter, adminUsers]);
  const adminStats = useMemo(
    () => ({
      total: adminUsers.length,
      systemAdmins: adminUsers.filter((user) => user.roles.includes('SYSTEM_ADMIN')).length,
      departmentAdmins: adminUsers.filter((user) => user.roles.includes('DEPARTMENT_ADMIN')).length,
      employees: adminUsers.filter((user) => user.roles.includes('EMPLOYEE')).length,
      active: adminUsers.filter((user) => user.enabled).length,
      locked: adminUsers.filter((user) => !user.enabled).length,
    }),
    [adminUsers],
  );
  const storageUsedBytes = documentSummaries.reduce(
    (total, document) => total + document.sizeBytes,
    0,
  );
  const dashboardActivities = useMemo<DashboardActivity[]>(
    () =>
      [...documentSummaries]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 4)
        .map((document) => ({
          time: formatActivityTime(document.updatedAt),
          action: activityActionForStatus(document.status),
          target: document.title,
        })),
    [documentSummaries],
  );
  const filteredShareRequests = useMemo(() => {
    if (shareRequestFilter === 'ALL') return shareRequests;
    return shareRequests.filter((request) => request.classification === shareRequestFilter);
  }, [shareRequestFilter, shareRequests]);

  const refreshDocuments = useCallback(async (showLoading = false): Promise<void> => {
    if (showLoading) setDocumentsLoading(true);
    try {
      const items = await listDocuments();
      setDocumentSummaries(items);
      setLastDocumentsUpdatedAt(new Date().toISOString());
      setDocumentsError('');
    } catch {
      setDocumentsError('Không thể cập nhật danh sách tài liệu. Vui lòng thử lại.');
    } finally {
      if (showLoading) setDocumentsLoading(false);
    }
  }, []);

  const refreshAdminUsers = useCallback(async (): Promise<void> => {
    if (!canManageSystem) {
      setAdminUsers([]);
      setAdminUsersError('');
      return;
    }

    setAdminUsersLoading(true);
    try {
      const items = await listAdminUsers();
      setAdminUsers(items.map(toAdminUserRow));
      setAdminUsersError('');
    } catch {
      setAdminUsersError('Không thể tải danh sách người dùng từ Cognito. Vui lòng thử lại.');
    } finally {
      setAdminUsersLoading(false);
    }
  }, [canManageSystem]);

  const closeCreateUserModal = useCallback(() => {
    if (createUserSubmitting) return;
    setCreateUserOpen(false);
    setCreateUserForm(defaultCreateAdminUserForm);
    setCreateUserError('');
  }, [createUserSubmitting]);

  const submitCreateUser = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (!canManageSystem) return;

      setCreateUserSubmitting(true);
      setCreateUserError('');
      setCreateUserMessage('');
      try {
        const created = await createAdminUser({
          email: createUserForm.email,
          name: createUserForm.name,
          departmentId: createUserForm.departmentId,
          role: createUserForm.role,
          password: createUserForm.password,
        });
        setCreateUserMessage(`Đã tạo người dùng ${created.email}.`);
        setCreateUserOpen(false);
        setCreateUserForm(defaultCreateAdminUserForm);
        await refreshAdminUsers();
      } catch (err) {
        setCreateUserError(
          err instanceof Error ? err.message : 'Không thể tạo người dùng. Vui lòng thử lại.',
        );
      } finally {
        setCreateUserSubmitting(false);
      }
    },
    [canManageSystem, createUserForm, refreshAdminUsers],
  );

  const openEditUserModal = useCallback((user: AdminUserRow) => {
    setEditUserForm({
      email: user.email,
      name: user.name,
      departmentId: departmentOptions.some((department) => department.id === user.departmentId)
        ? (user.departmentId as DepartmentId)
        : 'TECH',
      role: primaryAdminRole(user),
    });
    setEditUserError('');
    setEditUserMessage('');
  }, []);

  const closeEditUserModal = useCallback(() => {
    if (editUserSubmitting) return;
    setEditUserForm(null);
    setEditUserError('');
  }, [editUserSubmitting]);

  const submitEditUser = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (!canManageSystem || !editUserForm) return;

      setEditUserSubmitting(true);
      setEditUserError('');
      setEditUserMessage('');
      try {
        const updated = await updateAdminUser({
          email: editUserForm.email,
          departmentId: editUserForm.departmentId,
          role: editUserForm.role,
        });
        setEditUserMessage(`Đã cập nhật người dùng ${updated.email}.`);
        setEditUserForm(null);
        await refreshAdminUsers();
      } catch (err) {
        setEditUserError(
          err instanceof Error ? err.message : 'Không thể cập nhật người dùng. Vui lòng thử lại.',
        );
      } finally {
        setEditUserSubmitting(false);
      }
    },
    [canManageSystem, editUserForm, refreshAdminUsers],
  );

  const runAccountStatusAction = useCallback(
    async (user: AdminUserRow): Promise<void> => {
      if (!canManageSystem) return;
      const action = user.enabled ? 'DISABLE' : 'ENABLE';
      setAdminAccountActionEmail(user.email);
      setAdminAccountActionError('');
      setAdminAccountActionMessage('');
      try {
        const updated = await runAdminUserAction({ email: user.email, action });
        setAdminAccountActionMessage(
          action === 'DISABLE'
            ? `Đã khóa tài khoản ${updated.email}.`
            : `Đã mở khóa tài khoản ${updated.email}.`,
        );
        await refreshAdminUsers();
      } catch (err) {
        setAdminAccountActionError(
          err instanceof Error
            ? err.message
            : 'Không thể thực hiện thao tác tài khoản. Vui lòng thử lại.',
        );
      } finally {
        setAdminAccountActionEmail(null);
      }
    },
    [canManageSystem, refreshAdminUsers],
  );

  const closeResetPasswordModal = useCallback(() => {
    if (resetPasswordSubmitting) return;
    setResetPasswordUser(null);
    setResetPasswordValue('');
    setAdminAccountActionError('');
  }, [resetPasswordSubmitting]);

  const submitResetPassword = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (!canManageSystem || !resetPasswordUser) return;

      setResetPasswordSubmitting(true);
      setAdminAccountActionError('');
      setAdminAccountActionMessage('');
      try {
        const updated = await runAdminUserAction({
          email: resetPasswordUser.email,
          action: 'RESET_PASSWORD',
          password: resetPasswordValue,
        });
        setAdminAccountActionMessage(`Đã reset mật khẩu cho ${updated.email}.`);
        setResetPasswordUser(null);
        setResetPasswordValue('');
        await refreshAdminUsers();
      } catch (err) {
        setAdminAccountActionError(
          err instanceof Error ? err.message : 'Không thể reset mật khẩu. Vui lòng thử lại.',
        );
      } finally {
        setResetPasswordSubmitting(false);
      }
    },
    [canManageSystem, refreshAdminUsers, resetPasswordUser, resetPasswordValue],
  );

  useEffect(() => {
    void refreshDocuments(true);
  }, [refreshDocuments]);

  useEffect(() => {
    if (isAdminView && canManageSystem) {
      void refreshAdminUsers();
    }
  }, [canManageSystem, isAdminView, refreshAdminUsers]);

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

  useEffect(() => {
    if (!canManageSystem && activeView === 'ADMIN') {
      setActiveView('OVERVIEW');
    }
  }, [activeView, canManageSystem]);

  useEffect(() => {
    if (activeView === 'RECENT_DOCUMENTS' && documentSort !== 'UPDATED_DESC') {
      setDocumentSort('UPDATED_DESC');
    }
  }, [activeView, documentSort]);

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi');
    return documents.filter((document) =>
      (!normalized ||
        [
          document.title,
          document.department,
          document.owner,
          document.type,
          document.classification,
          accessScopeLabels[document.accessScope],
          statusLabels[document.status],
          document.statusReason ?? '',
        ]
          .join(' ')
          .toLocaleLowerCase('vi')
          .includes(normalized)) &&
      (statusFilter === 'ALL' ||
        (statusFilter === 'PROCESSING' && processingStatuses.has(document.status)) ||
        (statusFilter === 'READY' && document.status === 'READY') ||
        (statusFilter === 'BLOCKED' && blockedStatuses.has(document.status))) &&
      (classificationFilter === 'ALL' ||
        classificationLabels[classificationFilter] === document.classification) &&
      (accessScopeFilter === 'ALL' || accessScopeFilter === document.accessScope),
    );
  }, [accessScopeFilter, classificationFilter, documents, query, statusFilter]);

  const sortedDocuments = useMemo(() => {
    return [...filteredDocuments].sort((left, right) => {
      if (documentSort === 'TITLE_ASC' || documentSort === 'TITLE_DESC') {
        const comparison = left.title.localeCompare(right.title, 'vi', { sensitivity: 'base' });
        return documentSort === 'TITLE_ASC' ? comparison : -comparison;
      }

      const leftTime = new Date(left.updatedAt).getTime();
      const rightTime = new Date(right.updatedAt).getTime();
      const normalizedLeftTime = Number.isNaN(leftTime) ? 0 : leftTime;
      const normalizedRightTime = Number.isNaN(rightTime) ? 0 : rightTime;
      const comparison = normalizedLeftTime - normalizedRightTime;
      return documentSort === 'UPDATED_ASC' ? comparison : -comparison;
    });
  }, [documentSort, filteredDocuments]);

  const totalPages = Math.max(1, Math.ceil(sortedDocuments.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = sortedDocuments.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize;
  const pageEndIndex = Math.min(pageStartIndex + pageSize, sortedDocuments.length);
  const paginatedDocuments = sortedDocuments.slice(pageStartIndex, pageEndIndex);
  const selectedDocuments = sortedDocuments.filter((document) =>
    selectedDocumentIds.has(document.id),
  );
  const selectedReadyDocument =
    selectedDocuments.length === 1 && selectedDocuments[0]?.status === 'READY'
      ? selectedDocuments[0]
      : null;
  const currentPageDocumentIds = paginatedDocuments.map((document) => document.id);
  const currentPageSelectableCount = currentPageDocumentIds.length;
  const currentPageSelectedCount = currentPageDocumentIds.filter((documentId) =>
    selectedDocumentIds.has(documentId),
  ).length;
  const currentPageSelectionState =
    currentPageSelectableCount > 0 && currentPageSelectedCount === currentPageSelectableCount
      ? true
      : currentPageSelectedCount > 0
        ? 'mixed'
        : false;
  const notifications = useMemo<AppNotification[]>(() => {
    const shareNotifications: AppNotification[] = canReviewShareRequests
      ? shareRequests.slice(0, 5).map((request) => ({
          id: `share-${request.shareRequestId}`,
          title: 'Yêu cầu chia sẻ chờ duyệt',
          description: `${request.title} từ ${request.sourceDepartmentId} đến ${request.targetDepartmentId}`,
          meta: formatUpdatedAt(request.createdAt),
          tone: 'WARNING',
          target: { type: 'SHARE_REVIEW' },
        }))
      : [];

    const documentNotifications: AppNotification[] = [...documentSummaries]
      .filter(
        (document) =>
          document.status === 'READY' ||
          processingStatuses.has(document.status) ||
          blockedStatuses.has(document.status),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 8)
      .map((document) => ({
        id: `document-${document.documentId}-${document.status}`,
        title:
          document.status === 'READY'
            ? 'Tài liệu đã sẵn sàng'
            : blockedStatuses.has(document.status)
              ? 'Tài liệu cần chú ý'
              : 'Tài liệu đang được xử lý',
        description: `${document.title} · ${notificationDescriptionForDocument(document)}`,
        meta: statusLabels[document.status],
        tone: notificationToneForStatus(document.status),
        target: { type: 'DOCUMENT', documentId: document.documentId },
      }));

    return [...shareNotifications, ...documentNotifications].slice(0, 10);
  }, [canReviewShareRequests, documentSummaries, shareRequests]);
  const unseenNotificationCount = notifications.filter(
    (notification) => !seenNotificationIds.has(notification.id),
  ).length;

  useEffect(() => {
    if (documentsLoading || notifications.length === 0) return;
    const activeIds = new Set(notifications.map((notification) => notification.id));
    setSeenNotificationIds((current) => {
      const next = new Set([...current].filter((id) => activeIds.has(id)));
      if (next.size === current.size) return current;
      persistSeenNotificationIds(next);
      return next;
    });
  }, [documentsLoading, notifications]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    accessScopeFilter,
    activeView,
    classificationFilter,
    documentSort,
    pageSize,
    query,
    selectedDepartmentId,
    statusFilter,
  ]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    const visibleIds = new Set(sortedDocuments.map((document) => document.id));
    setSelectedDocumentIds((current) => {
      const next = new Set([...current].filter((documentId) => visibleIds.has(documentId)));
      return next.size === current.size ? current : next;
    });
    setOpenDocumentMenuId((current) => (current && visibleIds.has(current) ? current : null));
    setShareDialogDocument((current) => (current && visibleIds.has(current.id) ? current : null));
  }, [sortedDocuments]);

  useEffect(() => {
    if (!openDocumentMenuId) return;

    function handleOutsideMouseDown(event: MouseEvent): void {
      const target = event.target;
      if (target instanceof Node && documentMenuRef.current?.contains(target)) return;
      setOpenDocumentMenuId(null);
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpenDocumentMenuId(null);
      }
    }

    document.addEventListener('mousedown', handleOutsideMouseDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideMouseDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openDocumentMenuId]);

  useEffect(() => {
    if (!shareDialogDocument) return;

    const focusTimer = window.setTimeout(() => shareDepartmentSelectRef.current?.focus(), 0);

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !inlineShareSubmitting) {
        closeInlineShare();
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [inlineShareSubmitting, shareDialogDocument]);

  const filtersActive =
    query.trim().length > 0 ||
    statusFilter !== 'ALL' ||
    classificationFilter !== 'ALL' ||
    accessScopeFilter !== 'ALL';
  const emptyStateTitle =
    documents.length > 0
      ? 'Không tìm thấy tài liệu phù hợp'
      : isSharedView
        ? 'Chưa có tài liệu được chia sẻ'
        : isRecentView
          ? 'Chưa có hoạt động gần đây'
          : isBookmarkedView
            ? 'Chưa có tài liệu đánh dấu'
            : isDepartmentView
              ? `Chưa có tài liệu phòng ${selectedDepartmentLabel}`
              : 'Chưa có tài liệu';
  const emptyStateDescription =
    documents.length > 0
      ? 'Thử xóa bớt bộ lọc hoặc tìm theo tên, phòng ban và người cập nhật.'
      : isSharedView
        ? 'Khi có tài liệu toàn bộ nhân viên hoặc tài liệu phòng ban khác được chia sẻ, chúng sẽ xuất hiện tại đây.'
        : isRecentView
          ? 'Khi tài liệu được tải lên, kiểm tra hoặc cập nhật, chúng sẽ xuất hiện tại đây.'
          : isBookmarkedView
            ? 'Bấm biểu tượng ngôi sao trên tài liệu để lưu vào danh sách này.'
            : isDepartmentView
              ? `Tài liệu thuộc phòng ${selectedDepartmentLabel} sẽ xuất hiện tại đây.`
              : 'Tài liệu tải lên sẽ xuất hiện tại đây.';

  function resetDocumentFilters(): void {
    setQuery('');
    setStatusFilter('ALL');
    setClassificationFilter('ALL');
    setAccessScopeFilter('ALL');
  }

  function handleNotificationClick(notification: AppNotification): void {
    const nextSeenNotificationIds = new Set(seenNotificationIds);
    nextSeenNotificationIds.add(notification.id);
    persistSeenNotificationIds(nextSeenNotificationIds);

    flushSync(() => {
      setSeenNotificationIds(nextSeenNotificationIds);
      setNotificationsOpen(false);
    });

    if (notification.target.type === 'DOCUMENT') {
      navigate(`/documents/${notification.target.documentId}`);
      return;
    }
    shareReviewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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

  function toggleDocumentBookmark(documentId: string): void {
    setBookmarkedDocumentIds((current) => {
      const next = new Set(current);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      persistBookmarkedDocumentIds(next);
      return next;
    });
  }

  function toggleDocumentSelection(documentId: string): void {
    setSelectedDocumentIds((current) => {
      const next = new Set(current);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });
  }

  function toggleCurrentPageSelection(): void {
    setSelectedDocumentIds((current) => {
      const next = new Set(current);
      const shouldSelectPage =
        currentPageDocumentIds.length > 0 &&
        currentPageDocumentIds.some((documentId) => !next.has(documentId));
      for (const documentId of currentPageDocumentIds) {
        if (shouldSelectPage) {
          next.add(documentId);
        } else {
          next.delete(documentId);
        }
      }
      return next;
    });
  }

  function clearDocumentSelection(): void {
    setSelectedDocumentIds(new Set());
  }

  function toggleDocumentMenu(documentId: string): void {
    setOpenDocumentMenuId((current) => (current === documentId ? null : documentId));
  }

  function closeDocumentMenu(): void {
    setOpenDocumentMenuId(null);
  }

  function navigateToDocument(documentId: string, hash = ''): void {
    closeDocumentMenu();
    navigate(`/documents/${documentId}${hash}`);
  }

  function openInlineShare(document: DocumentItem): void {
    closeDocumentMenu();
    setShareDialogDocument(document);
    setInlineShareDepartmentId('');
    setInlineShareMessage('');
    setInlineShareError('');
  }

  function closeInlineShare(): void {
    setShareDialogDocument(null);
    setInlineShareDepartmentId('');
    setInlineShareMessage('');
    setInlineShareError('');
  }

  async function handleInlineShareSubmit(
    event: FormEvent<HTMLFormElement>,
    document: DocumentItem,
  ): Promise<void> {
    event.preventDefault();
    if (!inlineShareDepartmentId) {
      setInlineShareError('Vui lòng chọn phòng ban nhận.');
      return;
    }

    setInlineShareSubmitting(true);
    setInlineShareMessage('');
    setInlineShareError('');
    try {
      const result = await createDepartmentShare(document.id, inlineShareDepartmentId);
      setInlineShareDepartmentId('');
      setInlineShareMessage(
        result.mode === 'PENDING_APPROVAL'
          ? 'Đã gửi yêu cầu chia sẻ, đang chờ quản trị phòng ban duyệt.'
          : 'Đã chia sẻ tài liệu cho phòng ban đã chọn.',
      );
    } catch (err) {
      setInlineShareError(
        err instanceof Error ? err.message : 'Không thể chia sẻ tài liệu. Vui lòng thử lại.',
      );
    } finally {
      setInlineShareSubmitting(false);
    }
  }

  function handleViewChange(view: MainView): void {
    setActiveView(view);
    if (view !== 'DEPARTMENT_DOCUMENTS') {
      setSelectedDepartmentId(null);
    }
  }

  function handleDepartmentSelect(nextDepartmentId: DepartmentId): void {
    setSelectedDepartmentId(nextDepartmentId);
    setActiveView('DEPARTMENT_DOCUMENTS');
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
        <NavContent
          activeView={activeView}
          onViewChange={handleViewChange}
          selectedDepartmentId={selectedDepartmentId}
          onDepartmentSelect={handleDepartmentSelect}
          displayName={displayName}
          departmentId={departmentId}
          departmentCounts={departmentCounts}
          sharedCount={sharedDocumentCount}
          storageUsedBytes={storageUsedBytes}
          storageQuotaBytes={storageQuotaBytes}
          canManageSystem={canManageSystem}
          onLogout={logout}
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
              activeView={activeView}
              onViewChange={handleViewChange}
              selectedDepartmentId={selectedDepartmentId}
              onDepartmentSelect={handleDepartmentSelect}
              displayName={displayName}
              departmentId={departmentId}
              departmentCounts={departmentCounts}
              sharedCount={sharedDocumentCount}
              storageUsedBytes={storageUsedBytes}
              storageQuotaBytes={storageQuotaBytes}
              canManageSystem={canManageSystem}
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
          <div className="notification-menu">
            <button
              className="icon-button notification-button"
              aria-label={`Thông báo${unseenNotificationCount > 0 ? ` (${unseenNotificationCount})` : ''}`}
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell size={19} />
              {unseenNotificationCount > 0 && (
                <span className="notification-badge">{unseenNotificationCount}</span>
              )}
            </button>
            {notificationsOpen && (
              <div className="notification-panel" role="dialog" aria-label="Thông báo">
                <div className="notification-panel-heading">
                  <div>
                    <p className="section-kicker">Trung tâm</p>
                    <h2>Thông báo</h2>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Đóng thông báo"
                    onClick={() => setNotificationsOpen(false)}
                  >
                    <X size={17} />
                  </button>
                </div>

                {notifications.length === 0 ? (
                  <div className="notification-empty">
                    <ShieldCheck size={22} />
                    <strong>Không có việc cần chú ý</strong>
                    <p>Các tài liệu và yêu cầu chia sẻ hiện ổn định.</p>
                  </div>
                ) : (
                  <ul className="notification-list">
                    {notifications.map((notification) => (
                      <li key={notification.id}>
                        <button
                          className={`notification-item notification-item--${notification.tone.toLowerCase()}${
                            seenNotificationIds.has(notification.id) ? ' is-seen' : ''
                          }`}
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <span>
                            <strong>{notification.title}</strong>
                            <small>{notification.description}</small>
                          </span>
                          <em>{notification.meta}</em>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button className="account-button" onClick={logout} title="Đăng xuất">
            <CircleUserRound size={20} />
            <span>{displayName || initials}</span>
            <ChevronDown size={15} />
          </button>
        </header>

        <section className="workspace" aria-labelledby="page-title">
          <div className="page-heading">
            <div>
              <p className="section-kicker">{pageKicker}</p>
              <h1 id="page-title">{pageTitle}</h1>
              <p>{pageDescription}</p>
            </div>
            {!isAdminView && (
              <button
                className="primary-action"
                onClick={() => {
                  handleViewChange('OVERVIEW');
                  setUploadOpen((open) => !open);
                }}
              >
                <FilePlus2 size={18} />
                Tải tài liệu lên
              </button>
            )}
          </div>

          {isOverviewView && uploadOpen && (
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

          {isAdminView && canManageSystem && (
            <section className="admin-panel" aria-labelledby="admin-heading">
              <div className="admin-toolbar">
                <div>
                  <p className="section-kicker">Tổng quan tài khoản</p>
                  <h2 id="admin-heading">Người dùng nội bộ</h2>
                </div>
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => {
                    setCreateUserOpen(true);
                    setCreateUserMessage('');
                    setCreateUserError('');
                  }}
                >
                  <FilePlus2 size={18} />
                  Tạo người dùng
                </button>
                <button
                  className="quiet-button"
                  type="button"
                  disabled={adminUsersLoading}
                  onClick={() => void refreshAdminUsers()}
                >
                  <RefreshCw size={16} />
                  {adminUsersLoading ? 'Đang làm mới' : 'Làm mới'}
                </button>
              </div>

              <div className="admin-summary-grid">
                <div className="admin-summary-card">
                  <span>Tổng người dùng</span>
                  <strong>{adminStats.total}</strong>
                </div>
                <div className="admin-summary-card">
                  <span>System Admin</span>
                  <strong>{adminStats.systemAdmins}</strong>
                </div>
                <div className="admin-summary-card">
                  <span>Department Admin</span>
                  <strong>{adminStats.departmentAdmins}</strong>
                </div>
                <div className="admin-summary-card">
                  <span>Nhân viên</span>
                  <strong>{adminStats.employees}</strong>
                </div>
                <div className="admin-summary-card admin-summary-card--status">
                  <span>Đang hoạt động</span>
                  <strong>{adminStats.active}</strong>
                </div>
                <div className="admin-summary-card admin-summary-card--locked">
                  <span>Đã khóa</span>
                  <strong>{adminStats.locked}</strong>
                </div>
              </div>

              <div className="admin-placeholder-note">
                <ShieldCheck size={17} />
                <span>
                  Dữ liệu người dùng được đọc trực tiếp từ AWS Cognito. Đổi vai trò, khóa/mở khóa
                  và reset mật khẩu được xử lý qua API quản trị.
                </span>
              </div>
              {createUserMessage && (
                <p className="admin-feedback admin-feedback--success">{createUserMessage}</p>
              )}
              {editUserMessage && (
                <p className="admin-feedback admin-feedback--success">{editUserMessage}</p>
              )}
              {adminAccountActionMessage && (
                <p className="admin-feedback admin-feedback--success">
                  {adminAccountActionMessage}
                </p>
              )}
              {adminAccountActionError && (
                <p className="document-load-error" role="alert">
                  {adminAccountActionError}
                </p>
              )}
              {adminUsersError && (
                <p className="document-load-error" role="alert">
                  {adminUsersError}
                </p>
              )}
              {adminUsersLoading && (
                <p className="document-view-context" role="status">
                  Đang tải danh sách người dùng từ Cognito...
                </p>
              )}

              <div className="admin-filters" aria-label="Bộ lọc người dùng">
                <label>
                  <span>Tìm kiếm</span>
                  <input
                    value={adminQuery}
                    onChange={(event) => setAdminQuery(event.target.value)}
                    placeholder="Tên hoặc email"
                  />
                </label>
                <label>
                  <span>Phòng ban</span>
                  <select
                    value={adminDepartmentFilter}
                    onChange={(event) =>
                      setAdminDepartmentFilter(event.target.value as 'ALL' | DepartmentId)
                    }
                  >
                    <option value="ALL">Tất cả phòng ban</option>
                    {departmentOptions.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Vai trò</span>
                  <select
                    value={adminRoleFilter}
                    onChange={(event) => setAdminRoleFilter(event.target.value as AdminRoleFilter)}
                  >
                    {adminRoleFilters.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Trạng thái</span>
                  <select
                    value={adminStatusFilter}
                    onChange={(event) =>
                      setAdminStatusFilter(event.target.value as AdminStatusFilter)
                    }
                  >
                    {adminStatusFilters.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="admin-user-table" role="table" aria-label="Danh sách người dùng">
                <div className="admin-user-row admin-user-row--header" role="row">
                  <span role="columnheader">Người dùng</span>
                  <span role="columnheader">Phòng ban</span>
                  <span role="columnheader">Vai trò</span>
                  <span role="columnheader">Trạng thái</span>
                  <span role="columnheader">Thao tác</span>
                </div>
                {filteredAdminUsers.map((user) => (
                  <div className="admin-user-row" role="row" key={user.id}>
                    <div className="admin-user-identity" role="cell">
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                      <small>Cập nhật {formatUpdatedAt(user.updatedAt)}</small>
                    </div>
                    <span role="cell">{departmentLabelFor(user.departmentId)}</span>
                    <div className="admin-role-list" role="cell">
                      {user.roles.map((role) => (
                        <span className="admin-role-badge" key={role}>
                          {adminRoleLabels[role]}
                        </span>
                      ))}
                    </div>
                    <span
                      className={`admin-status admin-status--${user.enabled ? 'active' : 'locked'}`}
                      role="cell"
                      title={user.status}
                    >
                      {user.enabled ? 'Đang hoạt động' : 'Đã khóa'}
                    </span>
                    <div className="admin-actions" role="cell">
                      <button
                        className="quiet-button"
                        type="button"
                        onClick={() => openEditUserModal(user)}
                      >
                        Đổi vai trò
                      </button>
                      <button
                        className="quiet-button quiet-button--danger"
                        type="button"
                        disabled={
                          adminAccountActionEmail === user.email ||
                          user.email === currentUser?.email
                        }
                        title={
                          user.email === currentUser?.email
                            ? 'Không thể tự khóa tài khoản đang đăng nhập'
                            : user.enabled
                              ? 'Khóa tài khoản'
                              : 'Mở khóa tài khoản'
                        }
                        onClick={() => void runAccountStatusAction(user)}
                      >
                        {adminAccountActionEmail === user.email
                          ? 'Đang xử lý'
                          : user.enabled
                            ? 'Khóa tài khoản'
                            : 'Mở khóa'}
                      </button>
                      <button
                        className="quiet-button"
                        type="button"
                        onClick={() => {
                          setResetPasswordUser(user);
                          setResetPasswordValue('');
                          setAdminAccountActionError('');
                          setAdminAccountActionMessage('');
                        }}
                      >
                        Reset mật khẩu
                      </button>
                    </div>
                  </div>
                ))}
                {!adminUsersLoading && filteredAdminUsers.length === 0 && (
                  <div className="empty-state">
                    <Users size={28} />
                    <h3>Không tìm thấy người dùng</h3>
                    <p>Thử đổi từ khóa, phòng ban hoặc vai trò.</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {createUserOpen && canManageSystem && (
            <div className="share-modal-backdrop" role="presentation">
              <form
                className="share-modal admin-create-user-modal"
                aria-labelledby="create-user-heading"
                onSubmit={(event) => void submitCreateUser(event)}
              >
                <button
                  className="icon-button share-modal-close"
                  type="button"
                  onClick={closeCreateUserModal}
                  disabled={createUserSubmitting}
                  aria-label="Đóng tạo người dùng"
                  title="Đóng"
                >
                  <X size={18} />
                </button>
                <div className="share-modal-heading">
                  <span>Quản trị Cognito</span>
                  <h2 id="create-user-heading">Tạo người dùng</h2>
                </div>
                <div className="admin-create-user-grid">
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={createUserForm.email}
                      onChange={(event) =>
                        setCreateUserForm((form) => ({ ...form, email: event.target.value }))
                      }
                      disabled={createUserSubmitting}
                      required
                    />
                  </label>
                  <label>
                    <span>Tên hiển thị</span>
                    <input
                      value={createUserForm.name}
                      onChange={(event) =>
                        setCreateUserForm((form) => ({ ...form, name: event.target.value }))
                      }
                      disabled={createUserSubmitting}
                      required
                    />
                  </label>
                  <label>
                    <span>Phòng ban</span>
                    <select
                      value={createUserForm.departmentId}
                      onChange={(event) =>
                        setCreateUserForm((form) => ({
                          ...form,
                          departmentId: event.target.value as DepartmentId,
                        }))
                      }
                      disabled={createUserSubmitting}
                    >
                      {departmentOptions.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Vai trò</span>
                    <select
                      value={createUserForm.role}
                      onChange={(event) =>
                        setCreateUserForm((form) => ({
                          ...form,
                          role: event.target.value as AdminRole,
                        }))
                      }
                      disabled={createUserSubmitting}
                    >
                      {adminRoleFilters
                        .filter((role) => role.value !== 'ALL')
                        .map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="admin-create-user-password">
                    <span>Mật khẩu</span>
                    <input
                      type="password"
                      value={createUserForm.password}
                      onChange={(event) =>
                        setCreateUserForm((form) => ({ ...form, password: event.target.value }))
                      }
                      disabled={createUserSubmitting}
                      minLength={8}
                      required
                    />
                  </label>
                </div>
                {createUserError && (
                  <p className="upload-status upload-status--error" role="alert">
                    {createUserError}
                  </p>
                )}
                <div className="share-modal-actions">
                  <button
                    className="primary-action"
                    type="submit"
                    disabled={createUserSubmitting}
                  >
                    <FilePlus2 size={18} />
                    {createUserSubmitting ? 'Đang tạo...' : 'Tạo người dùng'}
                  </button>
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={closeCreateUserModal}
                    disabled={createUserSubmitting}
                  >
                    Hủy
                  </button>
                </div>
              </form>
            </div>
          )}

          {editUserForm && canManageSystem && (
            <div className="share-modal-backdrop" role="presentation">
              <form
                className="share-modal admin-create-user-modal"
                aria-labelledby="edit-user-heading"
                onSubmit={(event) => void submitEditUser(event)}
              >
                <button
                  className="icon-button share-modal-close"
                  type="button"
                  onClick={closeEditUserModal}
                  disabled={editUserSubmitting}
                  aria-label="Đóng đổi vai trò"
                  title="Đóng"
                >
                  <X size={18} />
                </button>
                <div className="share-modal-heading">
                  <span>Quản trị Cognito</span>
                  <h2 id="edit-user-heading">Đổi vai trò</h2>
                </div>
                <div className="admin-create-user-grid">
                  <label>
                    <span>Người dùng</span>
                    <input value={`${editUserForm.name} · ${editUserForm.email}`} disabled />
                  </label>
                  <label>
                    <span>Phòng ban</span>
                    <select
                      value={editUserForm.departmentId}
                      onChange={(event) =>
                        setEditUserForm((form) =>
                          form
                            ? { ...form, departmentId: event.target.value as DepartmentId }
                            : form,
                        )
                      }
                      disabled={editUserSubmitting}
                    >
                      {departmentOptions.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-create-user-password">
                    <span>Vai trò</span>
                    <select
                      value={editUserForm.role}
                      onChange={(event) =>
                        setEditUserForm((form) =>
                          form ? { ...form, role: event.target.value as AdminRole } : form,
                        )
                      }
                      disabled={editUserSubmitting}
                    >
                      {adminRoleFilters
                        .filter((role) => role.value !== 'ALL')
                        .map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                {editUserError && (
                  <p className="upload-status upload-status--error" role="alert">
                    {editUserError}
                  </p>
                )}
                <div className="share-modal-actions">
                  <button className="primary-action" type="submit" disabled={editUserSubmitting}>
                    <Users size={18} />
                    {editUserSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={closeEditUserModal}
                    disabled={editUserSubmitting}
                  >
                    Hủy
                  </button>
                </div>
              </form>
            </div>
          )}

          {resetPasswordUser && canManageSystem && (
            <div className="share-modal-backdrop" role="presentation">
              <form
                className="share-modal admin-create-user-modal"
                aria-labelledby="reset-password-heading"
                onSubmit={(event) => void submitResetPassword(event)}
              >
                <button
                  className="icon-button share-modal-close"
                  type="button"
                  onClick={closeResetPasswordModal}
                  disabled={resetPasswordSubmitting}
                  aria-label="Đóng reset mật khẩu"
                  title="Đóng"
                >
                  <X size={18} />
                </button>
                <div className="share-modal-heading">
                  <span>Quản trị Cognito</span>
                  <h2 id="reset-password-heading">Reset mật khẩu</h2>
                </div>
                <div className="admin-create-user-grid">
                  <label>
                    <span>Người dùng</span>
                    <input value={`${resetPasswordUser.name} · ${resetPasswordUser.email}`} disabled />
                  </label>
                  <label>
                    <span>Mật khẩu mới</span>
                    <input
                      type="password"
                      value={resetPasswordValue}
                      onChange={(event) => setResetPasswordValue(event.target.value)}
                      disabled={resetPasswordSubmitting}
                      minLength={8}
                      required
                    />
                  </label>
                </div>
                <div className="share-modal-actions">
                  <button
                    className="primary-action"
                    type="submit"
                    disabled={resetPasswordSubmitting}
                  >
                    <ShieldCheck size={18} />
                    {resetPasswordSubmitting ? 'Đang reset...' : 'Reset mật khẩu'}
                  </button>
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={closeResetPasswordModal}
                    disabled={resetPasswordSubmitting}
                  >
                    Hủy
                  </button>
                </div>
              </form>
            </div>
          )}

          {isOverviewView && (
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
          )}

          {!isAdminView && (
          <div className={isOverviewView ? 'content-grid' : 'content-grid content-grid--single'}>
            <section className="document-panel" aria-labelledby="recent-heading">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">
                    {isOverviewView
                      ? 'Sổ cập nhật'
                      : isSharedView
                        ? 'Phạm vi chia sẻ'
                        : isRecentView
                          ? 'Dòng thời gian'
                          : isBookmarkedView
                            ? 'Lối tắt'
                            : isDepartmentView
                              ? 'Phòng ban'
                          : 'Kho tài liệu'}
                  </p>
                  <h2 id="recent-heading">
                    {isOverviewView
                      ? 'Tài liệu gần đây'
                      : isSharedView
                        ? 'Tài liệu được chia sẻ'
                        : isRecentView
                          ? 'Tài liệu cập nhật gần đây'
                          : isBookmarkedView
                            ? 'Tài liệu đã đánh dấu'
                            : isDepartmentView
                              ? 'Danh sách tài liệu phòng ban'
                        : 'Tất cả tài liệu'}
                  </h2>
                </div>
                <div className="panel-tools">
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={() => void refreshDocuments(true)}
                    disabled={documentsLoading}
                  >
                    <RefreshCw size={16} />
                    {documentsLoading ? 'Đang cập nhật' : 'Làm mới'}
                  </button>
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={() => {
                      resetDocumentFilters();
                      handleViewChange('ALL_DOCUMENTS');
                    }}
                  >
                    Xem tất cả
                  </button>
                </div>
              </div>

              <p className="document-refresh-status" aria-live="polite">
                {lastDocumentsUpdatedAt
                  ? `Cập nhật lần cuối ${formatRefreshTime(lastDocumentsUpdatedAt)}`
                  : 'Đang chờ dữ liệu mới nhất'}
              </p>

              <div className="document-filters" aria-label="Bộ lọc tài liệu">
                <label>
                  <span>Trạng thái</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as DocumentStatusFilter)}
                  >
                    {documentStatusFilters.map((filter) => (
                      <option key={filter.value} value={filter.value}>
                        {filter.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Phân loại</span>
                  <select
                    value={classificationFilter}
                    onChange={(event) =>
                      setClassificationFilter(event.target.value as DocumentClassificationFilter)
                    }
                  >
                    {documentClassificationFilters.map((filter) => (
                      <option key={filter.value} value={filter.value}>
                        {filter.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Phạm vi</span>
                  <select
                    value={accessScopeFilter}
                    onChange={(event) =>
                      setAccessScopeFilter(event.target.value as DocumentAccessScopeFilter)
                    }
                  >
                    {documentAccessScopeFilters.map((filter) => (
                      <option key={filter.value} value={filter.value}>
                        {filter.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Sắp xếp</span>
                  <select
                    value={documentSort}
                    onChange={(event) => setDocumentSort(event.target.value as DocumentSort)}
                  >
                    {documentSortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Số dòng</span>
                  <select
                    value={pageSize}
                    onChange={(event) =>
                      setPageSize(Number(event.target.value) as typeof pageSize)
                    }
                  >
                    {documentPageSizeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option} tài liệu
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={resetDocumentFilters}
                  disabled={!filtersActive}
                >
                  Xóa lọc
                </button>
              </div>

              <p className="document-view-context">{documentViewContext}</p>

              {selectedDocumentIds.size > 0 && (
                <div className="bulk-action-bar" role="status" aria-live="polite">
                  <span>Đã chọn {selectedDocumentIds.size} tài liệu</span>
                  <div>
                    <button className="quiet-button" type="button" onClick={clearDocumentSelection}>
                      Bỏ chọn
                    </button>
                    <button
                      className="quiet-button"
                      type="button"
                      disabled={!selectedReadyDocument}
                      onClick={() => {
                        if (selectedReadyDocument) {
                          void handleQuickDownload(selectedReadyDocument.id);
                        }
                      }}
                    >
                      <Download size={16} />
                      Tải xuống
                    </button>
                  </div>
                </div>
              )}

              <div className="document-header">
                <label className="selection-checkbox selection-checkbox--header">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả tài liệu trên trang"
                    aria-checked={currentPageSelectionState}
                    checked={currentPageSelectionState === true}
                    disabled={paginatedDocuments.length === 0}
                    onChange={toggleCurrentPageSelection}
                  />
                  <span />
                </label>
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

                {paginatedDocuments.map((document) => (
                  <article className="document-row" key={document.id}>
                    <label className="selection-checkbox">
                      <input
                        type="checkbox"
                        aria-label={`Chọn ${document.title}`}
                        checked={selectedDocumentIds.has(document.id)}
                        onChange={() => toggleDocumentSelection(document.id)}
                      />
                      <span />
                    </label>
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
                        className={
                          bookmarkedDocumentIds.has(document.id)
                            ? 'icon-button is-bookmarked'
                            : 'icon-button'
                        }
                        aria-label={
                          bookmarkedDocumentIds.has(document.id)
                            ? `Bỏ đánh dấu ${document.title}`
                            : `Đánh dấu ${document.title}`
                        }
                        title={
                          bookmarkedDocumentIds.has(document.id)
                            ? 'Bỏ đánh dấu tài liệu'
                            : 'Đánh dấu tài liệu'
                        }
                        aria-pressed={bookmarkedDocumentIds.has(document.id)}
                        onClick={() => toggleDocumentBookmark(document.id)}
                      >
                        <Star size={17} fill={bookmarkedDocumentIds.has(document.id) ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={
                          downloadingDocumentId === document.id
                            ? `Đang tải ${document.title}`
                            : `Tải ${document.title}`
                        }
                        disabled={
                          document.status !== 'READY' || downloadingDocumentId === document.id
                        }
                        title={
                          downloadingDocumentId === document.id
                            ? 'Đang tạo liên kết tải xuống'
                            : document.status === 'READY'
                            ? 'Tải tài liệu xuống'
                            : 'Tài liệu chưa sẵn sàng để tải xuống'
                        }
                        onClick={() => void handleQuickDownload(document.id)}
                      >
                        <Download size={17} />
                      </button>
                      <div
                        className="row-menu"
                        ref={openDocumentMenuId === document.id ? documentMenuRef : undefined}
                      >
                        <button
                          className="icon-button"
                          aria-label={`Tùy chọn cho ${document.title}`}
                          aria-expanded={openDocumentMenuId === document.id}
                          aria-haspopup="menu"
                          title="Mở menu thao tác tài liệu"
                          onClick={() => toggleDocumentMenu(document.id)}
                        >
                        <MoreHorizontal size={18} />
                        </button>
                        {openDocumentMenuId === document.id && (
                          <div className="row-action-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              title="Mở trang chi tiết tài liệu"
                              onClick={() => navigateToDocument(document.id)}
                            >
                              <Eye size={15} />
                              Xem chi tiết
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              title={
                                downloadingDocumentId === document.id
                                  ? 'Đang tạo liên kết tải xuống'
                                  : document.status === 'READY'
                                    ? 'Tải tài liệu xuống'
                                    : 'Tài liệu chưa sẵn sàng để tải xuống'
                              }
                              disabled={
                                document.status !== 'READY' ||
                                downloadingDocumentId === document.id
                              }
                              onClick={() => {
                                closeDocumentMenu();
                                void handleQuickDownload(document.id);
                              }}
                            >
                              <Download size={15} />
                              {downloadingDocumentId === document.id ? 'Đang tải' : 'Tải xuống'}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              title={
                                bookmarkedDocumentIds.has(document.id)
                                  ? 'Bỏ đánh dấu tài liệu'
                                  : 'Đánh dấu tài liệu'
                              }
                              onClick={() => {
                                toggleDocumentBookmark(document.id);
                                closeDocumentMenu();
                              }}
                            >
                              <Star
                                size={15}
                                fill={bookmarkedDocumentIds.has(document.id) ? 'currentColor' : 'none'}
                              />
                              {bookmarkedDocumentIds.has(document.id) ? 'Bỏ đánh dấu' : 'Đánh dấu'}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              title="Xem lịch sử hoạt động của tài liệu"
                              onClick={() => navigateToDocument(document.id, '#audit-heading')}
                            >
                              <History size={15} />
                              Lịch sử hoạt động
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              title="Chia sẻ tài liệu cho phòng ban khác"
                              onClick={() => openInlineShare(document)}
                            >
                              <Share2 size={15} />
                              Chia sẻ
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}

                {!documentsLoading && !documentsError && filteredDocuments.length === 0 && (
                  <div className="empty-state">
                    <Archive size={28} />
                    <h3>{emptyStateTitle}</h3>
                    <p>{emptyStateDescription}</p>
                    {documents.length > 0 && filtersActive && (
                      <button className="quiet-button" type="button" onClick={resetDocumentFilters}>
                        Xóa lọc
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="document-pagination" aria-label="Phân trang tài liệu">
                <p>
                  {sortedDocuments.length === 0
                    ? 'Không có tài liệu để hiển thị'
                    : `Đang xem ${pageStartIndex + 1}-${pageEndIndex} trong ${sortedDocuments.length} tài liệu`}
                </p>
                <div>
                  <button
                    className="quiet-button"
                    type="button"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    Trước
                  </button>
                  <span>
                    Trang {safeCurrentPage} / {totalPages}
                  </span>
                  <button
                    className="quiet-button"
                    type="button"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  >
                    Sau
                  </button>
                </div>
              </div>
            </section>

            {isOverviewView && (
            <aside className="activity-panel" aria-labelledby="activity-heading">
              {canReviewShareRequests && (
                <section
                  ref={shareReviewPanelRef}
                  className="share-review-panel"
                  aria-labelledby="share-review-heading"
                >
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
                  <h2 id="activity-heading">Hoạt động gần đây</h2>
                </div>
                <History size={19} />
              </div>

              {dashboardActivities.length === 0 ? (
                <p className="share-review-empty">Chưa có hoạt động tài liệu.</p>
              ) : (
                <ol className="activity-list">
                  {dashboardActivities.map((activity) => (
                    <li key={`${activity.time}-${activity.target}`}>
                      <time>{activity.time}</time>
                      <div>
                        <p>{activity.action}</p>
                        <button>Xem {activity.target}</button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

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
            )}
          </div>
          )}

          {shareDialogDocument && (
            <div
              className="share-modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !inlineShareSubmitting) {
                  closeInlineShare();
                }
              }}
            >
              <form
                className="share-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="share-modal-heading"
                onSubmit={(event) => void handleInlineShareSubmit(event, shareDialogDocument)}
              >
                <button
                  className="icon-button share-modal-close"
                  type="button"
                  aria-label="Đóng chia sẻ"
                  disabled={inlineShareSubmitting}
                  onClick={closeInlineShare}
                >
                  <X size={18} />
                </button>
                <div className="share-modal-heading">
                  <p className="section-kicker">Chia sẻ an toàn</p>
                  <h2 id="share-modal-heading">Chia sẻ phòng ban</h2>
                  <span>{shareDialogDocument.title}</span>
                </div>
                <label>
                  <span>Phòng ban nhận</span>
                  <select
                    ref={shareDepartmentSelectRef}
                    value={inlineShareDepartmentId}
                    onChange={(event) => {
                      setInlineShareDepartmentId(event.target.value);
                      setInlineShareError('');
                      setInlineShareMessage('');
                    }}
                  >
                    <option value="">Chọn phòng ban</option>
                    {departmentOptions
                      .filter((department) => department.id !== shareDialogDocument.departmentId)
                      .map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.label}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="share-modal-actions">
                  <button
                    className="primary-action"
                    type="submit"
                    disabled={inlineShareSubmitting || !inlineShareDepartmentId}
                  >
                    <Share2 size={17} />
                    {inlineShareSubmitting ? 'Đang chia sẻ' : 'Chia sẻ'}
                  </button>
                  <button
                    className="quiet-button"
                    type="button"
                    disabled={inlineShareSubmitting}
                    onClick={closeInlineShare}
                  >
                    Hủy
                  </button>
                </div>
                {inlineShareMessage && (
                  <p className="upload-status upload-status--success">{inlineShareMessage}</p>
                )}
                {inlineShareError && (
                  <p className="upload-status upload-status--error" role="alert">
                    {inlineShareError}
                  </p>
                )}
              </form>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
