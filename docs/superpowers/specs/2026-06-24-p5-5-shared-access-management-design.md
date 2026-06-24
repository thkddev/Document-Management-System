# P5.5 - Quản lý quyền đã chia sẻ

## Mục tiêu

Hoàn thiện workflow chia sẻ tài liệu bằng cách cho người có quyền xem danh sách phòng ban đã được cấp quyền và thu hồi quyền chia sẻ khi cần. P5.5 nối tiếp P5.3 và P5.4: đã tạo, duyệt và cấp quyền chia sẻ thì giờ phải quản lý được quyền đó.

## Phạm vi

### Trong phạm vi

- Hiển thị quyền chia sẻ đã cấp trong trang chi tiết tài liệu.
- Thu hồi quyền chia sẻ theo phòng ban.
- Sau khi thu hồi, phòng ban nhận không còn xem chi tiết hoặc tải tài liệu qua quyền chia sẻ đó.
- Ghi audit `DOCUMENT_SHARE_REVOKED`.
- Cập nhật OpenAPI, backend service/handler, frontend client, UI và test.
- Toàn bộ UI mới dùng tiếng Việt có dấu chuẩn.

### Ngoài phạm vi

- Chia sẻ theo email hoặc user cụ thể.
- Thu hồi quyền `ALL_EMPLOYEES`.
- Thu hồi quyền của owner hoặc phòng ban sở hữu tài liệu.
- Lịch sử đầy đủ các quyền đã từng bị thu hồi.
- Khôi phục quyền đã thu hồi bằng một nút riêng.
- Thông báo email/SNS khi bị thu hồi.
- Deploy AWS trong bước triển khai local.

## Quyền xem và thu hồi

Người được xem khối **Quyền đã chia sẻ** và được thu hồi quyền:

- owner của tài liệu;
- user có role `DEPARTMENT_ADMIN` và `departmentId` trùng phòng ban sở hữu tài liệu;
- user có role `SYSTEM_ADMIN`.

Người thuộc phòng ban nhận không được tự thu hồi quyền chia sẻ.

Backend là nơi kiểm tra quyền thật. Frontend chỉ ẩn hoặc hiện UI để trải nghiệm rõ hơn.

## Mô hình dữ liệu

P5.5 dùng lại item đã có từ P5.3:

```text
pk = DOC#{documentId}
sk = SHARE#DEPT#{targetDepartmentId}
entityType = DocumentDepartmentShare
documentId
sourceDepartmentId
targetDepartmentId
status = APPROVED
requestedBy
approvedBy
requestedAt
approvedAt
gsi3pk = PRINCIPAL#DEPT#{targetDepartmentId}
```

Khi thu hồi, P5.5 ưu tiên **xóa item share** thay vì giữ item `REVOKED`. Lý do:

- quyền truy cập hiện tại đang kiểm tra sự tồn tại của item `APPROVED`;
- xóa item giúp chặn quyền ngay;
- audit log đã lưu sự kiện thu hồi;
- giảm dữ liệu cần đọc trong luồng kiểm tra quyền.

Nếu sau này cần lịch sử quyền chia sẻ đầy đủ, có thể thêm item history riêng.

## API contract

### GET `/documents/{documentId}/department-shares`

Trả danh sách phòng ban đã được chia sẻ quyền với tài liệu.

Quyền gọi API:

- owner;
- Department Admin của phòng ban sở hữu;
- System Admin.

Response `200`:

```json
{
  "items": [
    {
      "documentId": "doc-id",
      "targetDepartmentId": "HR",
      "sourceDepartmentId": "TECH",
      "requestedBy": "user-id",
      "approvedBy": "admin-id",
      "requestedAt": "2026-06-24T08:00:00.000Z",
      "approvedAt": "2026-06-24T08:05:00.000Z"
    }
  ]
}
```

Lỗi:

- `401 UNAUTHORIZED` khi thiếu phiên đăng nhập hợp lệ.
- `404 DOCUMENT_NOT_FOUND` khi tài liệu không tồn tại hoặc user không được quản lý quyền chia sẻ của tài liệu.

### DELETE `/documents/{documentId}/department-shares/{targetDepartmentId}`

Thu hồi quyền chia sẻ của một phòng ban.

Quyền gọi API:

- owner;
- Department Admin của phòng ban sở hữu;
- System Admin.

Response `200`:

```json
{
  "documentId": "doc-id",
  "targetDepartmentId": "HR",
  "status": "REVOKED"
}
```

Lỗi:

- `400 VALIDATION_ERROR` khi `targetDepartmentId` không hợp lệ hoặc trùng phòng ban sở hữu.
- `401 UNAUTHORIZED`.
- `404 DOCUMENT_NOT_FOUND` khi tài liệu không tồn tại hoặc user không được quản lý quyền chia sẻ của tài liệu.
- `404 DEPARTMENT_SHARE_NOT_FOUND` khi tài liệu chưa chia sẻ cho phòng ban đó.

## Audit

Thêm action:

- `DOCUMENT_SHARE_REVOKED`

Audit lưu:

- `documentId`
- `sourceDepartmentId`
- `targetDepartmentId`
- `classification`
- `actorId`
- `actorType`
- `outcome`
- `requestId`

Audit không lưu S3 key, presigned URL, token hoặc nội dung file.

## Giao diện

### Trang chi tiết tài liệu

Thêm khối **Quyền đã chia sẻ** bên dưới phần **Chia sẻ phòng ban** hoặc gần khu vực metadata.

Nếu chưa có phòng ban nào được chia sẻ:

- hiển thị: **Tài liệu chưa được chia sẻ cho phòng ban khác.**

Nếu đã có quyền chia sẻ, mỗi dòng hiển thị:

- phòng ban nhận;
- thời điểm cấp quyền;
- người cấp hoặc người duyệt nếu có dữ liệu;
- nút **Thu hồi**.

Khi bấm **Thu hồi**, UI mở xác nhận nhỏ trong trang:

- nêu rõ phòng ban sắp bị thu hồi;
- nút **Xác nhận thu hồi**;
- nút **Hủy**.

Không dùng `window.confirm` hoặc `window.prompt`.

Sau khi thu hồi thành công:

- refresh danh sách quyền đã chia sẻ;
- hiển thị thông báo: **Đã thu hồi quyền chia sẻ.**

Nếu thất bại:

- hiển thị lỗi tiếng Việt: **Không thể thu hồi quyền chia sẻ. Vui lòng thử lại.**

## Luồng truy cập sau thu hồi

Sau khi share item bị xóa:

- user phòng ban nhận không còn thấy tài liệu trong danh sách nếu chỉ có quyền qua share đó;
- nếu user vẫn là owner, cùng phòng ban sở hữu, System Admin hoặc tài liệu `ALL_EMPLOYEES`, quyền truy cập vẫn giữ nguyên theo các rule P5.1/P5.2;
- download intent tiếp tục dùng rule quyền hiện có, nên sẽ bị chặn tự nhiên nếu không còn quyền.

## Kiểm thử

### Backend

- Owner list được quyền đã chia sẻ.
- Department Admin phòng ban sở hữu list được quyền đã chia sẻ.
- Department Admin phòng ban nhận không list được.
- System Admin list được.
- Owner thu hồi được share.
- Department Admin phòng ban sở hữu thu hồi được share.
- Department Admin phòng ban nhận không thu hồi được.
- System Admin thu hồi được.
- Sau thu hồi, user phòng ban nhận không còn truy cập được bằng share.
- Thu hồi share không tồn tại trả lỗi đúng.
- Audit `DOCUMENT_SHARE_REVOKED` được ghi đúng.

### Frontend

- Trang chi tiết hiển thị khối **Quyền đã chia sẻ** cho user có quyền quản lý.
- Trạng thái rỗng hiển thị đúng.
- Danh sách share hiển thị phòng ban nhận và thời gian cấp quyền.
- Bấm **Thu hồi** mở xác nhận trong UI.
- Hủy xác nhận không gọi API.
- Xác nhận thu hồi gọi API và refresh danh sách.
- Lỗi thu hồi hiển thị bằng tiếng Việt.

### Hạ tầng

- Không thêm AWS service mới.
- Lambda hiện có cho document sharing có thêm route GET/DELETE.
- Lambda chỉ cần quyền DynamoDB hiện có.
- CDK synth chạy được local.

## Tiêu chí hoàn thành

- Người có quyền quản lý nhìn được phòng ban nào đang được chia sẻ tài liệu.
- Người có quyền quản lý thu hồi được quyền chia sẻ theo phòng ban.
- Phòng ban nhận mất quyền xem/tải sau khi bị thu hồi, trừ khi còn quyền theo rule khác.
- Audit log có `DOCUMENT_SHARE_REVOKED`.
- Không dùng popup thô cho xác nhận thu hồi.
- Typecheck, lint, test, build và CDK synth local đều đạt.
