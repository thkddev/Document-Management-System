# P5.3 - Chia sẻ tài liệu liên phòng ban theo nhãn dữ liệu

## Mục tiêu

Cho phép chia sẻ tài liệu từ phòng ban sở hữu sang phòng ban khác mà vẫn kiểm soát an toàn thông tin theo nhãn dữ liệu. Tài liệu ít nhạy cảm được chia sẻ nhanh; tài liệu nhạy cảm phải qua Department Admin của phòng ban sở hữu tài liệu duyệt trước khi phòng ban nhận có quyền xem và tải.

## Phạm vi

### Trong phạm vi

- Chia sẻ tài liệu sang một phòng ban cụ thể khác.
- Tài liệu `PUBLIC` và `INTERNAL` được chia sẻ liên phòng ban ngay nếu người thao tác có quyền chia sẻ.
- Tài liệu `CONFIDENTIAL` và `RESTRICTED` tạo yêu cầu chờ duyệt.
- Department Admin của phòng ban sở hữu tài liệu là người duyệt hoặc từ chối yêu cầu.
- Khi yêu cầu được duyệt, thành viên phòng ban nhận có thể xem chi tiết và tải tài liệu nếu tài liệu `READY`.
- System Admin có thể chia sẻ và duyệt thay cho mọi phòng ban.
- Lưu audit cho yêu cầu chia sẻ, duyệt, từ chối và cấp quyền chia sẻ trực tiếp.
- Cập nhật API, DynamoDB model, frontend, OpenAPI và test.
- Toàn bộ UI mới dùng tiếng Việt có dấu chuẩn.

### Ngoài phạm vi

- Chia sẻ theo email hoặc user cụ thể.
- Duyệt hai bước bởi cả phòng ban sở hữu và phòng ban nhận.
- Thu hồi quyền chia sẻ đã duyệt.
- Chỉnh sửa nhãn dữ liệu sau khi upload.
- Thông báo email/SNS cho yêu cầu duyệt.
- Preview nội dung tài liệu.
- Deploy AWS trong bước triển khai local.

## Khái niệm

### Nhãn dữ liệu

P5.3 dùng lại nhãn hiện có:

- `PUBLIC`: Công khai.
- `INTERNAL`: Nội bộ.
- `CONFIDENTIAL`: Mật.
- `RESTRICTED`: Hạn chế, dùng như nhóm tài liệu nhạy cảm cao nhất hiện tại.

Quy tắc chia sẻ:

- `PUBLIC` và `INTERNAL`: chia sẻ trực tiếp.
- `CONFIDENTIAL` và `RESTRICTED`: bắt buộc duyệt.

### Người được phép tạo chia sẻ

Một người dùng được tạo yêu cầu chia sẻ khi thỏa ít nhất một điều kiện:

- là owner của tài liệu;
- thuộc cùng phòng ban với tài liệu;
- thuộc group `DEPARTMENT_ADMIN` của phòng ban sở hữu tài liệu;
- thuộc group `SYSTEM_ADMIN`.

Backend là nơi thực thi quyền thật. Frontend chỉ ẩn hoặc vô hiệu hóa thao tác để trải nghiệm rõ hơn.

### Người được phép duyệt

Yêu cầu chia sẻ tài liệu nhạy cảm chỉ được duyệt hoặc từ chối bởi:

- user có role `DEPARTMENT_ADMIN` và `departmentId` trùng phòng ban sở hữu tài liệu; hoặc
- user có role `SYSTEM_ADMIN`.

Department Admin của phòng ban nhận không có quyền duyệt yêu cầu này.

## Mô hình dữ liệu

Thêm các kiểu:

```ts
type DepartmentShareStatus = 'APPROVED' | 'PENDING' | 'REJECTED';
type DepartmentShareDecision = 'APPROVE' | 'REJECT';
```

### Share item đã duyệt

Khi chia sẻ đã được cấp quyền, DynamoDB lưu item:

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
```

Với chia sẻ trực tiếp của `PUBLIC` và `INTERNAL`, `approvedBy` có thể bằng `requestedBy`, `approvedAt` bằng thời điểm tạo.

### Share request chờ duyệt

Với tài liệu `CONFIDENTIAL` và `RESTRICTED`, DynamoDB lưu item:

```text
pk = SHARE_REQUEST#{shareRequestId}
sk = META
entityType = DocumentDepartmentShareRequest
shareRequestId
documentId
sourceDepartmentId
targetDepartmentId
classification
status = PENDING | APPROVED | REJECTED
requestedBy
requestedByEmail
reviewedBy
reviewedAt
rejectionReason
createdAt
updatedAt
```

Để truy vấn hàng đợi duyệt mà không thêm index mới, P5.3 dùng item phụ:

```text
pk = DEPT#{sourceDepartmentId}
sk = SHARE_REQUEST#{status}#{createdAt}#{shareRequestId}
```

Item phụ chỉ chứa dữ liệu tóm tắt an toàn để hiển thị hàng đợi duyệt.

## Quy tắc truy cập tài liệu

Một user được xem chi tiết và tạo download intent khi thỏa ít nhất một điều kiện:

- là owner của tài liệu;
- cùng phòng ban với tài liệu;
- tài liệu có `accessScope = ALL_EMPLOYEES`;
- user thuộc group `SYSTEM_ADMIN`;
- có item `DocumentDepartmentShare` trạng thái `APPROVED` với `targetDepartmentId = user.departmentId`.

Tài liệu vẫn chỉ tải được khi `status === READY`. Tài liệu không có quyền tiếp tục trả `404 DOCUMENT_NOT_FOUND` như P5.1 để không làm lộ sự tồn tại.

## API contract

### POST `/documents/{documentId}/department-shares`

Tạo chia sẻ sang phòng ban khác.

Request:

```json
{
  "targetDepartmentId": "HR"
}
```

Response `201` với tài liệu `PUBLIC` hoặc `INTERNAL`:

```json
{
  "mode": "GRANTED",
  "documentId": "doc-id",
  "targetDepartmentId": "HR"
}
```

Response `202` với tài liệu `CONFIDENTIAL` hoặc `RESTRICTED`:

```json
{
  "mode": "PENDING_APPROVAL",
  "shareRequestId": "request-id",
  "documentId": "doc-id",
  "targetDepartmentId": "HR"
}
```

Lỗi:

- `400 VALIDATION_ERROR` khi phòng ban nhận không hợp lệ hoặc trùng phòng ban sở hữu.
- `401 UNAUTHORIZED` khi thiếu phiên đăng nhập hợp lệ.
- `404 DOCUMENT_NOT_FOUND` khi tài liệu không tồn tại hoặc user không có quyền chia sẻ.
- `409 SHARE_ALREADY_EXISTS` khi phòng ban nhận đã có quyền.
- `409 SHARE_REQUEST_ALREADY_PENDING` khi đã có yêu cầu chờ duyệt cùng tài liệu và phòng ban.

### GET `/share-requests`

Liệt kê yêu cầu chia sẻ chờ duyệt cho Department Admin.

Query mặc định:

```text
status=PENDING
```

Backend chỉ trả yêu cầu thuộc phòng ban sở hữu mà user được phép duyệt. `SYSTEM_ADMIN` có thể xem tất cả yêu cầu chờ duyệt.

Response:

```json
{
  "items": [
    {
      "shareRequestId": "request-id",
      "documentId": "doc-id",
      "title": "Quy trình lương",
      "classification": "CONFIDENTIAL",
      "sourceDepartmentId": "TECH",
      "targetDepartmentId": "HR",
      "requestedByEmail": "user@example.com",
      "createdAt": "2026-06-24T08:00:00.000Z"
    }
  ]
}
```

### POST `/share-requests/{shareRequestId}/approve`

Duyệt yêu cầu chia sẻ.

Request không cần body. Backend:

1. Kiểm tra user có quyền duyệt.
2. Kiểm tra request còn `PENDING`.
3. Tạo item `DocumentDepartmentShare` trạng thái `APPROVED`.
4. Cập nhật request thành `APPROVED`.
5. Ghi audit.

Response `200`:

```json
{
  "shareRequestId": "request-id",
  "status": "APPROVED"
}
```

### POST `/share-requests/{shareRequestId}/reject`

Từ chối yêu cầu chia sẻ.

Request:

```json
{
  "reason": "Tài liệu chứa thông tin nhạy cảm của khách hàng."
}
```

Response `200`:

```json
{
  "shareRequestId": "request-id",
  "status": "REJECTED"
}
```

Lỗi chung cho approve/reject:

- `401 UNAUTHORIZED`.
- `404 SHARE_REQUEST_NOT_FOUND` khi không tồn tại hoặc user không có quyền duyệt.
- `409 SHARE_REQUEST_NOT_PENDING` khi yêu cầu đã được xử lý.
- `400 VALIDATION_ERROR` khi lý do từ chối không hợp lệ.

## Audit

Thêm action:

- `DOCUMENT_SHARE_REQUESTED`: tạo yêu cầu duyệt cho tài liệu nhạy cảm.
- `DOCUMENT_SHARE_GRANTED`: cấp quyền chia sẻ trực tiếp hoặc sau khi duyệt.
- `DOCUMENT_SHARE_APPROVED`: Department Admin duyệt yêu cầu.
- `DOCUMENT_SHARE_REJECTED`: Department Admin từ chối yêu cầu.

Audit lưu:

- `documentId`
- `sourceDepartmentId`
- `targetDepartmentId`
- `classification`
- `shareRequestId` khi có
- `actorId`
- `actorType`
- `outcome`
- `requestId`

Audit không lưu presigned URL, S3 key, token hoặc nội dung file.

## Giao diện

### Trang chi tiết tài liệu

Thêm khu vực **Chia sẻ phòng ban** cho user có quyền chia sẻ:

- chọn phòng ban nhận;
- nút **Chia sẻ**;
- thông báo kết quả rõ ràng:
  - `Đã chia sẻ tài liệu cho phòng ban đã chọn.`
  - `Đã gửi yêu cầu duyệt chia sẻ.`

Nếu tài liệu là `Mật` hoặc `Hạn chế`, UI hiển thị nhắc nhẹ: `Tài liệu nhạy cảm cần Department Admin phê duyệt trước khi chia sẻ.`

### Hàng đợi duyệt

Thêm mục gọn trong dashboard hoặc trang chi tiết luồng công việc hiện có: **Yêu cầu chia sẻ chờ duyệt**.

Mỗi dòng hiển thị:

- tiêu đề tài liệu;
- nhãn dữ liệu;
- phòng ban nhận;
- người yêu cầu;
- thời điểm yêu cầu;
- nút **Duyệt**;
- nút **Từ chối**.

Khi từ chối, UI yêu cầu nhập lý do ngắn. Lý do không được rỗng.

### Danh sách tài liệu

Danh sách tài liệu của user phòng ban nhận hiển thị tài liệu đã được chia sẻ sau khi request được duyệt. Nhãn phạm vi vẫn giữ `Phòng ban` hoặc `Toàn công ty`; nếu cần phân biệt nguồn chia sẻ, thêm nhãn phụ `Được chia sẻ`.

## Xử lý lỗi

- Không cho chia sẻ sang chính phòng ban sở hữu.
- Không cho tạo trùng share đã được duyệt.
- Không cho tạo nhiều request `PENDING` cho cùng tài liệu và phòng ban nhận.
- Nếu tài liệu không còn tồn tại khi duyệt, trả `404 SHARE_REQUEST_NOT_FOUND`.
- Nếu tài liệu không còn `READY`, vẫn có thể duyệt quyền chia sẻ, nhưng phòng ban nhận chỉ tải được khi tài liệu quay về `READY`.
- Frontend hiển thị lỗi bằng tiếng Việt, không lộ chi tiết nội bộ như key DynamoDB hoặc tên Lambda.

## Kiểm thử

### Backend

- `PUBLIC` và `INTERNAL` tạo share trực tiếp.
- `CONFIDENTIAL` và `RESTRICTED` tạo request `PENDING`.
- User không có quyền không tạo được share.
- Không chia sẻ sang cùng phòng ban.
- Không tạo trùng share đã duyệt.
- Không tạo trùng request đang chờ duyệt.
- Department Admin phòng ban sở hữu duyệt được request.
- Department Admin phòng ban nhận không duyệt được request.
- System Admin duyệt được mọi request.
- Sau khi duyệt, user phòng ban nhận thấy tài liệu trong danh sách.
- Sau khi duyệt, user phòng ban nhận tải được tài liệu `READY`.
- Sau khi từ chối, user phòng ban nhận không thấy tài liệu.
- Audit được ghi đúng action và không chứa dữ liệu nhạy cảm.

### Frontend

- Trang chi tiết hiển thị form chia sẻ cho user có quyền.
- Tài liệu `PUBLIC` và `INTERNAL` hiển thị thông báo chia sẻ thành công ngay.
- Tài liệu `CONFIDENTIAL` và `RESTRICTED` hiển thị thông báo đã gửi yêu cầu duyệt.
- Department Admin thấy danh sách yêu cầu chờ duyệt của phòng ban mình.
- Department Admin duyệt và từ chối được yêu cầu.
- Lý do từ chối bắt buộc nhập.
- User phòng ban nhận thấy tài liệu sau khi được duyệt.
- UI tiếng Việt có dấu chuẩn.

### Hạ tầng

- Không thêm AWS service mới.
- Lambda mới hoặc route mới chỉ cần quyền DynamoDB phù hợp.
- Không cần quyền đọc S3 mới ngoài các quyền download đã có.
- CDK synth chạy được local.

## Tiêu chí hoàn thành

- Chia sẻ liên phòng ban hoạt động với tài liệu `PUBLIC` và `INTERNAL` mà không cần duyệt.
- Chia sẻ liên phòng ban với tài liệu `CONFIDENTIAL` và `RESTRICTED` bắt buộc tạo yêu cầu duyệt.
- Chỉ Department Admin của phòng ban sở hữu tài liệu hoặc System Admin duyệt được yêu cầu.
- Phòng ban nhận chỉ xem và tải được sau khi được cấp quyền.
- Các rule cũ của P5.1 và P5.2 vẫn giữ nguyên.
- Audit log phản ánh đủ yêu cầu, duyệt, từ chối và cấp quyền.
- Lint, typecheck, test, build và CDK synth local đều đạt.
