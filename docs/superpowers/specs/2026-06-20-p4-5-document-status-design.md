# P4.5 - Danh sách và trạng thái tài liệu

## Mục tiêu

Kết nối dashboard với dữ liệu tài liệu thật trong DynamoDB để người dùng theo dõi trạng thái xử lý sau upload mà không cần mở AWS Console.

## Phạm vi

### Trong phạm vi

- API `GET /documents` được bảo vệ bằng Cognito.
- Query tài liệu theo phòng ban của người dùng qua `gsi1`.
- Dashboard dùng dữ liệu API thay cho danh sách mẫu.
- Tải lại danh sách ngay sau khi upload thành công.
- Polling mỗi 5 giây khi còn tài liệu đang xử lý.
- Trạng thái tải, trống và lỗi bằng tiếng Việt.
- Unit test, CDK assertion, lint, typecheck, build và CDK synth local.

### Ngoài phạm vi

- Kiểm tra magic bytes/file signature.
- Audit log và xử lý nghiệp vụ cho DLQ.
- Pagination/cursor đầy đủ của P5.
- WebSocket, SSE, download, chỉnh sửa hoặc xóa tài liệu.
- Deploy AWS.

## API

### Route

`GET /documents`

Route dùng Cognito authorizer hiện có. Lambda lấy `sub`, `custom:departmentId` và groups từ claims. P4.5 chỉ trả tài liệu có cùng `departmentId` với tài khoản, kể cả tài khoản quản trị, để không mở rộng quyền khi permission matrix chưa được chốt.

### Truy vấn

- DynamoDB `Query` trên `gsi1`.
- Partition key: `DEPT#{departmentId}`.
- `ScanIndexForward: false` để bản ghi mới nhất đứng trước.
- `Limit: 50`.
- Chỉ nhận entity `Document`; không trả `UploadIntent`.

### Response

```json
{
  "items": [
    {
      "documentId": "uuid",
      "title": "Báo cáo tuần",
      "originalFileName": "bao-cao.pdf",
      "contentType": "application/pdf",
      "classification": "INTERNAL",
      "departmentId": "TECH",
      "ownerId": "cognito-sub",
      "ownerEmail": "user@example.com",
      "sizeBytes": 1453085,
      "currentVersion": 1,
      "status": "SCANNING",
      "updatedAt": "2026-06-20T06:30:28.640Z"
    }
  ]
}
```

Các field thiếu hoặc bản ghi sai cấu trúc không được làm hỏng toàn bộ response; Lambda bỏ qua bản ghi lỗi và ghi log cảnh báo không chứa dữ liệu nhạy cảm.

## Frontend

- Tạo module API tài liệu riêng, dùng `apiFetch` hiện có.
- `App` quản lý danh sách, loading, error và polling timer.
- Gọi danh sách khi dashboard mount.
- Sau khi PUT S3 thành công, gọi lại danh sách ngay.
- Poll mỗi 5 giây khi có ít nhất một trạng thái `UPLOAD_PENDING`, `UPLOADED`, `VALIDATING` hoặc `SCANNING`.
- Dừng polling khi mọi item ở trạng thái kết thúc: `READY`, `INFECTED`, `REJECTED` hoặc `FAILED`.
- Khi polling lỗi, giữ danh sách gần nhất và hiển thị thông báo tiếng Việt; không xóa nội dung đang thấy.
- Hủy timer khi component unmount hoặc user đăng xuất.

## Hiển thị

- Giữ bố cục dashboard hiện có.
- Thay các hàng mẫu bằng tài liệu API.
- Hiển thị nhãn trạng thái tiếng Việt: `Đang tải lên`, `Đã nhận`, `Đang xác minh`, `Đang quét`, `Sẵn sàng`, `Có mã độc`, `Bị từ chối`, `Xử lý lỗi`.
- Suy ra nhãn loại file từ `contentType` hoặc phần mở rộng tên file.
- Có trạng thái đang tải, danh sách trống và lỗi; toàn bộ UI giữ tiếng Việt có dấu.

## Hạ tầng

- Thêm Lambda đọc danh sách tài liệu với quyền query bảng DynamoDB.
- Thêm route `GET /documents` dùng Cognito authorizer.
- Không thêm service AWS mới.

## Kiểm thử

- Service query đúng `gsi1`, phòng ban, thứ tự giảm dần và giới hạn 50.
- Handler từ chối claims thiếu hồ sơ và trả response chuẩn.
- Frontend ánh xạ dữ liệu thật, xử lý loading/error/empty.
- Polling chỉ chạy khi có trạng thái chưa kết thúc và dừng khi terminal.
- Upload thành công kích hoạt refresh danh sách.
- CDK test xác nhận route, authorizer, Lambda và quyền DynamoDB.
- Chạy lint, typecheck, toàn bộ test, build và CDK synth local.

## Tiêu chí hoàn thành

- Dashboard không còn dùng danh sách tài liệu mẫu.
- File vừa upload xuất hiện và tự chuyển trạng thái mà không reload trang.
- Polling không chạy vô hạn khi không còn file đang xử lý.
- Lỗi polling không làm mất dữ liệu đang hiển thị.
- Không deploy hoặc thay đổi tài nguyên AWS trong quá trình triển khai local.
