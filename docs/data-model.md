# DynamoDB data model

## Mục tiêu

MVP dùng một bảng DynamoDB với khóa `pk` và `sk`. Thiết kế này chỉ là baseline; mọi GSI phải xuất phát từ access pattern đã được xác nhận.

## Entity keys

| Entity             | PK                        | SK                                    |
| ------------------ | ------------------------- | ------------------------------------- |
| Document           | `DOC#{documentId}`        | `META`                                |
| DocumentVersion    | `DOC#{documentId}`        | `VERSION#{versionNumberPadded}`       |
| Share              | `DOC#{documentId}`        | `SHARE#{principalType}#{principalId}` |
| AuditLog           | `DOC#{documentId}`        | `AUDIT#{occurredAt}#{eventId}`        |
| UploadIntent       | `UPLOAD#{uploadIntentId}` | `META`                                |
| User profile cache | `USER#{userId}`           | `PROFILE`                             |

## GSI baseline

| Index | CDK attribute (pk) | CDK attribute (sk) | Pattern key             | Pattern sort key                       | Projection | Mục đích                 |
| ----- | ------------------ | ------------------ | ----------------------- | -------------------------------------- | ---------- | ------------------------ |
| GSI1  | `gsi1pk`           | `gsi1sk`           | `DEPT#{departmentId}`   | `UPDATED#{updatedAt}#DOC#{documentId}` | ALL        | Tài liệu theo phòng ban  |
| GSI2  | `gsi2pk`           | `gsi2sk`           | `OWNER#{ownerId}`       | `UPDATED#{updatedAt}#DOC#{documentId}` | ALL        | Tài liệu theo owner      |
| GSI3  | `gsi3pk`           | `gsi3sk`           | `PRINCIPAL#{type}#{id}` | `SHARED#{createdAt}#DOC#{documentId}`  | ALL        | Tài liệu được chia sẻ    |
| GSI4  | `gsi4pk`           | `gsi4sk`           | `CHECKSUM#{sha256}`     | `DOC#{documentId}#VERSION#{version}`   | KEYS_ONLY  | Phát hiện nội dung trùng |

GSI4 dùng `KEYS_ONLY` vì chỉ cần kiểm tra sự tồn tại của checksum, không cần đọc toàn bộ attributes — giảm chi phí đọc so với `ALL`.

## Access patterns

1. Lấy metadata và các version của một document.
2. Liệt kê document theo department hoặc owner.
3. Liệt kê document được chia sẻ với user/department.
4. Kiểm tra checksum đã tồn tại mà không tiết lộ metadata trái quyền.
5. Liệt kê audit log của document theo thời gian.
6. Dọn upload intent hết hạn bằng DynamoDB TTL.

## Audit vòng đời upload

Audit dùng cùng partition với tài liệu và chỉ được ghi thêm bằng `PutItem` có điều kiện
`attribute_not_exists(pk) AND attribute_not_exists(sk)`. Một bản ghi gồm các trường an toàn:

- `documentId`, `versionNumber`, `action`, `occurredAt`, `eventId`;
- `actorType`, `actorId`, `source`, `outcome`;
- `requestId`, `messageId`, `reason` khi có;
- `schemaVersion = 1`.

Không lưu access token, presigned URL, checksum, S3 object key, nội dung file hoặc stack trace
trong audit.

## Quy tắc

- Version đã phát hành là bất biến.
- Cấp version mới bằng conditional write.
- Timestamp lưu UTC ISO 8601.
- Cursor API là opaque token, không trả DynamoDB key thô.
- Search toàn văn không thuộc thiết kế này.
- Audit log là append-only; ứng dụng không update hoặc delete audit event.
