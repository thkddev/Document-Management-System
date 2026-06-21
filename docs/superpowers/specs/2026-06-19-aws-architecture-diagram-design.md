# Thiết kế sơ đồ kiến trúc AWS DMS

## Phạm vi

Tạo một file PowerPoint duy nhất, gồm một slide 16:9, mô tả chính xác kiến trúc DMS serverless hiện có trong mã CDK và luồng tải tài liệu P4.

## Ranh giới kiến trúc

- Người dùng nằm ngoài AWS Cloud.
- Amazon CloudFront và AWS IAM nằm trong AWS Cloud nhưng ngoài Region vì là dịch vụ global.
- Region `ap-southeast-1` chứa Amazon Cognito, Amazon API Gateway, AWS Lambda, Amazon DynamoDB, Amazon CloudWatch và ba bucket Amazon S3.
- Không vẽ VPC, EC2, RDS, NAT Gateway, SQS hoặc SNS vì hạ tầng hiện tại không sử dụng các dịch vụ này.

## Thành phần

- Amazon CloudFront phân phối React SPA từ S3 Frontend Bucket.
- Amazon Cognito xác thực người dùng và cấp JWT.
- Amazon API Gateway bảo vệ `/me` và `/documents/upload-intents` bằng Cognito authorizer.
- Me Lambda đọc claim người dùng.
- Upload Intent Lambda kiểm tra metadata, ghi DynamoDB và tạo presigned URL.
- Trình duyệt tải file trực tiếp vào S3 Quarantine Bucket.
- S3 ObjectCreated kích hoạt Upload Processor Lambda.
- Upload Processor xác minh metadata/checksum, cập nhật trạng thái và sao chép file sạch sang S3 Documents Bucket.
- DynamoDB lưu user/document/upload intent và trạng thái xử lý.
- CloudWatch nhận log, metric và trace.
- IAM áp dụng quyền tối thiểu cho CloudFront, API Gateway và Lambda.

## Luồng đánh số

1. Người dùng gửi HTTPS request tới CloudFront.
2. CloudFront lấy React SPA từ S3 Frontend Bucket.
3. Người dùng đăng nhập qua Cognito và nhận JWT.
4. React gọi API Gateway bằng JWT.
5. API Gateway xác thực JWT với Cognito authorizer.
6. API Gateway gọi Me Lambda hoặc Upload Intent Lambda.
7. Lambda đọc/ghi metadata trong DynamoDB.
8. Upload Intent Lambda tạo presigned URL cho S3 Quarantine Bucket.
9. Trình duyệt PUT file trực tiếp lên S3 bằng presigned URL.
10. S3 ObjectCreated kích hoạt Upload Processor Lambda.
11. Processor xác minh file, cập nhật DynamoDB và sao chép file sạch sang S3 Documents Bucket.
12. API Gateway và Lambda gửi log, metric, trace tới CloudWatch.

## Ghi chú chính xác

- Amazon S3 là dịch vụ Regional trong sơ đồ này.
- Amazon Cognito User Pool là tài nguyên Regional.
- Malware scanner thật chưa được tích hợp; processor hiện dùng scanner placeholder trả kết quả `CLEAN`.
- CDK và CloudFormation là công cụ triển khai, không thuộc runtime flow nên không đặt trong luồng chính.

## Tiêu chí nghiệm thu

- Dùng icon AWS chính thức từ deck người dùng cung cấp.
- Mọi đối tượng chính vẫn chỉnh sửa được trong PowerPoint.
- Không có chữ tràn, đường nối sai hướng hoặc thành phần nằm sai ranh giới Global/Regional.
- File đầu ra chỉ gồm một PPTX hoàn chỉnh.
