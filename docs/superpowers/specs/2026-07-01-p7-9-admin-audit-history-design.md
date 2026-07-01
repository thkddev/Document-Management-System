# P7.9 - Lịch sử quản trị người dùng

## Mục tiêu

Cho System Admin xem lại các thao tác quản trị tài khoản nội bộ ngay trong UI, dùng dữ liệu audit do backend ghi vào DynamoDB. Lịch sử này giúp truy vết ai đã tạo user, đổi phòng ban/vai trò, khóa/mở khóa tài khoản hoặc reset mật khẩu.

## Phạm vi

- Ghi audit log có cấu trúc cho các thao tác quản trị user.
- Không ghi password, token, presigned URL hoặc dữ liệu nhạy cảm.
- Thêm API `GET /admin/users/audit-events`.
- Chỉ System Admin được xem lịch sử quản trị.
- Tạo trang UI riêng `Lịch sử quản trị`.
- Hiển thị 10 thao tác gần nhất.
- Có trạng thái loading, lỗi, empty state và nút làm mới.

## Ngoài phạm vi

- Chưa làm phân trang lịch sử quản trị.
- Chưa làm bộ lọc theo ngày, người thực hiện hoặc loại thao tác.
- Chưa export CSV/PDF.
- Chưa lưu diff chi tiết từng trường cũ/mới.

## Thiết kế backend

Audit event được lưu trong DynamoDB cùng bảng `dms-dev`:

- `pk = ADMIN_AUDIT`
- `sk = AUDIT#<occurredAt>#<eventId>`
- `entityType = AdminAuditLog`
- `schemaVersion = 1`

Các action được ghi:

- `ADMIN_USER_CREATED`
- `ADMIN_USER_UPDATED`
- `ADMIN_USER_DISABLED`
- `ADMIN_USER_ENABLED`
- `ADMIN_USER_PASSWORD_RESET`

Các field được phép lưu:

- `eventId`
- `action`
- `actorId`
- `actorEmail`
- `targetEmail`
- `targetDepartmentId`
- `targetRoles`
- `outcome`
- `occurredAt`
- `requestId`

## Thiết kế API

Endpoint:

```http
GET /admin/users/audit-events
```

Response:

```json
{
  "items": [
    {
      "eventId": "event-1",
      "action": "ADMIN_USER_CREATED",
      "actorId": "admin-1",
      "actorEmail": "admin@example.com",
      "targetEmail": "user@example.com",
      "targetDepartmentId": "TECH",
      "targetRoles": ["EMPLOYEE"],
      "outcome": "SUCCESS",
      "occurredAt": "2026-07-01T05:00:00.000Z",
      "requestId": "request-1"
    }
  ]
}
```

Quyền:

- `401` nếu thiếu hoặc sai claims.
- `403` nếu không phải System Admin.
- `500` nếu cấu hình hoặc truy vấn backend lỗi.

## Thiết kế frontend

Thêm mục `Lịch sử quản trị` trong nhóm `Hệ thống` của sidebar.

Trang hiển thị:

- Tiêu đề `Lịch sử quản trị`.
- Bảng `Lịch sử thao tác tài khoản`.
- Cột thời gian, người thực hiện, thao tác, tài khoản, kết quả.
- Nhãn thao tác tiếng Việt.
- Nút `Làm mới`.
- Empty state `Chưa có lịch sử quản trị`.

Trang này không hiển thị nút `Tải tài liệu lên`, vì không thuộc nghiệp vụ tài liệu.

## Acceptance Criteria

- [x] Tạo user ghi audit `ADMIN_USER_CREATED`.
- [x] Đổi phòng ban/vai trò ghi audit `ADMIN_USER_UPDATED`.
- [x] Khóa user ghi audit `ADMIN_USER_DISABLED`.
- [x] Mở khóa user ghi audit `ADMIN_USER_ENABLED`.
- [x] Reset mật khẩu ghi audit `ADMIN_USER_PASSWORD_RESET`.
- [x] Audit log không chứa password hoặc token.
- [x] System Admin xem được trang `Lịch sử quản trị`.
- [x] Nhân viên thường không thấy mục quản trị.
- [x] API và UI có test bao phủ.

## Kiểm chứng

- `npm run test --workspace @dms/functions`
- `npm run test --workspace @dms/frontend -- admin-users App`
- `npm run test --workspace @dms/infrastructure`
- `npm run typecheck --workspaces --if-present`

Kết quả đã chạy khi triển khai P7.9:

- Functions: 20 files passed, 100 tests passed.
- Frontend focused tests: 2 files passed, 74 tests passed.
- Infrastructure: 1 file passed, 16 tests passed.
- Typecheck toàn workspace: passed.

## Ghi chú triển khai

P7.9 có thay đổi backend, infrastructure và OpenAPI nên cần deploy lại CDK trước khi test UI thật trên AWS.

