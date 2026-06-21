# P4.6 - Kiểm tra chữ ký và định dạng file

## Mục tiêu

Xác minh nội dung thực của file trong quarantine trước khi chuyển sang trạng thái quét mã độc. File có extension, MIME hoặc cấu trúc không khớp phải bị từ chối và không được phát hành.

## Phạm vi

### Trong phạm vi

- Nhận diện PDF, DOCX, XLSX, PNG và JPEG bằng nội dung file.
- Kiểm tra đồng thời extension, MIME đã khai báo và loại file phát hiện.
- Kiểm tra DOCX/XLSX theo cấu trúc Office Open XML, không chỉ magic bytes `PK`.
- Chuyển file không hợp lệ sang `REJECTED` và lưu lý do an toàn.
- Trả lý do trạng thái qua `GET /documents`.
- Hiển thị lý do từ chối/lỗi trên dashboard.
- Unit test, lint, typecheck, build và CDK synth local.

### Ngoài phạm vi

- Audit log và xử lý nghiệp vụ DLQ.
- OCR, đọc nội dung tài liệu hoặc chống macro nâng cao.
- Antivirus thay thế GuardDuty.
- Hỗ trợ thêm định dạng ngoài allowlist hiện tại.
- Deploy AWS.

## Nhận diện định dạng

Sử dụng thư viện `file-type` trên `Buffer` đầy đủ đã tải từ S3. Thư viện phải trả đúng loại mong đợi:

| Extension | MIME bắt buộc | Loại phát hiện |
| --- | --- | --- |
| `.pdf` | `application/pdf` | `pdf` |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `docx` |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `xlsx` |
| `.png` | `image/png` | `png` |
| `.jpg`, `.jpeg` | `image/jpeg` | `jpg` |

DOCX/XLSX chỉ hợp lệ khi detector nhận diện đúng định dạng Office Open XML. Kết quả chung `zip`, không xác định hoặc loại khác đều bị từ chối.

## Pipeline

1. Kiểm tra object key và metadata S3.
2. Tải object thành `Buffer` một lần.
3. Tính SHA-256 từ buffer và so khớp upload intent.
4. Nhận diện loại file từ buffer.
5. So khớp extension, MIME và loại phát hiện.
6. Nếu sai, cập nhật `REJECTED` với `rejectionReason` rồi kết thúc.
7. Nếu đúng, cập nhật `SCANNING` và tiếp tục luồng GuardDuty hiện tại.

Không tải object lần thứ hai. Giới hạn upload 25 MB hiện tại tiếp tục là giới hạn bộ nhớ đầu vào của bước kiểm tra.

## Đóng gói Lambda

Upload Processor dùng CDK `NodejsFunction` và esbuild ESM để bundle `file-type` vào artifact Lambda. Các Lambda không dùng dependency này giữ cơ chế đóng gói hiện tại.

## Lý do trạng thái

- DynamoDB tiếp tục lưu `rejectionReason` cho `REJECTED` và `failureReason` cho `FAILED`.
- `GET /documents` ánh xạ hai field này thành `statusReason` tùy trạng thái.
- Không trả checksum, S3 key, scan tag nội bộ hoặc exception kỹ thuật cho frontend.
- Frontend chỉ hiển thị `statusReason` khi có giá trị.

## Xử lý lỗi

- Không nhận diện được file: `REJECTED` với thông báo định dạng không hợp lệ.
- Extension không thuộc allowlist hoặc không khớp loại phát hiện: `REJECTED`.
- MIME không khớp loại phát hiện: `REJECTED`.
- Detector phát sinh lỗi do file hỏng: `REJECTED`, không retry SQS.
- Lỗi S3/DynamoDB thật vẫn đi theo retry/DLQ hiện có.

## Kiểm thử

- File PDF, PNG, JPEG hợp lệ được chấp nhận.
- DOCX/XLSX hợp lệ được nhận diện đúng cấu trúc.
- ZIP đổi đuôi DOCX/XLSX bị từ chối.
- PDF đổi đuôi ảnh hoặc MIME sai bị từ chối.
- File không xác định bị từ chối.
- File `REJECTED` không chuyển `SCANNING`, không gọi GuardDuty tag và không copy sang documents bucket.
- API danh sách trả `statusReason`; dashboard hiển thị lý do tiếng Việt.
- Chạy lint, typecheck, toàn bộ test, build và CDK synth local.

## Tiêu chí hoàn thành

- Không file nào vượt qua validation chỉ nhờ extension hoặc MIME do trình duyệt gửi.
- DOCX/XLSX giả mạo ZIP bị từ chối.
- Mỗi object chỉ được tải một lần trong bước validation.
- Lý do từ chối hiển thị được trên dashboard mà không lộ thông tin nội bộ.
- Không deploy hoặc thay đổi tài nguyên AWS trong quá trình triển khai local.
