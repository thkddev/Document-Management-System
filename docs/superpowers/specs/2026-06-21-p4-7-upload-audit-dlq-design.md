# P4.7 - Audit vòng đời upload và xử lý DLQ

## Mục tiêu

Ghi lại các sự kiện quan trọng của vòng đời upload theo dạng append-only và tự động kết thúc tài liệu bị mắc khi message vượt quá số lần retry của SQS.

## Phạm vi

### Trong phạm vi

- Audit vòng đời upload trong bảng DynamoDB hiện có.
- Lambda tiêu thụ Upload DLQ.
- Chuyển tài liệu đang xử lý sang `FAILED` khi message vào DLQ.
- Bảo vệ tài liệu đã ở trạng thái kết thúc khỏi bị ghi đè.
- Gửi SNS trực tiếp khi DLQ được xử lý.
- Structured log và test redaction.
- Unit test, CDK assertion, lint, typecheck, build và CDK synth local.

### Ngoài phạm vi

- Màn hình hoặc API đọc audit log.
- Audit đăng nhập, tìm kiếm, download, chia sẻ hoặc chỉnh sửa metadata.
- Tự động redrive/retry sau khi DLQ đã được xử lý.
- Bảng audit riêng, EventBridge hoặc analytics pipeline.
- Deploy AWS.

## Audit model

Audit item dùng single-table hiện tại:

- `pk = DOC#{documentId}`
- `sk = AUDIT#{occurredAt}#{eventId}`
- `entityType = AuditLog`
- `schemaVersion = 1`
- `action`
- `actorType`: `USER` hoặc `SYSTEM`
- `actorId`
- `source`: `API`, `UPLOAD_PROCESSOR` hoặc `DLQ_PROCESSOR`
- `outcome`: `SUCCESS`, `REJECTED` hoặc `FAILED`
- `documentId`
- `versionNumber`
- `occurredAt`
- `requestId` hoặc `messageId` khi có
- `reason` an toàn khi có

Audit là append-only: chỉ dùng `PutItem` với `ConditionExpression attribute_not_exists(pk) AND attribute_not_exists(sk)`. Không có thao tác update hoặc delete audit trong P4.7.

## Sự kiện

- `UPLOAD_INTENT_CREATED`
- `UPLOAD_VALIDATED`
- `MALWARE_SCAN_STARTED`
- `DOCUMENT_READY`
- `DOCUMENT_REJECTED`
- `MALWARE_DETECTED`
- `PROCESSING_FAILED`
- `MESSAGE_DEAD_LETTERED`

Không ghi token, presigned URL, checksum, S3 bucket/key, nội dung file hoặc stack trace vào audit item.

## Ghi audit

- Upload Intent ghi `UPLOAD_INTENT_CREATED` sau khi tạo metadata thành công.
- Upload Processor ghi audit khi validation hoàn tất, bắt đầu scan và đạt trạng thái kết thúc.
- Retry khi tài liệu đã ở trạng thái kết thúc không tạo thêm audit kết quả.
- Lỗi ghi audit được coi là lỗi xử lý để SQS/API retry; audit không được bỏ qua âm thầm.

## DLQ Processor

Thêm `UploadDlqProcessorFunction` nhận message từ Upload DLQ với batch size nhỏ và partial batch response.

Với message parse được:

1. Lấy `documentId` từ S3 object key trong body gốc.
2. Đọc trạng thái tài liệu.
3. Nếu trạng thái là `READY`, `REJECTED`, `INFECTED` hoặc `FAILED`, không ghi đè trạng thái.
4. Nếu trạng thái đang xử lý, cập nhật `FAILED` với lý do an toàn.
5. Ghi `MESSAGE_DEAD_LETTERED`.
6. Publish SNS chứa document ID, môi trường và message ID, không chứa S3 key hay payload.
7. Acknowledge message.

Với message không parse được:

- Ghi structured error log chỉ gồm message ID và loại lỗi.
- Publish SNS cảnh báo vận hành.
- Acknowledge message để tránh retry vô hạn vì DLQ không có DLQ cấp hai.

Nếu DynamoDB hoặc SNS tạm lỗi, trả partial batch failure để Lambda retry message trong DLQ.

## Hạ tầng

- Lambda DLQ Processor dùng Node.js 22 ARM64.
- Event source là Upload DLQ.
- Quyền tối thiểu: đọc/ghi bảng DynamoDB, publish Security Alert Topic và consume DLQ.
- Visibility timeout của DLQ lớn hơn timeout Lambda.
- Retention DLQ vẫn là 14 ngày; message thành công sẽ được xóa sau khi processor acknowledge.
- Alarm DLQ hiện có được giữ lại, nhưng SNS trực tiếp là cơ chế cảnh báo chắc chắn khi consumer xử lý nhanh.

## Kiểm thử

- Audit item có key đúng, append-only condition và không chứa field nhạy cảm.
- Mỗi action có actor/source/outcome đúng.
- Upload terminal-state retry không tạo audit kết quả trùng.
- DLQ chuyển trạng thái đang xử lý sang `FAILED`.
- DLQ không ghi đè trạng thái kết thúc.
- Message hỏng gửi SNS nhưng không retry vô hạn.
- DynamoDB/SNS lỗi trả partial batch failure.
- CDK test xác nhận Lambda, event source, IAM và SNS.
- Chạy lint, typecheck, toàn bộ test, build và CDK synth local.

## Tiêu chí hoàn thành

- Vòng đời upload có audit append-only theo document.
- Tài liệu không còn mắc vô hạn ở trạng thái đang xử lý sau khi job vào DLQ.
- Message DLQ tạo cảnh báo SNS có dữ liệu tối thiểu.
- Không ghi dữ liệu nhạy cảm vào audit hoặc cảnh báo.
- Không deploy hoặc thay đổi tài nguyên AWS trong quá trình triển khai local.
