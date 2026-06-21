# Sửa lỗi S3 presigned upload HTTP 403

## Bối cảnh

API tạo upload intent thành công, nhưng thao tác `PUT` trực tiếp từ trình duyệt đến S3 trả về HTTP 403. URL do AWS SDK tạo chỉ ký header `host`; các metadata `x-amz-meta-*` đã được đưa vào query string của presigned URL. Frontend hiện gửi lại các metadata đó dưới dạng header, khiến request chứa header AWS không thuộc chữ ký và bị S3 từ chối.

## Thiết kế được duyệt

- Giữ `Metadata` trong `PutObjectCommand` để presigner đưa metadata vào URL ký sẵn.
- `uploadHeaders` trả về frontend chỉ chứa `content-type`.
- Frontend tiếp tục gửi chính xác các header do API trả về, không tự xây thêm metadata.
- Không thay đổi schema DynamoDB, cấu trúc object key, CORS hoặc quyền IAM.

## Luồng dữ liệu

1. Frontend gọi `POST /documents/upload-intents`.
2. Lambda tạo `PutObjectCommand` có metadata và sinh presigned URL.
3. API trả URL cùng header `content-type`.
4. Frontend `PUT` file lên URL đó.
5. S3 nhận metadata từ query string đã ký và lưu object vào vùng quarantine.

## Xử lý lỗi

Frontend giữ nguyên thông báo HTTP khi S3 từ chối upload. Không thêm retry tự động vì URL có thời hạn và retry không giải quyết lỗi chữ ký hoặc quyền.

## Kiểm thử

- Unit test xác nhận `uploadHeaders` không chứa `x-amz-meta-*`.
- Unit test xác nhận `PutObjectCommand` vẫn chứa đầy đủ metadata.
- Chạy lint, typecheck, test và build.
- Sau khi deploy Lambda, thực hiện một upload tổng hợp để xác nhận S3 trả HTTP 200.

## Phạm vi

Thay đổi chỉ tác động contract header của upload intent và các test liên quan. Không thay đổi UI, nội dung tiếng Việt hoặc kiến trúc SQS/GuardDuty.
