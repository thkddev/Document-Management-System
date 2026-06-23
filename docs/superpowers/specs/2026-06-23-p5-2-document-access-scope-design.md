# P5.2 - Chia sẻ tài liệu theo phạm vi tối thiểu

## Mục tiêu

Cho phép tài liệu được phát hành theo phạm vi đọc rõ ràng: chỉ trong phòng ban hiện tại hoặc toàn bộ nhân viên. Phạm vi toàn bộ nhân viên chỉ do System Admin được chọn khi upload. Sau khi tài liệu sẵn sàng, mọi người dùng đăng nhập hợp lệ có thể xem và tải tài liệu toàn bộ nhân viên.

## Phạm vi

### Trong phạm vi

- Thêm trường `accessScope` cho tài liệu.
- Hỗ trợ hai giá trị:
  - `DEPARTMENT`: chỉ phòng ban hiện tại.
  - `ALL_EMPLOYEES`: toàn bộ nhân viên.
- Upload mặc định là `DEPARTMENT` nếu request không gửi `accessScope`.
- Chỉ user thuộc group `SYSTEM_ADMIN` được tạo upload intent với `ALL_EMPLOYEES`.
- Frontend upload form hiển thị lựa chọn phạm vi truy cập.
- User không phải `SYSTEM_ADMIN` không được chọn `ALL_EMPLOYEES`.
- Danh sách tài liệu, trang chi tiết và download intent dùng rule quyền mới.
- UI danh sách và trang chi tiết hiển thị nhãn phạm vi truy cập bằng tiếng Việt.
- Audit upload intent ghi nhận phạm vi truy cập.
- Cập nhật OpenAPI, unit test, component test và CDK nếu route/contract cần đổi.

### Ngoài phạm vi

- Chia sẻ cho email/user cụ thể.
- Chia sẻ cho phòng ban cụ thể khác.
- Chỉnh sửa phạm vi truy cập sau khi upload.
- Quy trình phê duyệt phát hành tài liệu toàn công ty.
- Gửi thông báo khi có tài liệu toàn công ty.
- Deploy AWS trong bước triển khai local.

## Mô hình dữ liệu

Thêm kiểu:

```ts
type DocumentAccessScope = 'DEPARTMENT' | 'ALL_EMPLOYEES';
```

Document item trong DynamoDB có thêm:

```text
accessScope: DEPARTMENT | ALL_EMPLOYEES
```

Với dữ liệu cũ chưa có `accessScope`, backend coi như:

```text
accessScope = DEPARTMENT
```

Response `DocumentSummary` và `DocumentDetail` trả thêm `accessScope` để frontend hiển thị nhãn.

## Quy tắc quyền

### `DEPARTMENT`

Người dùng được xem chi tiết và tải xuống khi thỏa ít nhất một điều kiện:

- là owner của tài liệu;
- cùng `departmentId` với tài liệu;
- thuộc group `SYSTEM_ADMIN`.

### `ALL_EMPLOYEES`

Người dùng được xem chi tiết và tải xuống khi:

- có phiên đăng nhập hợp lệ với `sub`, `departmentId` và group hợp lệ; hoặc
- thuộc group `SYSTEM_ADMIN`.

Tài liệu vẫn chỉ tải được khi `status === READY`.

### Upload

- Nếu request không có `accessScope`, backend đặt `DEPARTMENT`.
- Nếu request có `accessScope = DEPARTMENT`, mọi user đăng nhập hợp lệ được phép tạo upload intent theo rule hiện tại.
- Nếu request có `accessScope = ALL_EMPLOYEES`, backend chỉ cho phép `SYSTEM_ADMIN`.
- Nếu user không phải `SYSTEM_ADMIN` gửi `ALL_EMPLOYEES`, backend trả `403 FORBIDDEN`.

Frontend chỉ là lớp hỗ trợ trải nghiệm; backend là nơi thực thi quyền thật.

## API contract

### `POST /upload-intents`

Request thêm field tùy chọn:

```json
{
  "accessScope": "DEPARTMENT"
}
```

Giá trị hợp lệ:

- `DEPARTMENT`
- `ALL_EMPLOYEES`

Lỗi mới:

- `403 FORBIDDEN` khi user không phải `SYSTEM_ADMIN` cố tạo upload intent toàn bộ nhân viên.
- `400 VALIDATION_ERROR` khi `accessScope` không hợp lệ.

### `GET /documents`

Danh sách trả thêm `accessScope` trong mỗi item.

Rule lọc:

- `SYSTEM_ADMIN`: thấy tất cả.
- User thường: thấy tài liệu mình sở hữu, tài liệu cùng phòng ban, hoặc tài liệu `ALL_EMPLOYEES`.

### `GET /documents/{documentId}`

Response trả thêm `accessScope`. Tài liệu không có quyền vẫn trả `404 DOCUMENT_NOT_FOUND` như P5.1.

### `POST /documents/{documentId}/download-intents`

Dùng cùng rule quyền với `GET /documents/{documentId}`. Chỉ tạo URL khi tài liệu `READY`.

## Audit

Khi tạo upload intent thành công, audit `UPLOAD_INTENT_CREATED` ghi thêm metadata an toàn:

```json
{
  "accessScope": "DEPARTMENT"
}
```

Audit không ghi presigned URL, S3 key, token, hoặc nội dung file.

Không thêm audit đổi quyền vì P5.2 chưa hỗ trợ chỉnh phạm vi sau upload.

## Giao diện

Form upload thêm trường **Phạm vi truy cập**:

- **Phòng ban hiện tại**: mặc định.
- **Toàn bộ nhân viên**: chỉ hiện hoặc chỉ bật với `SYSTEM_ADMIN`.

Với user không phải `SYSTEM_ADMIN`, UI giữ `Phòng ban hiện tại` và không cho chọn toàn bộ nhân viên.

Danh sách tài liệu hiển thị nhãn:

- `Phòng ban`
- `Toàn công ty`

Trang chi tiết hiển thị phạm vi trong khu vực metadata hoặc quyền truy cập an toàn.

Tất cả text mới dùng tiếng Việt có dấu chuẩn.

## Xử lý lỗi

- `accessScope` không hợp lệ trả lỗi validation tiếng Việt.
- User không đủ quyền upload toàn bộ nhân viên trả thông báo: `Bạn không có quyền phát hành tài liệu cho toàn bộ nhân viên.`
- Frontend không tự suy luận quyền tải xuống; nút tải vẫn phụ thuộc trạng thái tài liệu và response từ backend.
- Backend không làm lộ tài liệu không có quyền: detail và download vẫn dùng cùng response 404 cho không tồn tại hoặc không được phép.

## Kiểm thử

### Backend

- Parse `accessScope` hợp lệ và default `DEPARTMENT` cho record cũ.
- Từ chối `accessScope` không hợp lệ.
- Cho `SYSTEM_ADMIN` tạo upload intent `ALL_EMPLOYEES`.
- Từ chối user thường tạo upload intent `ALL_EMPLOYEES`.
- User thường thấy tài liệu `ALL_EMPLOYEES` khác phòng ban trong danh sách.
- User thường xem chi tiết tài liệu `ALL_EMPLOYEES` khác phòng ban.
- User thường tải được tài liệu `ALL_EMPLOYEES` khi `READY`.
- Tài liệu `DEPARTMENT` vẫn giữ rule P5.1.
- Audit upload intent có `accessScope`.

### Frontend

- System Admin thấy và chọn được `Toàn bộ nhân viên`.
- User thường không chọn được `Toàn bộ nhân viên`.
- Upload request gửi đúng `accessScope`.
- Danh sách hiển thị nhãn phạm vi đúng.
- Trang chi tiết hiển thị phạm vi đúng.
- Lỗi 403 khi upload toàn bộ nhân viên được hiển thị bằng tiếng Việt.

### Hạ tầng

- Không cần thêm AWS service mới.
- Không cần đổi IAM ngoài các quyền đã có nếu chỉ mở rộng payload và DynamoDB item.
- CDK synth vẫn chạy thành công.

## Tiêu chí hoàn thành

- Tài liệu upload mặc định vẫn chỉ theo phòng ban.
- System Admin có thể upload tài liệu phạm vi toàn bộ nhân viên.
- User thường không thể tự upload tài liệu toàn bộ nhân viên.
- Tài liệu toàn bộ nhân viên hiển thị và tải được với mọi user đăng nhập hợp lệ khi `READY`.
- Tài liệu phòng ban tiếp tục giữ quyền owner, cùng phòng ban và System Admin.
- UI thể hiện rõ phạm vi truy cập.
- Audit ghi nhận phạm vi khi tạo upload intent.
- Lint, typecheck, test, build và CDK synth local đều đạt.
