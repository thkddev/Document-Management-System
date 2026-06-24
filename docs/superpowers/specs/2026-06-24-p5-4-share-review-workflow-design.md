# P5.4 - Quản lý yêu cầu chia sẻ tài liệu

## Mục tiêu

Nâng phần duyệt yêu cầu chia sẻ của P5.3 từ panel tối giản thành workflow rõ ràng hơn cho Department Admin và System Admin. Người duyệt phải nhìn được tài liệu nào đang xin chia sẻ, nhãn dữ liệu, phòng ban nhận, người yêu cầu, thời điểm yêu cầu và có thao tác duyệt hoặc từ chối với lý do.

## Phạm vi

### Trong phạm vi

- Cải thiện khu vực **Yêu cầu chia sẻ chờ duyệt** trên dashboard hiện tại.
- Hiển thị danh sách yêu cầu chờ duyệt theo dạng có cấu trúc, dễ đọc.
- Thêm bộ lọc giao diện: **Tất cả**, **Mật**, **Hạn chế**.
- Thay `window.prompt` khi từ chối bằng form nhập lý do trong UI.
- Sau khi duyệt hoặc từ chối, tự làm mới danh sách yêu cầu và danh sách tài liệu.
- Giữ toàn bộ text UI tiếng Việt có dấu chuẩn.
- Cập nhật test frontend phù hợp với UI mới.

### Ngoài phạm vi

- Tạo trang riêng `/share-requests`.
- Duyệt nhiều yêu cầu cùng lúc.
- Thông báo email/SNS khi có yêu cầu mới.
- Thu hồi quyền đã chia sẻ.
- Xem lịch sử yêu cầu đã duyệt hoặc đã từ chối.
- Thay đổi quyền backend đã chốt ở P5.3.
- Deploy AWS trong bước triển khai local.

## Người dùng được thấy workflow

Khu vực quản lý yêu cầu chia sẻ chỉ hiển thị với:

- user có role `DEPARTMENT_ADMIN`; hoặc
- user có role `SYSTEM_ADMIN`.

Backend vẫn là nơi quyết định quyền thật. Frontend chỉ ẩn hoặc hiện UI để trải nghiệm rõ hơn.

## UI dashboard

Dashboard giữ vị trí panel hiện tại nhưng trình bày lại thành một khối rõ hơn:

- Tiêu đề: **Yêu cầu chia sẻ chờ duyệt**.
- Số lượng yêu cầu đang chờ.
- Bộ lọc nhãn: **Tất cả**, **Mật**, **Hạn chế**.
- Trạng thái lỗi nếu tải danh sách thất bại.
- Trạng thái rỗng: **Không có yêu cầu nào đang chờ.**

Mỗi yêu cầu hiển thị:

- tiêu đề tài liệu;
- nhãn dữ liệu;
- phòng ban sở hữu;
- phòng ban nhận;
- người yêu cầu;
- thời gian yêu cầu;
- nút **Duyệt**;
- nút **Từ chối**.

Khi đang xử lý một yêu cầu, chỉ khóa nút của yêu cầu đó để tránh bấm lặp.

## Từ chối yêu cầu

Khi bấm **Từ chối**, UI mở một form nhỏ trong panel:

- hiển thị tên tài liệu đang từ chối;
- textarea nhập lý do;
- nút **Xác nhận từ chối**;
- nút **Hủy**.

Quy tắc:

- Lý do không được rỗng.
- Nếu lý do ngắn hơn 3 ký tự, frontend báo lỗi trước khi gọi API.
- Backend vẫn giữ validation P5.3.
- Sau khi từ chối thành công, form đóng và danh sách được refresh.

## Duyệt yêu cầu

Khi bấm **Duyệt**:

1. Frontend gọi `POST /share-requests/{shareRequestId}/approve`.
2. Nếu thành công, refresh danh sách yêu cầu.
3. Refresh danh sách tài liệu để quyền chia sẻ mới được phản ánh.
4. Hiển thị thông báo thành công ngắn trong panel.

Nếu thất bại, hiển thị lỗi tiếng Việt:

- **Không thể duyệt yêu cầu chia sẻ. Vui lòng thử lại.**

## API

P5.4 không thêm endpoint mới.

Dùng lại API P5.3:

- `GET /share-requests`
- `POST /share-requests/{shareRequestId}/approve`
- `POST /share-requests/{shareRequestId}/reject`

Nếu dữ liệu hiện có thiếu trường để hiển thị UI, chỉ bổ sung mapping frontend hoặc response field đã có trong service, không thay đổi mô hình quyền.

## Audit

P5.4 dùng lại audit P5.3:

- `DOCUMENT_SHARE_APPROVED`
- `DOCUMENT_SHARE_REJECTED`
- `DOCUMENT_SHARE_GRANTED`

Không thêm action mới.

## Kiểm thử

### Frontend

- Department Admin thấy panel yêu cầu chia sẻ.
- Employee không thấy panel yêu cầu chia sẻ.
- Hiển thị yêu cầu chờ duyệt với tiêu đề, nhãn, phòng ban nhận và người yêu cầu.
- Bộ lọc **Mật** chỉ giữ yêu cầu `CONFIDENTIAL`.
- Bộ lọc **Hạn chế** chỉ giữ yêu cầu `RESTRICTED`.
- Bấm **Duyệt** gọi API approve và refresh dữ liệu.
- Bấm **Từ chối** mở form lý do.
- Lý do rỗng hoặc quá ngắn không gọi API.
- Từ chối thành công đóng form và refresh danh sách.

### Backend

Không cần thêm test quyền mới nếu P5.3 đã bao phủ approve/reject. Chỉ thêm backend test nếu phải bổ sung field response.

## Tiêu chí hoàn thành

- Department Admin/System Admin có khu vực duyệt chia sẻ rõ ràng, dùng được.
- Không còn dùng `window.prompt` cho lý do từ chối.
- Bộ lọc nhãn hoạt động đúng.
- Thao tác duyệt/từ chối refresh UI đúng.
- Không mở rộng AWS service.
- Typecheck, lint, test và build local đạt.
