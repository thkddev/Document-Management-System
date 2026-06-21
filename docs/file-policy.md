# Chính sách file DMS

## Allowlist

| Extension | MIME |
| --- | --- |
| `.pdf` | `application/pdf` |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |

Dung lượng tối đa hiện tại là 25 MB mỗi file.

## Kiểm tra bắt buộc

- Extension phải khớp MIME đã khai báo.
- Nội dung thật phải được nhận diện đúng bằng chữ ký file.
- DOCX/XLSX phải có cấu trúc Office Open XML; ZIP thông thường đổi đuôi không hợp lệ.
- SHA-256 phải khớp upload intent.
- File không hợp lệ chuyển sang `REJECTED` và không được gửi sang vùng phát hành.
- File hợp lệ chỉ chuyển sang `READY` sau khi GuardDuty trả `NO_THREATS_FOUND`.

## Lưu trữ

- Object trong quarantine tự hết hạn sau 7 ngày.
- Chỉ file sạch được sao chép sang documents bucket.
- Lý do từ chối hiển thị cho người dùng không chứa S3 key, checksum hoặc exception nội bộ.
