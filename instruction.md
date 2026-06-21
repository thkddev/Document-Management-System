# Hướng dẫn làm việc cho AI - Document Management System

## 1. Mục tiêu dự án

Xây dựng Document Management System (DMS) cho nhân viên trong công ty với các chức năng:

- Đăng nhập và quản lý phiên làm việc.
- Upload PDF, DOCX, XLSX, hình ảnh và các định dạng được cho phép.
- Quản lý nhiều phiên bản của cùng một tài liệu.
- Tìm kiếm tài liệu theo metadata.
- Chia sẻ tài liệu cho cá nhân hoặc phòng ban.
- Phân quyền xem, tải xuống, cập nhật, chia sẻ và quản trị.
- Theo dõi lịch sử thao tác phục vụ kiểm tra và truy vết.

Các nhóm nghiệp vụ mẫu:

- Nhân sự: hợp đồng lao động, biểu mẫu và chính sách.
- Kỹ thuật: tài liệu thiết kế, đặc tả và hướng dẫn vận hành.
- Kinh doanh: báo giá, hợp đồng và tài liệu khách hàng.

## 2. Hiện trạng repository

Repository hiện chỉ chứa công cụ và tài liệu kiến trúc:

- `build-dms-architecture.mjs`: sinh sơ đồ AWS tổng quan.
- `build-dms-vpc-architecture.mjs`: sinh sơ đồ AWS có Region, VPC và subnet.
- `DMS-AWS-Architecture.pptx`: sơ đồ kiến trúc tổng quan.
- `DMS-AWS-VPC-Architecture.pptx`: sơ đồ kiến trúc VPC.
- `package.json`: dependency phục vụ PaperJSX.

Chưa có mã nguồn React Frontend, AWS serverless backend, Infrastructure as Code hoặc dữ liệu nghiệp vụ. AI không được giả định rằng các module này đã tồn tại; phải kiểm tra repository trước mỗi thay đổi.

## 3. Kiến trúc mục tiêu

### Frontend

- Frontend bắt buộc dùng React, TypeScript và Vite.
- React là ứng dụng single-page application; không thêm Next.js hoặc server-side rendering nếu chưa có ADR được phê duyệt.
- Host static assets trong private S3 bucket.
- CloudFront phân phối nội dung bằng Origin Access Control.
- Cognito User Pool thực hiện đăng nhập và phát hành JWT.
- Frontend gọi API Gateway bằng access token hợp lệ.
- Upload/download file trực tiếp với S3 thông qua presigned URL; không chuyển file lớn qua Lambda.
- Không gọi trực tiếp DynamoDB hoặc các API quản trị AWS từ trình duyệt.

### AWS serverless backend

- Backend không phải một máy chủ web chạy liên tục; backend là tập hợp dịch vụ AWS serverless được quản lý bằng Infrastructure as Code.
- Amazon API Gateway cung cấp REST API và sử dụng Cognito authorizer.
- AWS Lambda thực thi nghiệp vụ, authorization, validation và orchestration. Mã Lambda dùng Node.js, TypeScript và AWS SDK for JavaScript v3.
- Amazon DynamoDB lưu metadata, phiên bản, quyền chia sẻ và audit log.
- Amazon S3 lưu file gốc và các phiên bản tài liệu.
- Amazon Cognito quản lý người dùng, nhóm và JWT.
- Amazon CloudWatch lưu log, metrics và alarm.
- Amazon CloudFront phân phối React static assets từ S3.
- Không thêm Express, NestJS, EC2, ECS, EKS, container backend hoặc RDS nếu chưa có yêu cầu nghiệp vụ và ADR được phê duyệt.
- Không đưa business logic vào API Gateway mapping template hoặc React; business logic thuộc Lambda service/domain layer.

### Infrastructure

- Dùng AWS CDK với TypeScript làm lựa chọn mặc định.
- Tách cấu hình theo môi trường `dev`, `staging` và `production`.
- Nếu triển khai kiến trúc VPC, Lambda dùng private subnet ở ít nhất hai Availability Zone.
- Không đặt Lambda trong public subnet.
- Dùng Gateway VPC Endpoint cho S3 và DynamoDB.
- NAT Gateway chỉ được thêm khi Lambda thực sự cần truy cập Internet hoặc dịch vụ ngoài AWS.
- CloudFront là dịch vụ global; Cognito, API Gateway, Lambda, DynamoDB và S3 là dịch vụ regional nằm ngoài ranh giới VPC.

## 4. Cấu trúc thư mục mục tiêu

```text
/
|-- frontend/
|   |-- src/
|   |   |-- app/
|   |   |-- components/
|   |   |-- features/
|   |   |   |-- auth/
|   |   |   |-- documents/
|   |   |   |-- search/
|   |   |   |-- sharing/
|   |   |   `-- audit/
|   |   |-- hooks/
|   |   |-- lib/
|   |   |-- pages/
|   |   `-- types/
|   `-- tests/
|-- aws/
|   |-- functions/
|   |   |-- src/
|   |   |   |-- handlers/
|   |   |   |-- domain/
|   |   |   |-- repositories/
|   |   |   |-- services/
|   |   |   |-- middleware/
|   |   |   |-- validation/
|   |   |   `-- shared/
|   |   `-- tests/
|   |-- infrastructure/
|   |   |-- bin/
|   |   |-- lib/
|   |   `-- test/
|   `-- config/
|-- contracts/
|   |-- openapi.yaml
|   `-- schemas/
|-- docs/
|-- sample-data/
`-- instruction.md
```

Không tạo abstraction hoặc thư mục mới nếu chưa giải quyết một nhu cầu thực tế. Ưu tiên cấu trúc đơn giản, có ownership rõ ràng.

## 5. Mô hình nghiệp vụ cốt lõi

### User

- `userId`: Cognito `sub`, không dùng email làm khóa chính.
- `email`, `displayName`, `departmentId`.
- `roles`: ví dụ `EMPLOYEE`, `DEPARTMENT_ADMIN`, `SYSTEM_ADMIN`.
- `status`: `ACTIVE` hoặc `DISABLED`.

### Document

- `documentId`: UUID ổn định cho toàn bộ vòng đời tài liệu.
- `name`, `description`, `departmentId`, `ownerId`.
- `contentType`, `extension`, `size`.
- `tags`, `status`, `currentVersion`.
- `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.

### DocumentVersion

- `documentId`, `versionNumber`.
- `s3Key`, `size`, `checksum`, `contentType`.
- `changeNote`, `createdAt`, `createdBy`.
- Một phiên bản đã phát hành không được ghi đè; phiên bản mới phải tạo S3 object mới.

### Permission và Share

- Principal có thể là `USER` hoặc `DEPARTMENT`.
- Quyền tối thiểu: `VIEW`, `DOWNLOAD`, `EDIT`, `SHARE`, `ADMIN`.
- Share có thể có `expiresAt` và trạng thái thu hồi.
- Cognito authorizer và Lambda luôn là nơi quyết định quyền; không tin dữ liệu role hoặc owner do React gửi lên.

### AuditLog

- Ghi `actorId`, `action`, `resourceType`, `resourceId`, `timestamp`.
- Ghi thêm `requestId`, IP hoặc user agent khi có sẵn và phù hợp chính sách riêng tư.
- Các action quan trọng: login, upload, download, create version, share, revoke, permission change, delete và restore.
- Audit log là append-only; API thông thường không được cập nhật hoặc xóa log.

## 6. Quy ước S3 và DynamoDB

### S3

Key file tài liệu nên theo mẫu:

```text
documents/{documentId}/versions/{versionNumber}/{sanitizedFileName}
```

Quy tắc bắt buộc:

- Bucket không public.
- Bật encryption at rest và block public access.
- Presigned URL có thời hạn ngắn và chỉ cấp sau khi kiểm tra quyền.
- Validate extension, MIME type, kích thước và tên file ở cả React Frontend lẫn Lambda.
- Không đưa email, tên nhân viên hoặc dữ liệu nhạy cảm vào S3 key.
- Cân nhắc S3 Versioning như lớp bảo vệ bổ sung, nhưng version nghiệp vụ vẫn phải được quản lý trong DynamoDB.

### DynamoDB

Thiết kế schema dựa trên access pattern, không dựa trên mô hình quan hệ truyền thống. Tối thiểu phải hỗ trợ:

- Lấy tài liệu theo `documentId`.
- Liệt kê tài liệu theo owner hoặc phòng ban.
- Liệt kê các phiên bản của một tài liệu theo thứ tự giảm dần.
- Tìm tài liệu theo metadata đã chuẩn hóa.
- Liệt kê tài liệu được chia sẻ với user hoặc phòng ban.
- Liệt kê audit log theo tài liệu hoặc actor và khoảng thời gian.

Mọi thay đổi key schema hoặc GSI phải được ghi trong `docs/data-model.md`, kèm access pattern và ảnh hưởng migration.

## 7. API contract dự kiến

```text
GET    /documents
POST   /documents/upload-intents
POST   /documents
GET    /documents/{documentId}
PATCH  /documents/{documentId}
DELETE /documents/{documentId}
GET    /documents/{documentId}/versions
POST   /documents/{documentId}/versions/upload-intents
POST   /documents/{documentId}/versions
GET    /documents/{documentId}/download-url
GET    /documents/{documentId}/shares
POST   /documents/{documentId}/shares
DELETE /documents/{documentId}/shares/{shareId}
GET    /documents/{documentId}/audit-logs
GET    /search
GET    /me
```

OpenAPI trong `contracts/openapi.yaml` là nguồn sự thật cho request/response. React Frontend và các Lambda không được tự định nghĩa hai kiểu dữ liệu khác nhau cho cùng một API.

## 8. Kế hoạch Frontend

1. Khởi tạo React/TypeScript/Vite, router, error boundary và cấu hình môi trường.
2. Tích hợp Cognito login, logout, refresh token và protected route.
3. Xây dựng layout, navigation và dashboard theo quyền người dùng.
4. Xây dựng danh sách tài liệu với pagination, filter và metadata search.
5. Xây dựng upload flow bằng presigned URL, progress, cancel và retry.
6. Xây dựng trang chi tiết, version history, download và tạo phiên bản mới.
7. Xây dựng giao diện chia sẻ, thu hồi và hiển thị quyền hiệu lực.
8. Xây dựng màn hình audit history cho người có quyền.
9. Thêm loading, empty, error và access-denied states cho mọi màn hình.
10. Thêm unit test, component test và end-to-end test cho các luồng chính.

React Frontend không được coi việc ẩn nút là biện pháp bảo mật. Mọi thao tác nhạy cảm vẫn phải được Cognito authorizer và Lambda kiểm tra quyền.

## 9. Kế hoạch AWS serverless backend

1. Khởi tạo AWS CDK app trong `aws/infrastructure/` và cấu hình riêng cho `dev`, `staging`, `production`.
2. Khai báo Cognito User Pool, group, app client và API Gateway Cognito authorizer.
3. Khai báo private S3 buckets, CloudFront OAC, DynamoDB table, KMS encryption và CloudWatch log groups.
4. Khởi tạo TypeScript Lambda trong `aws/functions/`, cấu hình bundling và handler chuẩn hóa.
5. Tạo Lambda middleware cho authentication context, validation, error mapping, correlation ID và structured logging.
6. Thiết kế DynamoDB repository và S3 service tạo presigned upload/download URL.
7. Cài đặt document metadata, versioning, metadata search, sharing, permission evaluation và audit log.
8. Dùng conditional write, idempotency và transaction phù hợp để tránh xung đột phiên bản hoặc metadata không nhất quán.
9. Cấu hình API Gateway throttling, Lambda timeout/memory, dead-letter handling và CloudWatch alarms.
10. Thêm unit test cho Lambda/domain logic, integration test cho AWS service contract và CDK assertions cho hạ tầng.

## 10. Tìm kiếm

MVP chỉ tìm theo metadata như tên tài liệu, tags, loại file, phòng ban, owner và thời gian cập nhật.

- Chuẩn hóa chuỗi tìm kiếm về lowercase và loại bỏ khoảng trắng dư.
- Không scan toàn bộ DynamoDB table trong production.
- Dùng GSI hoặc bảng chỉ mục metadata phù hợp access pattern.
- Nếu cần tìm nội dung bên trong PDF/DOCX, lập ADR riêng để đánh giá OpenSearch, Textract hoặc pipeline trích xuất; không ghép tính năng này vào MVP mà không cập nhật kiến trúc và chi phí.

## 11. Bảo mật và riêng tư

- Áp dụng least privilege cho IAM role của từng Lambda.
- Không ghi access token, refresh token, presigned URL hoặc nội dung tài liệu vào log.
- Không commit secret, account ID nhạy cảm hoặc thông tin người dùng thật.
- Validate toàn bộ input ở API boundary bằng schema.
- Encode hoặc sanitize tên file khi hiển thị và khi tạo key.
- Dùng conditional write để ngăn lost update.
- Phân biệt rõ lỗi `401 Unauthorized`, `403 Forbidden`, `404 Not Found` và `409 Conflict`.
- Với tài nguyên không được phép tiết lộ sự tồn tại, cân nhắc trả `404` thay vì `403`.
- CORS chỉ cho phép domain Frontend theo từng môi trường.
- Retention, soft delete và khôi phục phải được mô tả trước khi triển khai chức năng xóa.

## 12. Dữ liệu mẫu

- Chỉ sử dụng dữ liệu giả lập trong `sample-data/`.
- Không dùng hợp đồng, báo giá, email hoặc thông tin định danh thật.
- Dữ liệu mẫu phải bao phủ ít nhất ba phòng ban: nhân sự, kỹ thuật và kinh doanh.
- Bao phủ các tình huống: private document, department-shared, user-shared, expired share và nhiều phiên bản.
- Mọi script seed phải idempotent hoặc có cách dọn dữ liệu dev rõ ràng.

## 13. Quy tắc làm việc của AI

Trước khi thay đổi code, AI phải:

1. Đọc `instruction.md`, `README.md`, file cấu hình package và tài liệu liên quan.
2. Kiểm tra cấu trúc repository bằng công cụ tìm file; không đoán tên module.
3. Kiểm tra worktree và không ghi đè thay đổi của người dùng.
4. Nêu ngắn gọn phạm vi thay đổi và cách kiểm chứng.
5. Ưu tiên pattern, dependency và convention đã có trong repository.

Trong khi thay đổi code, AI phải:

- Giữ thay đổi nhỏ, đúng ownership và không refactor ngoài phạm vi.
- Dùng TypeScript strict, tránh `any` nếu không có lý do được ghi chú.
- Tách domain logic khỏi Lambda handler và UI component.
- Không gọi trực tiếp AWS SDK từ React component.
- Không để handler chứa toàn bộ validation, permission và persistence logic.
- Cập nhật OpenAPI và type dùng chung khi thay đổi contract.
- Thêm test tương ứng với mức độ rủi ro.
- Không sửa file sinh tự động bằng tay nếu có script tạo file đó.

Sau khi thay đổi code, AI phải:

1. Chạy formatter, lint, type-check và test liên quan.
2. Build module bị ảnh hưởng.
3. Kiểm tra edge case và authorization path.
4. Cập nhật tài liệu nếu behavior, schema, API hoặc lệnh chạy thay đổi.
5. Báo rõ lệnh nào đã chạy, lệnh nào chưa thể chạy và rủi ro còn lại.

## 14. Quy ước chất lượng

- Tên biến, hàm, type và API dùng tiếng Anh.
- Tài liệu hướng dẫn người dùng có thể dùng tiếng Việt.
- Thời gian lưu theo UTC ISO 8601.
- ID dùng UUID hoặc Cognito `sub`; không dùng số thứ tự dễ đoán cho tài nguyên public.
- API response có cấu trúc lỗi thống nhất gồm `code`, `message`, `requestId` và optional `details`.
- Pagination dùng opaque cursor, không để Frontend tự suy diễn DynamoDB key.
- Log phải có cấu trúc JSON và correlation/request ID.
- Không tối ưu sớm; đo lường trước khi thêm cache hoặc service mới.

## 15. Kiểm thử bắt buộc

Tối thiểu phải có test cho:

- Đăng nhập thành công, token hết hạn và token không hợp lệ.
- Upload hợp lệ, file quá lớn, MIME type sai và upload bị gián đoạn.
- Hai người tạo phiên bản mới đồng thời.
- Owner, người được chia sẻ, người cùng phòng ban và người không có quyền.
- Share hết hạn hoặc bị thu hồi.
- Download presigned URL chỉ được tạo sau authorization.
- Search pagination và filter kết hợp.
- Audit log được ghi đúng actor và action.
- S3/DynamoDB failure không để metadata và file rơi vào trạng thái không nhất quán mà không có cách xử lý.

## 16. Definition of Done

Một hạng mục chỉ hoàn thành khi:

- Acceptance criteria đã được đáp ứng.
- API và type không mâu thuẫn giữa React Frontend và Lambda.
- Authorization được kiểm tra bằng Cognito authorizer và Lambda, không chỉ ở React.
- Test liên quan chạy thành công.
- Lint, type-check và build thành công.
- Không có secret hoặc dữ liệu thật trong commit.
- Tài liệu, sơ đồ hoặc ADR được cập nhật nếu kiến trúc thay đổi.
- Có hướng dẫn triển khai và rollback cho thay đổi Infrastructure.

## 17. Thứ tự triển khai khuyến nghị

1. Khởi tạo React workspace, thư mục `aws/` và CI cơ bản.
2. Viết OpenAPI, domain model và DynamoDB access patterns.
3. Triển khai Cognito và skeleton Frontend đăng nhập.
4. Triển khai S3, DynamoDB, API Gateway và Lambda skeleton.
5. Hoàn thành upload/download bằng presigned URL.
6. Hoàn thành document metadata và versioning.
7. Hoàn thành search metadata.
8. Hoàn thành sharing và permission evaluation.
9. Hoàn thành audit history và CloudWatch alarms.
10. Chạy security review, end-to-end test và triển khai AWS staging bằng CDK.

Mỗi giai đoạn phải tạo ra một lát cắt chạy được từ React qua API Gateway/Lambda đến dịch vụ AWS, thay vì hoàn thiện toàn bộ Frontend rồi mới bắt đầu AWS backend.
