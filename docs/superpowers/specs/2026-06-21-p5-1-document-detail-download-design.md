# P5.1 - Chi tiết và tải tài liệu an toàn

## Mục tiêu

Cho phép người dùng có quyền xem metadata của một tài liệu và tải trực tiếp file sạch từ Amazon S3 bằng presigned URL có thời hạn ngắn. Backend phải kiểm tra quyền và trạng thái trước khi cấp URL; frontend không được tự xây S3 URL.

## Phạm vi

### Trong phạm vi

- `GET /documents/{documentId}` trả chi tiết tài liệu.
- `POST /documents/{documentId}/download-intents` tạo presigned download URL.
- Trang chi tiết riêng tại `/documents/:documentId`.
- Nút tải xuống trên trang chi tiết và danh sách.
- Kiểm tra quyền theo owner, phòng ban và Cognito group.
- Chỉ cấp URL cho tài liệu `READY`.
- URL hết hạn sau 300 giây.
- Audit append-only khi cấp download URL.
- Unit test, component test, CDK assertion và cập nhật OpenAPI.

### Ngoài phạm vi

- Chia sẻ tài liệu với user hoặc phòng ban khác; thuộc P7.
- Chọn và tải phiên bản cũ; thuộc P6.
- Ghi nhận chắc chắn trình duyệt đã tải hết file.
- Preview nội dung tài liệu trong trình duyệt.
- Chỉnh sửa metadata, xóa, restore hoặc retention.
- Deploy AWS trong bước triển khai local.

## Kiến trúc

### Document Detail

`DocumentDetailFunction` phục vụ `GET /documents/{documentId}`. Lambda đọc item `pk = DOC#{documentId}`, `sk = META` từ DynamoDB, kiểm tra quyền rồi trả metadata an toàn.

Lambda chỉ có quyền đọc bảng DynamoDB. Response không chứa checksum, S3 bucket, S3 object key, GuardDuty tag, upload intent hoặc exception kỹ thuật.

### Download Intent

`DownloadIntentFunction` phục vụ `POST /documents/{documentId}/download-intents`. Lambda:

1. Đọc metadata tài liệu từ DynamoDB.
2. Kiểm tra quyền truy cập.
3. Kiểm tra `status === READY` và có `cleanObjectKey` hợp lệ.
4. Tạo presigned `GetObject` URL trỏ tới Documents Bucket.
5. Đặt thời hạn URL là 300 giây.
6. Ghi audit `DOCUMENT_DOWNLOAD_REQUESTED`.
7. Trả URL, thời điểm hết hạn và tên file.

Lambda được đọc Documents Bucket, đọc/ghi bảng DynamoDB để ghi audit và không có quyền đọc Quarantine Bucket.

Hai Lambda tách biệt để giữ ranh giới IAM rõ ràng. Số lượng Lambda không tạo chi phí chờ; file được tải trực tiếp từ S3 nên không tiêu tốn thời gian chạy Lambda để truyền dữ liệu.

## Phân quyền

Một tài khoản được xem chi tiết và yêu cầu tải khi thỏa ít nhất một điều kiện:

- `claims.sub === document.ownerId`;
- `claims.custom:departmentId === document.departmentId`;
- thuộc group `SYSTEM_ADMIN`.

`DEPARTMENT_ADMIN` chỉ truy cập tài liệu cùng phòng ban, giống quy tắc phòng ban chung. Owner vẫn truy cập tài liệu của mình nếu phòng ban trên hồ sơ tài khoản đã thay đổi.

Tài khoản thiếu `sub` hoặc `custom:departmentId` bị trả `401 UNAUTHORIZED`.

Tài liệu không tồn tại và tài liệu không có quyền đều trả `404 DOCUMENT_NOT_FOUND` với cùng response để hạn chế dò mã tài liệu.

## Trạng thái tài liệu

Người có quyền được xem metadata ở mọi trạng thái hợp lệ:

- `UPLOAD_PENDING`
- `UPLOADED`
- `VALIDATING`
- `SCANNING`
- `READY`
- `REJECTED`
- `INFECTED`
- `FAILED`

Download intent chỉ được tạo cho `READY`. Trạng thái khác trả `409 DOCUMENT_NOT_READY` cùng thông báo tiếng Việt an toàn. File không bao giờ được tải từ Quarantine Bucket.

## API contract

### GET `/documents/{documentId}`

Response `200` gồm:

- `documentId`
- `title`
- `originalFileName`
- `contentType`
- `classification`
- `departmentId`
- `ownerId`
- `ownerEmail`
- `sizeBytes`
- `currentVersion`
- `status`
- `statusReason` khi có
- `createdAt`
- `updatedAt`

Response lỗi: `401`, `404`, `500`.

### POST `/documents/{documentId}/download-intents`

Request không cần body. Response `201` gồm:

- `downloadUrl`
- `expiresAt`
- `fileName`

S3 `GetObject` dùng `ResponseContentDisposition` với tên file đã được làm sạch và UTF-8 encoding phù hợp; dùng `ResponseContentType` từ metadata đã lưu.

Response lỗi: `401`, `404`, `409`, `500`.

## Audit

Khi URL được cấp thành công, backend ghi audit append-only:

- `action = DOCUMENT_DOWNLOAD_REQUESTED`
- `actorType = USER`
- `actorId = claims.sub`
- `source = API`
- `outcome = SUCCESS`
- `requestId`
- `documentId`
- `versionNumber`

Audit không lưu presigned URL, S3 key, bucket, token hoặc nội dung file. Không dùng tên `DOCUMENT_DOWNLOADED` vì việc cấp URL chưa chứng minh file đã được tải hoàn tất.

Mỗi request tải là một hành động riêng nên dùng event ID mới; retry do người dùng chủ động bấm lại tạo audit mới.

## Giao diện

- Thêm React Router với route dashboard `/` và trang chi tiết `/documents/:documentId`.
- Bấm tên hoặc dòng tài liệu mở trang chi tiết.
- Trang chi tiết giữ sidebar và header hiện có, có nút quay lại danh sách.
- Hiển thị metadata, trạng thái và lý do trạng thái bằng tiếng Việt.
- Nút **Tải xuống** chỉ bật khi tài liệu `READY`.
- Khi yêu cầu URL, nút hiển thị trạng thái đang xử lý và chống bấm lặp.
- Khi nhận URL, frontend tạo liên kết tạm và kích hoạt tải file.
- Nút tải nhanh trong danh sách gọi cùng client function và vẫn phụ thuộc kiểm tra backend.
- Có trạng thái loading, not-found, non-ready và lỗi hệ thống; nội dung không làm lộ quy tắc phân quyền nội bộ.

## Xử lý lỗi

- DynamoDB item malformed được coi là lỗi hệ thống, không trả dữ liệu một phần.
- Lỗi presigner hoặc audit khiến request trả `500`; không trả URL nếu audit chưa được ghi.
- Frontend không tự retry tạo download intent để tránh tạo nhiều URL và audit ngoài ý muốn.
- Log backend chỉ ghi `requestId`, `documentId`, mã lỗi và tên exception an toàn; không ghi URL hoặc S3 key.

## Kiểm thử

### Backend

- Parse metadata đầy đủ và từ chối record malformed.
- Cho phép owner, người cùng phòng ban và System Admin.
- Department Admin không vượt khỏi phòng ban.
- Trả cùng `404` cho không tồn tại và không có quyền.
- Cho xem metadata của tài liệu chưa `READY`.
- Chỉ cấp URL cho `READY`.
- URL hết hạn 300 giây và dùng Documents Bucket.
- Content-Disposition giữ tên file an toàn.
- Audit đúng action, actor, request ID và không chứa dữ liệu nhạy cảm.
- Không trả URL khi ghi audit thất bại.

### Frontend

- Điều hướng từ danh sách sang trang chi tiết và quay lại.
- Hiển thị metadata thật và trạng thái tiếng Việt.
- Nút tải bị vô hiệu hóa khi tài liệu chưa `READY`.
- Loading, not-found và lỗi tải được hiển thị đúng.
- Download intent thành công kích hoạt liên kết tải.
- Chống bấm lặp trong lúc tạo URL.

### Hạ tầng

- Hai route dùng Cognito authorizer.
- Detail Lambda chỉ có quyền đọc DynamoDB.
- Download Lambda có quyền đọc Documents Bucket và ghi audit DynamoDB.
- Không cấp quyền đọc Quarantine Bucket cho Download Lambda.
- Chạy lint, typecheck, toàn bộ test, build và CDK synth local.

## Tiêu chí hoàn thành

- Người có quyền xem được trang chi tiết bằng dữ liệu thật.
- Owner, cùng phòng ban và System Admin tải được file `READY`.
- Người không có quyền không thể phân biệt tài liệu không tồn tại.
- Tài liệu chưa `READY` không nhận được URL.
- Presigned URL hết hạn sau 5 phút và chỉ trỏ tới Documents Bucket.
- Mỗi URL được cấp thành công có audit an toàn.
- Toàn bộ UI mới dùng tiếng Việt có dấu chuẩn.
- Không deploy AWS khi triển khai local.
