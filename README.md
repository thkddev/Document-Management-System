# Document Management System

DMS là ứng dụng React với AWS serverless backend để quản lý tài liệu, phiên bản, quyền chia sẻ và lịch sử thao tác.

## Workspace

- `frontend/`: React, TypeScript, Vite.
- `aws/functions/`: Lambda handlers và domain logic.
- `aws/infrastructure/`: AWS CDK.
- `contracts/`: OpenAPI và schema dùng chung.
- `docs/`: data model và quyết định kỹ thuật.
- `sample-data/`: dữ liệu giả lập, không chứa thông tin thật.

## Lệnh chính

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run cdk:synth
```

Đọc `instruction.md` trước khi thay đổi code và cập nhật `analysis_plan.md` khi hoàn thành một hạng mục.

## Triển khai AWS dev với cảnh báo bảo mật

```powershell
cd aws/infrastructure
npx cdk deploy -c environment=dev -c alertEmail=<email-canh-bao>
```

Sau khi deploy, mở email AWS gửi tới địa chỉ cảnh báo và chọn **Confirm subscription**. Có thể dùng biến môi trường `DMS_ALERT_EMAIL` thay cho CDK context để không lưu địa chỉ email trong lịch sử lệnh.
