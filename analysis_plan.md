# Kế hoạch triển khai tổng thể - Document Management System

## 1. Mục đích

`analysis_plan.md` là tài liệu quản lý tiến độ trung tâm của dự án DMS. Mọi thay đổi về phạm vi, thứ tự triển khai, phụ thuộc, rủi ro hoặc tiêu chí nghiệm thu phải được cập nhật tại đây.

Kế hoạch triển khai theo các lát cắt chạy được từ React Frontend qua API Gateway và Lambda đến dịch vụ AWS. Không hoàn thiện toàn bộ Frontend trước rồi mới xây AWS backend.

Tài liệu liên quan:

- `instruction.md`: quy tắc kỹ thuật và cách AI làm việc.
- `brainstorming.md`: câu hỏi nghiệp vụ, lựa chọn thiết kế và đề xuất MVP.

## 2. Phạm vi

### Trong phạm vi MVP

- React, TypeScript và Vite Frontend.
- Amazon Cognito authentication.
- Amazon API Gateway và AWS Lambda.
- Amazon S3 lưu file và phiên bản.
- Amazon DynamoDB lưu metadata, sharing, permission và audit log.
- Amazon CloudFront phân phối React static assets.
- Upload bằng presigned URL.
- Validation, checksum và malware scanning bất đồng bộ.
- Quản lý tài liệu và phiên bản.
- Tìm kiếm theo metadata.
- Chia sẻ theo user/phòng ban và phân quyền.
- Audit history.
- Analytics MVP về storage, usage, search và security.
- AWS CDK, CI và môi trường `dev`, `staging`, `production`.

### Ngoài phạm vi MVP

- Tìm kiếm toàn văn trong nội dung PDF/DOCX.
- OCR và trích xuất dữ liệu tự động.
- Machine-learning anomaly detection.
- Chỉnh sửa tài liệu trực tuyến.
- Workflow phê duyệt nâng cao nếu chưa được xác nhận là yêu cầu bắt buộc.
- Mobile application.
- Backend server chạy liên tục bằng Express, NestJS, EC2, ECS hoặc EKS.

## 3. Trạng thái sử dụng

| Trạng thái    | Ý nghĩa                                                        |
| ------------- | -------------------------------------------------------------- |
| `NOT_STARTED` | Chưa bắt đầu                                                   |
| `IN_PROGRESS` | Đang triển khai                                                |
| `BLOCKED`     | Không thể tiếp tục do phụ thuộc hoặc quyết định chưa được chốt |
| `IN_REVIEW`   | Đã hoàn thành triển khai, đang kiểm tra/nghiệm thu             |
| `DONE`        | Đã đạt toàn bộ tiêu chí hoàn thành                             |
| `DEFERRED`    | Chủ động hoãn khỏi phase hiện tại                              |

Quy tắc:

- Chỉ đánh dấu `DONE` khi có bằng chứng kiểm chứng.
- Hạng mục `BLOCKED` phải ghi rõ nguyên nhân và người/nhóm có thể gỡ blocker.
- Không dùng tỷ lệ phần trăm cảm tính để thay cho checklist và acceptance criteria.

## 4. Tổng quan milestone

| ID  | Milestone               | Trạng thái    | Phụ thuộc      | Đầu ra chính                                  |
| --- | ----------------------- | ------------- | -------------- | --------------------------------------------- |
| P0  | Business và Data Policy | `IN_PROGRESS` | Không          | Quyết định P0, permission matrix, file policy |
| P1  | Project Foundation      | `IN_PROGRESS` | P0 tối thiểu   | Workspace, CI, OpenAPI, data model            |
| P2  | AWS Foundation          | `IN_PROGRESS` | P1             | CDK stacks và môi trường dev                  |
| P3  | Authentication Slice    | `IN_PROGRESS` | P2 Cognito/API | React login, `/me`, authorization             |
| P4  | Secure Upload Slice     | `IN_PROGRESS` | P2, P3         | Presigned upload, quarantine, scan            |
| P5  | Document Core           | `NOT_STARTED` | P4             | Metadata, detail, download, delete            |
| P6  | Versioning và Search    | `NOT_STARTED` | P5             | Immutable versions, metadata search           |
| P7  | Sharing và Audit        | `NOT_STARTED` | P5, P6         | Permission, sharing, audit history            |
| P8  | Analytics MVP           | `NOT_STARTED` | Event từ P4-P7 | Metrics, export, dashboard/query              |
| P9  | Hardening và Release    | `NOT_STARTED` | P3-P8          | Staging sign-off, production release          |

## 5. Phase 0 - Business và Data Policy

**Mục tiêu:** Chốt các quyết định ảnh hưởng trực tiếp đến schema, upload pipeline, permission và chi phí trước khi viết code.

**Trạng thái:** `IN_PROGRESS`

### Công việc

- [x] Tạo `instruction.md`.
- [x] Tạo `brainstorming.md`.
- [ ] Chốt allowlist file type.
- [ ] Chốt dung lượng tối đa theo loại file hoặc phòng ban.
- [ ] Chốt giải pháp malware scan và thời gian giữ file nhiễm.
- [ ] Chốt metadata bắt buộc.
- [ ] Chốt classification: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`.
- [ ] Chốt cách xử lý file trùng checksum.
- [ ] Chốt permission matrix theo role và phòng ban.
- [ ] Chốt sharing expiration và quyền chia sẻ tiếp.
- [ ] Chốt soft-delete, retention và permanent deletion.
- [ ] Chốt quyền xem audit/security dashboard.
- [ ] Ghi các quyết định vào `docs/decisions/` dưới dạng ADR.

### Đầu ra

- `docs/file-policy.md`
- `docs/permission-matrix.md`
- `docs/retention-policy.md`
- ADR cho malware scanning.
- Danh sách quyết định P0 được người phụ trách nghiệp vụ phê duyệt.

### Tiêu chí hoàn thành

- Không còn câu hỏi P0 ngăn cản việc thiết kế upload và data model.
- Mỗi policy có owner và ngày review.
- Frontend, Lambda và CDK có thể dùng cùng một tập enum/limit.

### Blocker hiện tại

- Chưa chọn giải pháp malware scanning.
- Chưa xác định giới hạn dung lượng.
- Chưa chốt retention và permission matrix.

## 6. Phase 1 - Project Foundation

**Mục tiêu:** Khởi tạo cấu trúc dự án, contract và công cụ kiểm tra chất lượng.

**Trạng thái:** `IN_PROGRESS`

### Cấu trúc mục tiêu

```text
/
|-- frontend/
|-- aws/
|   |-- functions/
|   |-- infrastructure/
|   `-- config/
|-- contracts/
|-- docs/
|-- sample-data/
|-- instruction.md
|-- brainstorming.md
`-- analysis_plan.md
```

### Công việc

- [x] Khởi tạo root workspace và package scripts.
- [x] Khởi tạo React/TypeScript/Vite trong `frontend/`.
- [x] Khởi tạo TypeScript Lambda workspace trong `aws/functions/`.
- [x] Khởi tạo AWS CDK TypeScript trong `aws/infrastructure/`.
- [x] Bật TypeScript strict cho Frontend, Lambda và CDK.
- [x] Thiết lập formatter, ESLint và import conventions.
- [x] Tạo `contracts/openapi.yaml`.
- [ ] Tạo JSON schemas/type generation strategy.
- [x] Viết `docs/data-model.md` với DynamoDB access patterns.
- [x] Tạo dữ liệu giả lập cho HR, Tech và Sales.
- [ ] Thiết lập CI chạy install, lint, type-check, test và build.
- [x] Tạo `.env.example` nhưng không chứa secret.
- [x] Viết `README.md` với lệnh local development.

### Data model cần chốt

- `User`
- `Department`
- `Document`
- `DocumentVersion`
- `Permission`
- `Share`
- `AuditLog`
- `UploadIntent`
- `DomainEvent`

### Quality gate

- Workspace cài dependency thành công trên môi trường sạch.
- Lint, type-check và test skeleton chạy thành công.
- OpenAPI parse được.
- CDK synth chạy thành công.
- Không có secret trong repository.

### Bằng chứng kiểm chứng

- 2026-06-19: `npm.cmd run lint` thành công.
- 2026-06-19: `npm.cmd run typecheck` thành công cho frontend, functions và infrastructure.
- 2026-06-19: `npm.cmd test` thành công: 6 test files, 22 tests.
- 2026-06-19: `npm.cmd run build` thành công.
- 2026-06-19: `npm.cmd run cdk:synth` thành công.

## 7. Phase 2 - AWS Foundation

**Mục tiêu:** Tạo hạ tầng dev tối thiểu, bảo mật mặc định và có thể triển khai lặp lại.

**Trạng thái:** `IN_PROGRESS`

### CDK stacks đề xuất

- `IdentityStack`: Cognito User Pool, groups, app client.
- `StorageStack`: quarantine bucket, clean/document bucket, lifecycle và encryption.
- `DataStack`: DynamoDB tables/GSI và backup policy.
- `ApiStack`: API Gateway, Lambda integrations và authorizer.
- `FrontendStack`: S3 static bucket, CloudFront OAC và deployment outputs.
- `ObservabilityStack`: log groups, metrics, alarms và dashboards nền tảng.

Không cần tách stack nếu làm tăng complexity cho MVP; ưu tiên dependency rõ và deploy ổn định.

### Công việc

- [ ] Tạo cấu hình `dev`, `staging`, `production`.
- [ ] Tạo Cognito User Pool và groups.
- [ ] Tạo private S3 buckets với block public access.
- [ ] Bật encryption và lifecycle phù hợp.
- [ ] Tạo DynamoDB table/GSI theo access pattern.
- [ ] Tạo API Gateway và Lambda skeleton.
- [ ] Tạo IAM roles theo least privilege.
- [ ] Tạo CloudWatch log retention và alarms cơ bản.
- [ ] Tạo CloudFront distribution với OAC.
- [ ] Xuất runtime config cần thiết cho React mà không lộ secret.
- [ ] Quyết định VPC có thực sự cần cho MVP hay không.
- [ ] Nếu dùng VPC, tạo private subnets đa AZ và Gateway Endpoint cho S3/DynamoDB.

### Quality gate

- CDK assertions kiểm tra bucket không public và encryption được bật.
- `cdk synth` không lỗi.
- Deploy `dev` lặp lại không tạo tài nguyên ngoài dự kiến.
- Có hướng dẫn destroy tài nguyên dev và bảo vệ production.
- IAM review không có wildcard rộng không cần thiết.

## 8. Phase 3 - Authentication Slice

**Mục tiêu:** Hoàn thành lát cắt đăng nhập từ React đến API được bảo vệ.

**Trạng thái:** `IN_PROGRESS`

### React Frontend

- [x] Tạo login/logout UI.
- [x] Tích hợp Cognito session và token refresh.
- [x] Tạo protected route.
- [x] Tạo auth context/hook.
- [x] Hiển thị loading, invalid session và access-denied states.
- [ ] Không lưu refresh token vào nơi không an toàn.

### AWS backend

- [x] Cấu hình Cognito authorizer cho API Gateway.
- [x] Tạo `GET /me`.
- [ ] Chuẩn hóa authentication context trong Lambda.
- [x] Ánh xạ Cognito `sub`, group và department.
- [x] Chuẩn hóa response lỗi `401`, `403`, `404`.
- [ ] Ghi audit event đăng nhập/truy cập API phù hợp.

### Test scenarios

- [x] Đăng nhập thành công.
- [x] Sai mật khẩu.
- [x] Token thiếu, sai hoặc hết hạn.
- [ ] User bị disabled.
- [x] User thiếu department hoặc role cần thiết.
- [x] Protected route không hiển thị chớp nội dung nhạy cảm.

### Tiêu chí hoàn thành

- React gọi được `/me` bằng JWT hợp lệ.
- API từ chối request không hợp lệ.
- Authorization không phụ thuộc việc React ẩn nút.

### Bằng chứng kiểm chứng

- 2026-06-19: Frontend auth tests, login page tests, dashboard tests và API client session-expired test đều pass trong `npm.cmd test`.
- 2026-06-19: Lambda `GET /me` tests pass trong `npm.cmd test`.
- 2026-06-19: CDK assertions cho Cognito/API/Lambda foundation pass trong `npm.cmd test`.

## 9. Phase 4 - Secure Upload Slice

**Mục tiêu:** Upload file an toàn bằng presigned URL và chỉ phát hành file sau validation/malware scan.

**Trạng thái:** `IN_PROGRESS`

### API và Lambda

- [x] Cài đặt `POST /documents/upload-intents`.
- [x] Validate title, department, classification và file policy.
- [x] Tạo `documentId`, `versionNumber`, S3 key và presigned URL.
- [x] Lưu `UploadIntent` với TTL.
- [x] Xác minh S3 object sau upload.
- [x] Tính/xác minh checksum SHA-256.
- [x] Kiểm tra extension, MIME và file signature.
- [x] Chạy malware scan bất đồng bộ.
- [x] Đưa S3 ObjectCreated qua SQS và cấu hình DLQ/retry.
- [x] Tích hợp GuardDuty Malware Protection for S3 và đọc scan-result tag.
- [x] Chỉ sao chép file `NO_THREATS_FOUND`; cách ly file `THREATS_FOUND`.
- [x] Tạo CloudWatch Alarm, SNS topic và email subscription tùy chọn.
- [x] Cập nhật state machine idempotent.
- [x] Xóa object trong quarantine sau 7 ngày bằng S3 Lifecycle.

### React Frontend

- [x] Tạo form metadata.
- [x] Validate sơ bộ file type và size.
- [x] Upload trực tiếp S3.
- [ ] Hiển thị progress, cancel và retry.
- [x] Poll trạng thái xử lý mỗi 5 giây khi còn tài liệu chưa ở trạng thái kết thúc.
- [x] Hiển thị rõ `SCANNING`, `READY`, `REJECTED`, `INFECTED`, `FAILED`.
- [x] Hiển thị danh sách tài liệu thật từ API thay cho dữ liệu mẫu.

### P4.5 - Danh sách và trạng thái tài liệu

- [x] Tạo `GET /documents` được bảo vệ bằng Cognito.
- [x] Query tối đa 50 tài liệu mới nhất theo phòng ban qua `gsi1`.
- [x] Thêm Lambda và quyền đọc DynamoDB trong CDK.
- [x] Refresh danh sách ngay sau upload thành công.
- [x] Dừng polling khi mọi tài liệu đã ở trạng thái kết thúc.
- [x] Thêm trạng thái loading, empty và lỗi bằng tiếng Việt.
- [x] Đồng bộ OpenAPI contract.

### P4.6 - Kiểm tra chữ ký và định dạng file

- [x] Nhận diện PDF, DOCX, XLSX, PNG và JPEG bằng nội dung thật.
- [x] Chặn ZIP đổi đuôi DOCX/XLSX và file có extension/MIME không khớp.
- [x] Dùng một buffer cho checksum và nhận diện định dạng.
- [x] Chuyển file giả mạo sang `REJECTED` trước bước GuardDuty.
- [x] Trả `statusReason` an toàn qua API và hiển thị trên dashboard.
- [x] Bổ sung test detector, pipeline và API/UI.

### P4.7 - Audit vòng đời upload và xử lý DLQ

- [x] Ghi audit append-only cho các transition upload quan trọng.
- [x] Dùng event ID ổn định để retry không tạo audit trùng.
- [x] Tự bù audit khi trạng thái cuối đã được cập nhật trước một lần retry.
- [x] Tạo Lambda consumer riêng cho upload DLQ với partial batch failure.
- [x] Chuyển tài liệu chưa kết thúc sang `FAILED` khi message vào DLQ.
- [x] Không ghi đè tài liệu đã `READY`, `REJECTED`, `INFECTED` hoặc `FAILED`.
- [x] Gửi SNS an toàn, không chứa payload SQS, S3 key hoặc nội dung file.
- [x] Ghi `MESSAGE_DEAD_LETTERED` và cảnh báo cả message malformed.

### Trạng thái bắt buộc

```text
UPLOAD_PENDING -> UPLOADED -> VALIDATING -> SCANNING -> READY
                                             |-> INFECTED
                         |-> REJECTED
                         |-> FAILED
```

### Edge cases

- [x] Event S3 đến nhiều lần sau khi tài liệu đã `READY` hoặc `INFECTED`.
- [ ] Upload hoàn tất sau khi intent hết hạn.
- [x] Checksum không khớp.
- [ ] Scan timeout hoặc kết quả không xác định.
- [ ] User bị khóa khi file đang xử lý.
- [ ] File trùng checksum nhưng user không có quyền xem bản gốc.

### Tiêu chí hoàn thành

- File chưa `READY` không thể download.
- Executable/script bị chặn.
- File trùng không bị ghi đè âm thầm.
- Pipeline retry không tạo metadata/version trùng.
- Mọi transition quan trọng có audit event.

### Bằng chứng kiểm chứng

- 2026-06-19: `npm.cmd run typecheck` thành công.
- 2026-06-19: `npm.cmd test` thành công: 8 test files, 30 tests.
- 2026-06-19: `npm.cmd run lint` thành công.
- 2026-06-19: `npm.cmd run build` thành công.
- 2026-06-19: `npm.cmd run cdk:synth` thành công, có route `POST /documents/upload-intents`, Lambda `UploadIntentFunction`, Lambda `UploadProcessorFunction`, S3 ObjectCreated notification và S3 CORS cho quarantine bucket.
- 2026-06-20: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build` và `npm.cmd run cdk:synth` đều thành công.
- 2026-06-20: 9 test files, 38 tests pass; bao phủ GuardDuty CLEAN/INFECTED/FAILED/PENDING, SQS partial batch retry, DLQ, SNS và CloudWatch alarms.
- 2026-06-20: CDK synth có SQS queue + DLQ, `AWS::GuardDuty::MalwareProtectionPlan`, ba CloudWatch alarm, SNS topic và S3 Lifecycle 7 ngày.
- 2026-06-20: P4.5 local hoàn tất `GET /documents`, query `gsi1`, dashboard dữ liệu thật và polling 5 giây.
- 2026-06-20: P4.5 lint, typecheck, build và CDK synth thành công; 12 test files với 49 tests pass.
- 2026-06-20: P4.6 local hoàn tất file signature cho PDF/DOCX/XLSX/PNG/JPEG và hiển thị `statusReason`.
- 2026-06-20: P4.6 lint, typecheck, build và CDK synth thành công; 13 test files với 61 tests pass.
- 2026-06-20: Upload Processor được esbuild bundle thành ESM khoảng 151 KB, có kèm dependency `file-type`.
- 2026-06-21: P4.7 local hoàn tất audit append-only cho vòng đời upload và Lambda xử lý DLQ tự động.
- 2026-06-21: Lint, typecheck, build và CDK synth thành công; 16 test files với 71 tests pass.
- 2026-06-21: Template synth có hai SQS event source dùng partial batch failure, handler `process-upload-dlq`, quyền DynamoDB và `sns:Publish`.

### Phần còn lại

- Xác nhận SNS email subscription sau khi deploy.
- Chạy smoke test GuardDuty thực tế trên AWS với file sạch và file kiểm thử an toàn.

## 10. Phase 5 - Document Core

**Mục tiêu:** Hoàn thành thao tác cơ bản trên tài liệu đã upload.

**Trạng thái:** `IN_PROGRESS`

### API

- [ ] `POST /documents`
- [x] `GET /documents`
- [x] `GET /documents/{documentId}`
- [ ] `PATCH /documents/{documentId}`
- [ ] `DELETE /documents/{documentId}`
- [x] `POST /documents/{documentId}/download-intents`

### React Frontend

- [x] Dashboard tài liệu gần đây.
- [ ] Danh sách tài liệu có pagination.
- [x] Trang chi tiết tài liệu.
- [ ] Cập nhật metadata có kiểm tra quyền.
- [x] Download trạng thái hợp lệ.
- [ ] Soft delete và restore nếu policy cho phép.
- [x] Empty, loading, error và forbidden states cho luồng chi tiết/tải xuống.

### Authorization matrix tối thiểu

| Action        |          Owner | Shared VIEW | Shared EDIT | Department Admin | System Admin |
| ------------- | -------------: | ----------: | ----------: | ---------------: | -----------: |
| View metadata |             Có |          Có |          Có |   Theo phòng ban |           Có |
| Download      |             Có |  Theo quyền |  Theo quyền |   Theo phòng ban |  Theo policy |
| Edit metadata |             Có |       Không |          Có |   Theo phòng ban |           Có |
| Delete        | Có/theo policy |       Không |       Không |   Theo phòng ban |           Có |
| Share         |     Theo quyền |       Không |  Theo quyền |   Theo phòng ban |           Có |

Bảng này chỉ là baseline và phải được thay bằng permission matrix đã phê duyệt ở P0.

### Quality gate

- Không thể suy đoán tài liệu không có quyền từ response khác biệt không cần thiết.
- Presigned download URL có thời hạn ngắn.
- Pagination dùng opaque cursor.
- Audit log ghi actor, resource, action, outcome và request ID.

### P5.1 - Chi tiết và tải tài liệu an toàn

- [x] Thêm `GET /documents/{documentId}` với kiểm tra owner, phòng ban và `SYSTEM_ADMIN`.
- [x] Thêm `POST /documents/{documentId}/download-intents` cho tài liệu `READY`.
- [x] Presigned URL chỉ đọc Documents Bucket và hết hạn sau 5 phút.
- [x] Ghi audit append-only `DOCUMENT_DOWNLOAD_REQUESTED` không chứa URL hoặc S3 key.
- [x] Trả cùng `404` cho tài liệu không tồn tại và tài liệu không có quyền.
- [x] Thêm trang chi tiết riêng, tải nhanh và các trạng thái loading/error/non-ready.
- [x] Đồng bộ OpenAPI và CDK với hai Lambda có IAM tách biệt.
- 2026-06-21: lint, typecheck, build và CDK synth local thành công; 21 test files với 96 tests pass.
- 2026-06-21: dependency production audit không còn lỗ hổng sau khi nâng bản vá Cognito; lần xác minh online cuối bị timeout registry.

## 11. Phase 6 - Versioning và Search

**Mục tiêu:** Quản lý version bất biến và tìm kiếm metadata hiệu quả.

**Trạng thái:** `NOT_STARTED`

### Versioning

- [ ] `GET /documents/{documentId}/versions`.
- [ ] `POST /documents/{documentId}/versions/upload-intents`.
- [ ] `POST /documents/{documentId}/versions`.
- [ ] Dùng conditional write để cấp version number.
- [ ] Không ghi đè object của version đã phát hành.
- [ ] Lưu checksum, size, MIME, change note và creator.
- [ ] Cho phép tải đúng version nếu đủ quyền.

### Search

- [ ] Chuẩn hóa title, tags và filter fields.
- [ ] Tạo GSI/index theo access patterns đã chốt.
- [ ] Cài đặt `GET /search`.
- [ ] Hỗ trợ filter department, owner, type, classification, tags và updated time.
- [ ] Không scan toàn bộ DynamoDB table trong production.
- [ ] Ghi event search có kiểm soát riêng tư.

### Metrics

- [ ] Search count.
- [ ] Zero-result rate.
- [ ] Search-to-open conversion.
- [ ] Time-to-find.

### Quality gate

- Hai upload đồng thời không nhận cùng version number.
- Search pagination không mất hoặc lặp dữ liệu ngoài giới hạn chấp nhận.
- Không lưu query nhạy cảm nếu policy chưa cho phép.

## 12. Phase 7 - Quản trị người dùng

**Mục tiêu:** Cho System Admin quản lý tài khoản nội bộ từ trang Quản trị, với Cognito là nguồn dữ liệu thật và Lambda là nơi kiểm tra quyền.

**Trạng thái:** `IN_PROGRESS`

### Phạm vi đã hoàn thành

- [x] P7.1 - Tạo giao diện Quản trị người dùng nội bộ bằng dữ liệu mô phỏng.
- [x] P7.2 - Đọc danh sách user thật từ AWS Cognito qua `GET /admin/users`.
- [x] Chỉ System Admin được truy cập API quản trị người dùng.
- [x] Hiển thị thống kê tổng người dùng, System Admin, Department Admin và Nhân viên.
- [x] Thêm trạng thái loading, lỗi và nút làm mới danh sách người dùng.

### P7.3 - Tạo user từ trang Quản trị

- [x] Tạo form hoặc modal tạo người dùng ngay trong trang Quản trị.
- [x] Nhập email, tên hiển thị, phòng ban và vai trò ban đầu.
- [x] Tạo user trong Cognito bằng Lambda backend, không gọi AWS SDK trực tiếp từ React.
- [x] Gán group Cognito tương ứng với vai trò.
- [x] Đặt mật khẩu do admin nhập theo policy Cognito.
- [x] Hiển thị lỗi tiếng Việt rõ ràng khi email trùng, password sai policy hoặc thiếu quyền.
- [x] Ghi log vận hành cho thao tác tạo user, không ghi mật khẩu hoặc token.

### P7.4 - Đổi phòng ban và vai trò người dùng

- [x] Bật nút đổi vai trò ở từng dòng người dùng.
- [x] Tạo modal chọn phòng ban và vai trò mới.
- [x] Cập nhật `custom:departmentId` trong Cognito bằng Lambda backend.
- [x] Đồng bộ group vai trò Cognito: gỡ role cũ của hệ thống và thêm role mới.
- [x] Làm mới danh sách người dùng sau khi lưu thành công.
- [x] Ghi log vận hành cho thao tác cập nhật user, không ghi token.

### P7.5 - Khóa, mở khóa và reset mật khẩu người dùng

- [x] Bật thao tác khóa tài khoản với user đang hoạt động.
- [x] Bật thao tác mở khóa với user đang bị khóa.
- [x] Thêm modal reset mật khẩu người dùng.
- [x] Gọi Cognito `AdminDisableUser`, `AdminEnableUser` và `AdminSetUserPassword` qua Lambda backend.
- [x] Không cho System Admin tự khóa tài khoản đang đăng nhập.
- [x] Làm mới danh sách người dùng sau thao tác thành công.

### Các bước sau P7.5

### P7.6 - Đồng bộ trạng thái tài khoản trong trang Quản trị

- [x] Hiển thị thống kê tài khoản đang hoạt động và đã khóa.
- [x] Thêm bộ lọc trạng thái tài khoản trong danh sách người dùng.
- [x] Giữ nhãn trạng thái từng dòng là `Đang hoạt động` hoặc `Đã khóa`.
- [x] Làm mới danh sách người dùng sau thao tác khóa/mở khóa/reset mật khẩu.
- [x] Sửa mô tả trang Quản trị để phản ánh chức năng Cognito hiện có.

### Các bước sau P7.6

### P7.7 - Đồng bộ hiệu lực quyền người dùng

- [x] Hiển thị cảnh báo quyền theo phòng ban/vai trò mới có hiệu lực sau khi người dùng đăng nhập lại.
- [x] Thêm ghi chú trong modal `Đổi vai trò`.
- [x] Sau khi cập nhật user thành công, nhắc rõ người dùng cần đăng nhập lại để nhận quyền mới.
- [x] Giữ phạm vi gọn, không đổi backend/API và không thu hồi token đang còn hạn.

### Các bước sau P7.7

### P7.8 - Thu hồi phiên khi đổi quyền hoặc khóa tài khoản

- [x] Gọi `AdminUserGlobalSignOut` sau khi khóa tài khoản.
- [x] Gọi `AdminUserGlobalSignOut` sau khi reset mật khẩu.
- [x] Gọi `AdminUserGlobalSignOut` sau khi đổi phòng ban hoặc vai trò.
- [x] Không thu hồi phiên khi mở khóa tài khoản.
- [x] Thêm IAM permission `cognito-idp:AdminUserGlobalSignOut` cho Lambda quản trị.
- [x] Cập nhật thông báo UI để admin biết phiên cũ đã bị thu hồi.

### Các bước sau P7.8

### P7.9 - Lịch sử quản trị người dùng

- [x] Ghi audit log có cấu trúc cho thao tác tạo user.
- [x] Ghi audit log có cấu trúc cho thao tác đổi phòng ban/vai trò.
- [x] Ghi audit log có cấu trúc cho thao tác khóa, mở khóa và reset mật khẩu.
- [x] Lưu audit metadata trong DynamoDB, không lưu password, token hoặc dữ liệu nhạy cảm.
- [x] Thêm API `GET /admin/users/audit-events` chỉ cho System Admin.
- [x] Thêm trang UI riêng `Lịch sử quản trị`.
- [x] Hiển thị 10 thao tác quản trị gần nhất với nhãn tiếng Việt.
- [x] Thêm trạng thái loading, lỗi, empty state và nút làm mới.
- [x] Cập nhật OpenAPI contract và CDK route/IAM tương ứng.
- [x] Bổ sung unit test cho service audit, handler API, client API, UI và CDK.

### Các bước sau P7.9

- [ ] P7.10 - Cân nhắc bộ lọc/phân trang/export cho lịch sử quản trị nếu danh sách thao tác tăng nhiều.

### Quality gate

- React chỉ gửi yêu cầu quản trị; Cognito authorizer và Lambda vẫn quyết định quyền.
- Không commit secret, password thật hoặc thông tin nhạy cảm.
- API quản trị trả lỗi `401`, `403`, `409` và `500` rõ ràng.
- Unit test bao phủ service Cognito, handler API và UI admin.
- Audit log quản trị không chứa password, token hoặc presigned URL.

## 13. Phase 8 - Analytics MVP

**Mục tiêu:** Tạo dữ liệu phân tích đáng tin cậy mà không làm chậm request chính.

**Trạng thái:** `NOT_STARTED`

### Event foundation

- [ ] Chốt event schema version 1.
- [ ] Tạo `eventId` và deduplication strategy.
- [ ] Phân biệt audit event và product analytics event.
- [ ] Không lưu nội dung tài liệu, token hoặc presigned URL.
- [ ] Ghi UTC timestamp, actor, department, document, version và outcome.

### MVP pipeline

- [ ] Export/snapshot dữ liệu cần thiết sang S3 analytics zone.
- [ ] Partition dữ liệu theo ngày và event type.
- [ ] Cấu hình retention và lifecycle.
- [ ] Tạo truy vấn Athena hoặc công cụ tương đương.
- [ ] Đối soát metric với dữ liệu vận hành.

### Metrics ưu tiên

- [ ] Total storage và growth rate.
- [ ] Storage theo phòng ban và file type.
- [ ] Upload/download trend.
- [ ] Active users theo kỳ.
- [ ] Zero-result rate và search success.
- [ ] Access denied và bulk download alerts.
- [ ] Malware findings.
- [ ] Orphan object và duplicate bytes.

### Dashboard/Reporting

- [ ] Dashboard quản trị hệ thống.
- [ ] Dashboard phòng ban có row-level access.
- [ ] Dashboard bảo mật.
- [ ] Báo cáo tổng hợp cho ban giám đốc.

### Quality gate

- Mỗi metric có công thức, owner, nguồn, timezone và retention.
- Dashboard không lộ dữ liệu giữa phòng ban.
- Event trùng hoặc đến muộn không làm sai số liệu ngoài tolerance đã định.
- Analytics failure không làm thất bại upload/download request.

## 14. Phase 9 - Hardening và Release

**Mục tiêu:** Xác nhận hệ thống đủ an toàn, quan sát được và có thể vận hành.

**Trạng thái:** `NOT_STARTED`

### Functional validation

- [ ] Chạy toàn bộ unit test.
- [ ] Chạy Lambda integration tests.
- [ ] Chạy React component và E2E tests.
- [ ] Chạy CDK assertions.
- [ ] Kiểm tra OpenAPI contract compatibility.

### Security validation

- [ ] Review IAM least privilege.
- [ ] Kiểm tra bucket public access và encryption.
- [ ] Kiểm tra authorization path cho mọi endpoint.
- [ ] Kiểm tra CORS theo môi trường.
- [ ] Kiểm tra log không chứa secret/token/URL nhạy cảm.
- [ ] Thử file nguy hiểm, extension kép và MIME mismatch.
- [ ] Kiểm tra rate limit và bulk download rule.

### Reliability validation

- [ ] Thử S3, DynamoDB và malware scan failure.
- [ ] Thử duplicate event và Lambda retry.
- [ ] Thử concurrent version creation.
- [ ] Kiểm tra backup/restore DynamoDB.
- [ ] Kiểm tra lifecycle và cleanup job.

### Release

- [ ] Deploy staging.
- [ ] Seed dữ liệu giả lập.
- [ ] Chạy user acceptance testing.
- [ ] Ghi nhận sign-off.
- [ ] Chuẩn bị migration/runbook/rollback.
- [ ] Deploy production.
- [ ] Theo dõi metrics và alarms sau release.

## 15. Test strategy tổng thể

| Lớp              | Công cụ/kiểu test               | Phạm vi                                        |
| ---------------- | ------------------------------- | ---------------------------------------------- |
| Domain           | Unit test                       | Permission, version, validation, state machine |
| Lambda handler   | Unit/integration                | Request mapping, auth context, error response  |
| AWS repositories | Integration                     | DynamoDB keys, conditional writes, S3 metadata |
| CDK              | Assertions/snapshot có chọn lọc | Security configuration và resources            |
| React components | Component test                  | Form, state, permission presentation           |
| User journey     | E2E                             | Login, upload, search, download, share         |
| Contract         | OpenAPI validation              | Frontend-Lambda compatibility                  |
| Security         | Negative tests                  | Unauthorized, forbidden, malicious input       |
| Analytics        | Data reconciliation             | Event completeness và metric accuracy          |

## 16. Rủi ro và phương án giảm thiểu

| ID  | Rủi ro                            | Mức độ     | Giảm thiểu                                   | Trạng thái |
| --- | --------------------------------- | ---------- | -------------------------------------------- | ---------- |
| R1  | Chưa chốt malware scanner         | Cao        | ADR và proof of concept ở P0/P2              | Mở         |
| R2  | Permission matrix mơ hồ           | Cao        | Workshop và test matrix trước P5             | Mở         |
| R3  | File lớn làm tăng timeout/chi phí | Cao        | Presigned URL, limit và async processing     | Mở         |
| R4  | Event lặp tạo version trùng       | Cao        | Idempotency và conditional write             | Mở         |
| R5  | Search DynamoDB không đáp ứng     | Trung bình | Chốt access pattern/GSI, đo trước OpenSearch | Mở         |
| R6  | Analytics lộ dữ liệu phòng ban    | Cao        | Aggregate, row-level access, privacy review  | Mở         |
| R7  | Dashboard metric sai              | Trung bình | Data contract và reconciliation tests        | Mở         |
| R8  | Chi phí VPC/NAT không cần thiết   | Trung bình | Chỉ thêm VPC/NAT khi có yêu cầu              | Mở         |
| R9  | Scope workflow phê duyệt phình to | Trung bình | Giữ ngoài MVP đến khi được ưu tiên           | Mở         |
| R10 | Audit log chứa dữ liệu nhạy cảm   | Cao        | Structured schema và redaction tests         | Mở         |

## 17. Quyết định đang mở

| ID  | Câu hỏi                                   | Mức ưu tiên | Owner               | Hạn chốt | Trạng thái |
| --- | ----------------------------------------- | ----------- | ------------------- | -------- | ---------- |
| D1  | Dùng giải pháp nào để malware scan?       | P0          | IT Security         | TBD      | Mở         |
| D2  | Giới hạn file theo loại/phòng ban?        | P0          | Business + IT       | TBD      | Mở         |
| D3  | Retention và soft-delete bao lâu?         | P0          | Legal + Business    | TBD      | Mở         |
| D4  | Permission matrix chính thức?             | P0          | Business Owner      | TBD      | Mở         |
| D5  | Department lấy từ Cognito hay HR system?  | P0          | HR + IT             | TBD      | Mở         |
| D6  | Cho phép `.zip`, CAD, video không?        | P0          | Business + Security | TBD      | Mở         |
| D7  | Dashboard MVP dùng Athena hay QuickSight? | P1          | Product Owner       | TBD      | Mở         |
| D8  | Workflow duyệt có thuộc MVP không?        | P1          | Product Owner       | TBD      | Mở         |
| D9  | Có được lưu search query thô không?       | P1          | Privacy/Security    | TBD      | Mở         |

## 18. Nhịp quản lý kế hoạch

### Khi bắt đầu một hạng mục

1. Xác nhận phase và dependency đã sẵn sàng.
2. Chuyển trạng thái sang `IN_PROGRESS`.
3. Ghi owner và phạm vi file/module.
4. Xác nhận acceptance criteria và lệnh validation.

### Khi hoàn thành một hạng mục

1. Đánh dấu checklist tương ứng.
2. Ghi bằng chứng: test, build, deploy output hoặc tài liệu nghiệm thu.
3. Cập nhật risk/decision nếu phát sinh.
4. Chuyển `IN_REVIEW`, sau đó chỉ chuyển `DONE` khi đạt quality gate.

### Báo cáo tiến độ đề xuất

```text
Kỳ báo cáo:
Milestone hiện tại:
Đã hoàn thành:
Đang thực hiện:
Blocked:
Quyết định cần chốt:
Rủi ro mới:
Kế hoạch kỳ tiếp theo:
Bằng chứng kiểm chứng:
```

## 19. Definition of Done toàn dự án

DMS MVP chỉ được xem là hoàn thành khi:

- React Frontend build và E2E tests thành công.
- Cognito authentication và Lambda authorization hoạt động đúng.
- File upload qua presigned URL, được validate và scan trước `READY`.
- Version cũ không bị ghi đè.
- Search metadata không scan toàn bảng production.
- Sharing và permission matrix được enforcement ở Lambda.
- Audit log ghi đủ thao tác nhạy cảm.
- Analytics metrics ưu tiên đã được đối soát.
- CDK có thể triển khai staging/production lặp lại.
- IAM, S3, DynamoDB, CloudFront và API Gateway vượt qua security review.
- Có monitoring, alarms, backup, runbook và rollback.
- Không có secret hoặc dữ liệu thật trong repository.
- Tài liệu kỹ thuật và hướng dẫn vận hành được cập nhật.
- Product Owner, IT Security và đại diện nghiệp vụ đã sign-off.

## 20. Cập nhật gần nhất

| Ngày       | Thay đổi                              | Người cập nhật |
| ---------- | ------------------------------------- | -------------- |
| 2026-07-01 | Hoàn tất P7.9 lịch sử quản trị người dùng | Codex          |
| 2026-06-19 | Khởi tạo kế hoạch triển khai tổng thể | Codex          |
