# Brainstorming - Document Management System

## 1. Mục đích tài liệu

Tài liệu này tập hợp câu hỏi, phương án và đề xuất ban đầu cho DMS. Đây chưa phải đặc tả cuối cùng. Mọi mục có nhãn **Cần xác nhận** phải được chốt với chủ dự án hoặc người phụ trách nghiệp vụ trước khi triển khai production.

Phạm vi brainstorming gồm:

- Làm sạch và chuẩn hóa dữ liệu trước khi lưu.
- Kiểm soát file upload và xử lý trùng lặp.
- Các chỉ số vận hành, sử dụng, chi phí và bảo mật.
- Phương pháp phân tích dữ liệu DMS.
- Quy trình duyệt tài liệu và dữ liệu cần thu thập.
- Kiến trúc thu thập event phù hợp React và AWS serverless backend.

## 2. Mục tiêu và bài toán kinh doanh

### Mục tiêu cốt lõi

Thay thế việc lưu trữ tài liệu phân tán qua Zalo, Google Drive cá nhân và ổ cứng bằng một hệ thống tập trung, bảo mật, có tổ chức, truy vết được và tối ưu chi phí.

### Pain points cần giải quyết

1. Thất lạc file hoặc không xác định được phiên bản mới nhất.
2. Dữ liệu nhạy cảm bị xem bởi người không có quyền.
3. Không biết ai đã tải xuống, sửa, chia sẻ hoặc xóa tài liệu.
4. Tài liệu trùng lặp làm tăng chi phí lưu trữ.
5. Tìm kiếm chậm do tên file và metadata không thống nhất.
6. Quy trình duyệt tài liệu không minh bạch, khó xác định điểm nghẽn.
7. Khó dự báo chi phí S3 và nhu cầu lưu trữ trong tương lai.

### Kết quả kinh doanh mong muốn

- Nhân viên tìm đúng tài liệu và đúng phiên bản nhanh hơn.
- Tài liệu nhạy cảm chỉ được truy cập bởi đúng người hoặc phòng ban.
- Mọi thao tác quan trọng có audit trail.
- Giảm file trùng và file không còn giá trị sử dụng.
- Có dashboard để quản lý dung lượng, mức độ sử dụng và rủi ro.
- Có dữ liệu để cải thiện quy trình duyệt tài liệu.

## 3. Đối tượng sử dụng

### Nhân viên

- Upload, tìm kiếm, xem, tải xuống và tạo phiên bản mới.
- Chia sẻ tài liệu nếu có quyền.
- Theo dõi trạng thái tài liệu mình sở hữu.

### Trưởng phòng

- Quản lý tài liệu thuộc phòng ban.
- Phê duyệt hoặc từ chối tài liệu.
- Xem báo cáo sử dụng của phòng ban.

### Quản trị hệ thống

- Quản lý cấu hình, định dạng file, giới hạn dung lượng và retention.
- Điều tra audit log và cảnh báo bất thường.
- Theo dõi chi phí và sức khỏe hệ thống.

### Ban giám đốc

- Xem chỉ số tổng hợp, xu hướng, rủi ro và điểm nghẽn phê duyệt.
- Không mặc định được quyền đọc nội dung mọi tài liệu; dashboard nên ưu tiên dữ liệu tổng hợp.

## 4. Làm sạch và chuẩn hóa dữ liệu

### 4.1 Quét malware và virus

**Câu hỏi**

- Có bắt buộc quét mọi file trước khi người khác tải xuống không?
- File bị nghi nhiễm được xóa ngay hay giữ trong khu vực cách ly?
- Ai được nhận cảnh báo và ai có quyền giải phóng file khỏi cách ly?
- Thời gian tối đa chấp nhận cho quá trình quét là bao lâu?

**Các phương án**

1. Không quét: rẻ và đơn giản nhưng rủi ro cao, không phù hợp DMS doanh nghiệp.
2. Quét đồng bộ trước khi xác nhận upload: trải nghiệm chậm và dễ timeout với file lớn.
3. Upload vào vùng cách ly, quét bất đồng bộ, chỉ phát hành khi sạch.

**Đề xuất mặc định**

- Bắt buộc quét mọi file bằng pipeline bất đồng bộ.
- Upload ban đầu vào S3 prefix hoặc bucket cách ly.
- Event S3 kích hoạt quy trình quét qua dịch vụ quét malware được phê duyệt.
- File chỉ chuyển sang trạng thái `READY` sau khi có kết quả sạch.
- File nhiễm giữ ở trạng thái `INFECTED`, chặn mọi presigned download URL và gửi cảnh báo.
- Không ghi nội dung file hoặc presigned URL vào log.

**Cần xác nhận**

- Thời gian giữ file nhiễm trước khi xóa.
- Người nhận cảnh báo: uploader, trưởng phòng, IT Security hay tất cả.
- Có cho phép IT Security tải file nhiễm trong môi trường điều tra riêng hay không.

### 4.2 Tên file và S3 key

**Vấn đề**

- Tên file có thể chứa ký tự đặc biệt, Unicode, khoảng trắng liên tiếp hoặc path traversal như `../`.
- Hai người có thể upload cùng một tên file.
- Đổi tên file để lưu trữ có thể làm mất tên gốc cần hiển thị.

**Đề xuất mặc định**

- Lưu tên gốc đã kiểm tra trong metadata `originalFileName` để hiển thị.
- Không dùng tên gốc làm định danh tài liệu hoặc phần key quan trọng.
- S3 key dùng `documentId`, `versionNumber` và tên đã sanitize:

```text
documents/{documentId}/versions/{versionNumber}/{sanitizedFileName}
```

- Loại bỏ path separator, control character và chuỗi `..`.
- Chuẩn hóa khoảng trắng; giới hạn độ dài tên.
- Cho phép chữ tiếng Việt trong tên hiển thị, nhưng key có thể dùng dạng an toàn hơn.
- Không đưa email, mã lương hoặc thông tin nhạy cảm vào S3 key.

**Không đề xuất**

- Âm thầm sửa tên hiển thị mà không báo người dùng.
- Dùng tên file làm khóa duy nhất.
- Chỉ lọc ký tự ở React mà không kiểm tra lại tại Lambda.

### 4.3 Metadata thiếu

| Trường        |      Bắt buộc MVP | Nguồn                                | Xử lý khi thiếu                    |
| ------------- | ----------------: | ------------------------------------ | ---------------------------------- |
| Tên tài liệu  |                Có | Người dùng                           | Không cho hoàn tất upload          |
| Phòng ban     |                Có | Hồ sơ Cognito hoặc lựa chọn có quyền | Không cho hoàn tất upload          |
| Owner         |                Có | Cognito `sub`                        | Backend tự gán                     |
| Loại bảo mật  |                Có | Người dùng/chính sách                | Mặc định `INTERNAL` nếu được duyệt |
| Loại file     |                Có | MIME, extension, magic bytes         | Từ chối nếu không xác định         |
| Dung lượng    |                Có | S3 object metadata                   | Backend tự xác nhận                |
| Checksum      |                Có | Client và/hoặc backend               | Chưa có thì giữ `PROCESSING`       |
| Tags          |             Không | Người dùng                           | Cho phép rỗng trong MVP            |
| Mô tả         |             Không | Người dùng                           | Cho phép rỗng                      |
| Ngày hiệu lực | Tùy loại tài liệu | Người dùng/quy trình                 | Yêu cầu với hợp đồng, chính sách   |

**Câu hỏi cần chốt**

- Phòng ban lấy cố định từ Cognito hay người dùng có thể chọn phòng ban đích?
- Có cho phép quản trị viên upload thay phòng ban khác không?
- Loại tài liệu nào bắt buộc có tags, ngày hiệu lực hoặc ngày hết hạn?

### 4.4 File trùng lặp

**Cách phát hiện đề xuất**

- Tính SHA-256 checksum cho nội dung file.
- So sánh checksum trong phạm vi phù hợp: toàn công ty, cùng phòng ban hoặc cùng owner.
- Tên giống nhau không đủ để kết luận nội dung trùng.

**Các tình huống**

| Tình huống                            | Đề xuất xử lý                                                   |
| ------------------------------------- | --------------------------------------------------------------- |
| Cùng tên, khác checksum               | Hỏi tạo tài liệu mới hay phiên bản mới                          |
| Khác tên, cùng checksum               | Cảnh báo nội dung đã tồn tại và hiển thị tài liệu phù hợp quyền |
| Cùng documentId, checksum mới         | Tạo phiên bản mới                                               |
| Cùng documentId, cùng checksum        | Chặn phiên bản rỗng hoặc yêu cầu xác nhận                       |
| Trùng với tài liệu không có quyền xem | Không tiết lộ tên/owner; chỉ báo nội dung có thể trùng          |

**Đề xuất mặc định**

- Không ghi đè object cũ.
- Không âm thầm tạo bản sao.
- Cảnh báo và cho người có quyền chọn `Tạo phiên bản mới`, `Tạo tài liệu riêng` hoặc `Hủy`.
- Dùng conditional write để ngăn hai phiên bản nhận cùng số version.

### 4.5 Định dạng file

**Allowlist MVP đề xuất**

- `.pdf`
- `.docx`
- `.xlsx`
- `.pptx`
- `.jpg`, `.jpeg`, `.png`
- `.txt`, `.csv` nếu nghiệp vụ cần

**Denylist bắt buộc**

- Executable và script: `.exe`, `.msi`, `.bat`, `.cmd`, `.com`, `.ps1`, `.sh`.
- File có extension kép đáng ngờ như `contract.pdf.exe`.
- Archive có mật khẩu nếu công cụ quét không kiểm tra được nội dung.

**Nguyên tắc kiểm tra**

- Không tin extension hoặc `Content-Type` do browser gửi lên.
- Đối chiếu extension, MIME type và file signature/magic bytes.
- Giới hạn kích thước theo loại file và phòng ban.
- File không hỗ trợ phải bị từ chối trước hoặc chuyển sang trạng thái `REJECTED`.

**Cần xác nhận**

- Có cho phép `.zip` không?
- Có nhu cầu lưu video, CAD hoặc file thiết kế dung lượng lớn không?
- Giới hạn mặc định: 25 MB, 100 MB hay theo từng loại tài liệu?

### 4.6 Naming convention

**Phương án A: bắt buộc đổi tên file trước upload**

- Ưu điểm: tên đồng nhất.
- Nhược điểm: tăng thao tác, dễ làm người dùng bỏ cuộc, tên file vẫn không phải metadata đáng tin cậy.

**Phương án B: metadata có cấu trúc, hệ thống tạo display name chuẩn**

- Ví dụ: `[HR] Hợp đồng lao động - 2026-001`.
- Tên file gốc vẫn được giữ trong version metadata.

**Đề xuất**

- Chọn phương án B.
- Không nhồi toàn bộ metadata vào tên file.
- Cho phép template tên theo loại tài liệu nếu phòng ban yêu cầu.

### 4.7 Ngày tháng và thời gian

- Lưu mọi timestamp ở UTC theo ISO 8601, ví dụ `2026-06-19T05:30:00Z`.
- Giao diện React hiển thị theo timezone người dùng; mặc định dự án là `Asia/Ho_Chi_Minh`.
- Ngày chỉ có ý nghĩa lịch, như ngày ký hợp đồng, lưu dạng `YYYY-MM-DD`.
- Giao diện tiếng Việt có thể hiển thị `DD/MM/YYYY`.
- Không lưu chuỗi `DD/MM/YYYY` làm giá trị thời gian dùng để sort.

### 4.8 Chuẩn hóa thông tin nhân sự

- Dùng Cognito `sub` làm `userId` kỹ thuật ổn định.
- `employeeCode` là thuộc tính nghiệp vụ riêng, không thay thế `sub`.
- Chuẩn hóa email về lowercase để tìm kiếm, nhưng không dùng email làm partition key.
- Phòng ban và role phải lấy từ nguồn quản trị được phê duyệt.
- Khi nhân viên chuyển phòng ban, quyền cũ không được tự động giữ nếu chính sách không cho phép.
- Cần xác định nguồn sự thật cho nhân sự: Cognito attributes, HR system hay file đồng bộ định kỳ.

## 5. Pipeline upload đề xuất

```text
React
  -> API Gateway / Lambda: tạo upload intent
  -> S3 quarantine: upload bằng presigned URL
  -> S3 event: bắt đầu kiểm tra
  -> Validate type, size, checksum
  -> Malware scan
  -> DynamoDB: cập nhật trạng thái
  -> S3 clean area: phát hành file sạch
  -> Audit event + thông báo kết quả
```

### Trạng thái file

| Trạng thái       | Ý nghĩa                              | Cho phép download |
| ---------------- | ------------------------------------ | ----------------: |
| `UPLOAD_PENDING` | Đã tạo intent, chưa upload xong      |             Không |
| `UPLOADED`       | S3 đã nhận object                    |             Không |
| `VALIDATING`     | Đang kiểm tra loại, size, checksum   |             Không |
| `SCANNING`       | Đang quét malware                    |             Không |
| `READY`          | File hợp lệ và sạch                  |  Có, nếu đủ quyền |
| `INFECTED`       | Phát hiện nguy cơ                    |             Không |
| `REJECTED`       | Sai loại, quá dung lượng hoặc policy |             Không |
| `FAILED`         | Pipeline lỗi kỹ thuật                |             Không |

### Edge cases cần xử lý

- Upload intent được tạo nhưng người dùng không upload.
- Upload thành công nhưng callback hoặc event đến nhiều lần.
- Lambda timeout giữa lúc cập nhật metadata.
- File được upload nhưng checksum không khớp.
- Kết quả scan đến muộn hoặc không xác định.
- Người dùng bị khóa trong lúc file đang xử lý.
- Tài liệu bị xóa trong lúc một version mới đang upload.

Pipeline phải idempotent và có cơ chế dọn upload dở dang.

## 6. Chỉ số và analytics

### 6.1 Storage và chi phí

| Metric                | Công thức/ý nghĩa                  | Nguồn dữ liệu         | Tần suất  |
| --------------------- | ---------------------------------- | --------------------- | --------- |
| Total storage bytes   | Tổng dung lượng version đang lưu   | S3 inventory/metadata | Hằng ngày |
| Storage growth        | Dung lượng cuối kỳ - đầu kỳ        | Snapshot hằng ngày    | Tháng     |
| Growth rate           | `growth / storage đầu kỳ`          | Snapshot              | Tháng     |
| Average file size     | Tổng bytes / số version            | Metadata              | Tuần      |
| Orphan object count   | S3 object không có metadata hợp lệ | Đối soát S3-DynamoDB  | Hằng ngày |
| Duplicate bytes       | Bytes có checksum trùng            | Checksum index        | Tuần      |
| Storage by department | Tổng bytes theo phòng ban          | Document metadata     | Tháng     |

### 6.2 User engagement

- Daily/Weekly/Monthly Active Users.
- Số upload, download, view và search theo phòng ban.
- Tỷ lệ người dùng có ít nhất một thao tác trong tháng.
- Số tài liệu được chia sẻ và số share bị thu hồi.
- Tỷ lệ tài liệu không được truy cập trong 90/180/365 ngày.

Không dùng metric “nhân viên tích cực nhất” để đánh giá hiệu suất lao động nếu chưa có chính sách HR rõ ràng. Metric này có thể gây hiểu sai và ảnh hưởng riêng tư.

### 6.3 Loại tài liệu

- Tỷ lệ file theo extension và MIME type.
- Dung lượng theo loại file.
- Số version trung bình theo loại tài liệu.
- Loại tài liệu có tỷ lệ bị từ chối hoặc nhiễm cao.
- Loại tài liệu có thời gian duyệt dài nhất.

### 6.4 Hiệu suất tìm kiếm

**Metrics đề xuất**

- Search count.
- Zero-result rate.
- Search-to-open conversion rate.
- Median time from search to document open.
- Search refinement rate: người dùng sửa query trong khoảng thời gian ngắn.
- Tag được tìm hoặc filter nhiều nhất.

**Công thức gợi ý**

```text
Zero-result rate = số search không có kết quả / tổng số search
Search success rate = số search dẫn đến open/download / tổng số search
Time to find = thời điểm open đầu tiên - thời điểm search đầu tiên trong session
```

**Rủi ro riêng tư**

- Search query có thể chứa tên khách hàng, mã hợp đồng hoặc dữ liệu nhạy cảm.
- Không mặc định lưu query thô vĩnh viễn.
- Có thể lưu normalized tag/filter hoặc hash có kiểm soát.
- Cần chính sách retention và quyền xem search analytics.

### 6.5 Security và audit

- Số lần truy cập bị từ chối.
- Số thao tác xóa, restore, share và thay đổi quyền.
- Số presigned URL được tạo theo user/phòng ban.
- Số download trong cửa sổ 5 phút, 1 giờ và 24 giờ.
- Truy cập ngoài giờ làm việc.
- Truy cập tài liệu khác phòng ban.
- Số file bị malware scan đánh dấu.
- Số lần đăng nhập thất bại hoặc tài khoản bị khóa.

Metric bảo mật phải phục vụ điều tra và cảnh báo, không tự động kết luận người dùng có hành vi xấu nếu chưa có bước xác minh.

## 7. Event model cần thu thập

### Event tối thiểu

```text
AUTH_LOGIN_SUCCEEDED
AUTH_LOGIN_FAILED
DOCUMENT_CREATED
UPLOAD_STARTED
UPLOAD_COMPLETED
UPLOAD_REJECTED
MALWARE_SCAN_COMPLETED
DOCUMENT_VIEWED
DOCUMENT_DOWNLOADED
DOCUMENT_SEARCHED
DOCUMENT_VERSION_CREATED
DOCUMENT_SHARED
SHARE_REVOKED
PERMISSION_CHANGED
DOCUMENT_DELETED
DOCUMENT_RESTORED
APPROVAL_SUBMITTED
APPROVAL_APPROVED
APPROVAL_REJECTED
DOCUMENT_PUBLISHED
```

### Event envelope

```json
{
  "eventId": "uuid",
  "eventType": "DOCUMENT_DOWNLOADED",
  "occurredAt": "2026-06-19T05:30:00Z",
  "actorId": "cognito-sub",
  "actorDepartmentId": "HR",
  "documentId": "uuid",
  "versionNumber": 3,
  "documentDepartmentId": "HR",
  "classification": "CONFIDENTIAL",
  "fileType": "pdf",
  "fileSizeBytes": 1200345,
  "requestId": "api-request-id",
  "sessionId": "opaque-session-id",
  "outcome": "SUCCESS"
}
```

### Nguyên tắc event

- Event có `eventId` để deduplicate.
- Không chứa nội dung tài liệu, token hoặc presigned URL.
- Không phụ thuộc display name có thể thay đổi.
- Timestamp theo UTC.
- Event analytics không thay thế audit log bảo mật.
- Audit event cần tính toàn vẹn và retention nghiêm ngặt hơn product analytics.
- Schema event phải có version khi bắt đầu thay đổi cấu trúc.

## 8. Kiến trúc dữ liệu phân tích

### MVP

- Lambda ghi audit log có cấu trúc.
- DynamoDB phục vụ truy vấn vận hành gần thời gian thực.
- Snapshot hoặc export định kỳ sang S3 analytics zone.
- Athena hoặc công cụ truy vấn tương đương đọc dữ liệu trên S3.
- Dashboard chỉ dùng dữ liệu tổng hợp theo quyền.

### Giai đoạn mở rộng

- EventBridge tiếp nhận domain event.
- SQS đệm event để tách analytics khỏi request chính.
- Lambda consumer chuẩn hóa và ghi event vào S3 theo partition ngày.
- Chuyển dữ liệu sang định dạng cột như Parquet khi khối lượng đủ lớn.
- QuickSight hoặc công cụ BI được phê duyệt hiển thị dashboard.
- Cảnh báo bảo mật dùng rule riêng, không phụ thuộc dashboard batch.

### Partition gợi ý

```text
analytics/events/year=2026/month=06/day=19/eventType=DOCUMENT_DOWNLOADED/
```

### Nguyên tắc chi phí

- Không đưa thêm service streaming chỉ để xử lý khối lượng nhỏ.
- Bắt đầu bằng batch/export đơn giản và đo khối lượng thực tế.
- Thiết lập retention và lifecycle cho analytics data.
- Dashboard không được scan dữ liệu không partition toàn bộ lịch sử.

## 9. Phương pháp phân tích

### 9.1 Trend analysis

**Câu hỏi**

- Số tài liệu và dung lượng tăng thế nào theo tháng/quý?
- Tăng trưởng có tương quan với số nhân viên hoạt động không?
- Tỷ lệ download/upload thay đổi theo mùa vụ không?

**Dữ liệu cần**

- Upload timestamp, size, department, active user count.
- Snapshot storage theo ngày.
- Headcount theo kỳ nếu HR cho phép sử dụng dữ liệu tổng hợp.

**Hành động có thể đưa ra**

- Điều chỉnh lifecycle policy.
- Dự báo ngân sách lưu trữ.
- Đào tạo phòng ban có mức sử dụng thấp bất thường.

### 9.2 Segmentation

Phân khúc theo:

- Phòng ban: HR, Tech, Sales.
- Classification: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`.
- File type.
- Tuổi tài liệu.
- Trạng thái phê duyệt.
- Mức độ sử dụng.

**Câu hỏi**

- Phòng ban nào dùng nhiều dung lượng nhất?
- Tài liệu `CONFIDENTIAL` có bị chia sẻ rộng quá mức không?
- Loại file nào có tỷ lệ tạo nhiều version nhất?

### 9.3 Pareto 80/20

**Storage Pareto**

1. Sắp file theo dung lượng giảm dần.
2. Tính cumulative storage percentage.
3. Xác định tỷ lệ file chiếm 80% dung lượng.

**Access Pareto**

1. Đếm view/download theo tài liệu.
2. Sắp tài liệu theo lượt truy cập.
3. Xác định tài liệu cốt lõi tạo ra 80% lượt truy cập.

**Ứng dụng**

- Tối ưu hoặc archive nhóm file lớn ít dùng.
- Đưa tài liệu cốt lõi lên dashboard hoặc bộ sưu tập chung.
- Không xóa file chỉ vì ít truy cập nếu retention nghiệp vụ yêu cầu giữ.

### 9.4 Funnel analysis cho quy trình duyệt

State machine đề xuất:

```text
DRAFT
  -> PENDING_MANAGER_APPROVAL
  -> PENDING_DIRECTOR_APPROVAL
  -> APPROVED
  -> PUBLISHED
```

Nhánh phụ:

```text
PENDING_* -> REJECTED -> DRAFT
APPROVED -> ARCHIVED
```

**Metrics**

- Conversion rate giữa từng bước.
- Median và P95 time-in-stage.
- Rejection rate và lý do từ chối.
- Số tài liệu bị treo quá SLA.
- Số vòng sửa trước khi được duyệt.

**Câu hỏi**

- Bước nào có tỷ lệ rơi rụng cao nhất?
- Trưởng phòng hoặc giám đốc mất bao lâu để duyệt?
- Loại tài liệu nào thường bị trả lại?
- Có cần reminder hoặc escalation tự động không?

### 9.5 Anomaly detection

**Rule-based MVP**

- Download vượt ngưỡng trong 5 phút hoặc 1 giờ.
- Download tài liệu khác phòng ban ngoài giờ làm việc.
- Tạo nhiều presigned URL nhưng không có download tương ứng.
- Liên tục bị từ chối quyền trên nhiều tài liệu.
- Xóa hoặc chia sẻ hàng loạt.
- Đăng nhập từ điều kiện truy cập bất thường nếu dữ liệu hợp lệ có sẵn.

**Giai đoạn nâng cao**

- Tạo baseline theo user, role và phòng ban.
- So sánh hành vi hiện tại với lịch sử thay vì dùng một ngưỡng chung.
- Chấm điểm rủi ro kết hợp thời gian, volume, classification và department mismatch.

**Guardrails**

- Cảnh báo không đồng nghĩa với vi phạm.
- Luôn có bước con người xác minh.
- Ngưỡng phải cấu hình được và được review định kỳ.
- Không dùng anomaly score làm căn cứ kỷ luật tự động.

## 10. Dashboard đề xuất

### Dashboard quản trị hệ thống

- Tổng storage và tăng trưởng theo tháng.
- Storage theo phòng ban và file type.
- Upload/download/search trend.
- Error rate, Lambda latency và failed processing jobs.
- File đang `FAILED`, `INFECTED` hoặc xử lý quá SLA.

### Dashboard quản lý phòng ban

- Tài liệu mới, tài liệu chờ duyệt và tài liệu quá hạn.
- Storage của phòng ban.
- Tài liệu được truy cập nhiều nhất.
- Tài liệu không được sử dụng trong thời gian dài.
- Thời gian duyệt trung bình theo bước.

### Dashboard bảo mật

- Access denied trend.
- Bulk download và truy cập ngoài giờ.
- Cross-department access.
- Permission changes và external-style shares nếu hệ thống hỗ trợ.
- Malware findings và thời gian xử lý.

### Dashboard ban giám đốc

- Adoption theo phòng ban.
- Chi phí và tăng trưởng lưu trữ.
- SLA phê duyệt.
- Tỷ lệ tìm kiếm thành công.
- Rủi ro bảo mật tổng hợp, không hiển thị nội dung tài liệu.

## 11. KPI và mục tiêu thử nghiệm

Các giá trị sau chỉ là giả thuyết để thảo luận, chưa phải cam kết production:

| KPI                                    |                     Mục tiêu thử nghiệm |
| -------------------------------------- | --------------------------------------: |
| Search success rate                    |                                  >= 80% |
| Zero-result rate                       |                                  <= 15% |
| Median time to find                    |                              <= 60 giây |
| Upload processing success              |                                  >= 99% |
| File scan hoàn tất                     | <= 2 phút với file trong giới hạn chuẩn |
| Tài liệu có owner và department hợp lệ |                                    100% |
| Thao tác nhạy cảm có audit event       |                                    100% |
| Unauthorized download URL issued       |                                       0 |
| Tài liệu chờ duyệt quá SLA             |                   Theo policy từng loại |

## 12. Quyết định MVP đề xuất

1. Quét malware bất đồng bộ trước khi phát hành file.
2. Dùng allowlist file type; từ chối executable và script.
3. Department, owner, title, classification, MIME, size và checksum là metadata bắt buộc.
4. Tags và description là tùy chọn trong MVP.
5. Không ghi đè file; mọi thay đổi nội dung tạo version mới.
6. Phát hiện trùng bằng SHA-256, không chỉ bằng tên.
7. Lưu UTC ISO 8601; React hiển thị theo `Asia/Ho_Chi_Minh`.
8. Tìm kiếm MVP theo metadata, chưa tìm toàn văn nội dung.
9. Analytics MVP dùng audit event có cấu trúc và export batch sang S3.
10. Anomaly detection MVP dùng rule cấu hình được, chưa dùng machine learning.
11. Quy trình duyệt là phase tiếp theo nếu chưa phải yêu cầu bắt buộc của MVP.

## 13. Câu hỏi cần workshop

### Ưu tiên P0 - phải chốt trước khi xây upload

1. File type và dung lượng tối đa cho từng phòng ban là gì?
2. Có bắt buộc quét malware mọi file không?
3. Phòng ban lấy từ Cognito hay hệ thống HR nào khác?
4. Chính sách xử lý file trùng là gì?
5. Ai được xem và xử lý file nhiễm?
6. Classification mặc định là `INTERNAL` hay bắt buộc người dùng chọn?

### Ưu tiên P1 - phải chốt trước khi xây sharing và audit

1. Quyền chia sẻ theo user, phòng ban hay cả hai?
2. Share có ngày hết hạn bắt buộc không?
3. Có cho phép người nhận chia sẻ tiếp không?
4. Audit log giữ trong bao lâu?
5. Ai được xem audit log và dashboard bảo mật?
6. Soft delete giữ bao lâu trước khi xóa vĩnh viễn?

### Ưu tiên P2 - analytics và workflow

1. Quy trình duyệt áp dụng cho mọi tài liệu hay theo loại?
2. SLA từng bước duyệt là bao lâu?
3. Dashboard dùng cho vận hành hay đánh giá nhân viên?
4. Có được lưu search query thô không?
5. Ngưỡng bulk download khác nhau theo role không?
6. Có cần tìm kiếm nội dung bên trong PDF/DOCX không?

## 14. Lộ trình xác thực giả thuyết

### Giai đoạn 1 - Data policy

- Workshop với HR, Tech, Sales và IT Security.
- Chốt allowlist, size limit, naming, metadata và retention.
- Chốt permission matrix và classification.

### Giai đoạn 2 - MVP vận hành

- Upload, validate, scan và versioning.
- Search metadata.
- Sharing và audit log.
- Thu thập event tối thiểu.

### Giai đoạn 3 - Dashboard

- Storage, usage, search và security metrics.
- Kiểm tra chất lượng event và độ đầy đủ metadata.
- Đối soát dashboard với dữ liệu vận hành.

### Giai đoạn 4 - Workflow và nâng cao

- Approval funnel.
- Rule-based anomaly alerts.
- Pareto và archive recommendations.
- Đánh giá full-text search và dự báo chi phí.

## 15. Rủi ro chính

| Rủi ro                       | Hậu quả                 | Giảm thiểu                           |
| ---------------------------- | ----------------------- | ------------------------------------ |
| Không quét malware           | Phát tán file độc hại   | Quarantine và scan trước `READY`     |
| Tin extension do browser gửi | Bỏ lọt file nguy hiểm   | MIME + signature + scan              |
| Metadata tùy ý               | Search và analytics sai | Required fields, enum, validation    |
| Ghi đè file                  | Mất lịch sử             | Immutable version objects            |
| Ghi query thô                | Rò rỉ dữ liệu nhạy cảm  | Redaction, aggregation, retention    |
| Dashboard sai quyền          | Lộ dữ liệu phòng ban    | Row-level access và dữ liệu tổng hợp |
| Alert quá nhạy               | Alert fatigue           | Baseline, tuning và human review     |
| Analytics làm chậm API       | Trải nghiệm kém         | Event bất đồng bộ, queue và retry    |
| Chi phí service tăng sớm     | Lãng phí                | Bắt đầu batch, đo trước khi mở rộng  |

## 16. Definition of Ready cho analytics

Một metric chỉ sẵn sàng triển khai khi:

- Có định nghĩa và công thức duy nhất.
- Có owner nghiệp vụ.
- Có nguồn event hoặc dữ liệu rõ ràng.
- Có quy tắc timezone và kỳ báo cáo.
- Có cách xử lý event trùng, thiếu hoặc đến muộn.
- Có phân quyền người xem.
- Có retention và yêu cầu riêng tư.
- Có test đối soát với dữ liệu mẫu.
- Có hành động dự kiến khi metric vượt ngưỡng.

Nếu một metric không dẫn đến quyết định hoặc hành động cụ thể, chưa nên ưu tiên thu thập trong MVP.
