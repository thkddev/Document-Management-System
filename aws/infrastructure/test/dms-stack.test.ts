import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { DmsStack } from '../lib/dms-stack.js';

function synthesizeTemplate(alertEmail?: string): Template {
  const app = new cdk.App();
  const stack = new DmsStack(app, 'TestStack', { environmentName: 'test', alertEmail });
  return Template.fromStack(stack);
}

describe('DmsStack', () => {
  it('tạo các dịch vụ serverless cốt lõi', () => {
    const template = synthesizeTemplate();

    template.resourceCountIs('AWS::S3::Bucket', 3);
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  });

  it('chặn public access trên tất cả bucket', () => {
    const template = synthesizeTemplate();

    template.allResourcesProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('bật point-in-time recovery cho DynamoDB', () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
    });
  });

  it('có đủ 4 GSI với tên đúng', () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: 'gsi1' }),
        Match.objectLike({ IndexName: 'gsi2' }),
        Match.objectLike({ IndexName: 'gsi3' }),
        Match.objectLike({ IndexName: 'gsi4' }),
      ]),
    });
  });

  it('GSI4 dùng KEYS_ONLY projection để tiết kiệm chi phí', () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'gsi4',
          Projection: { ProjectionType: 'KEYS_ONLY' },
        }),
      ]),
    });
  });

  it('DynamoDB bật TTL attribute', () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TimeToLiveSpecification: {
        AttributeName: 'expiresAtEpoch',
        Enabled: true,
      },
    });
  });

  it('cấu hình route tạo upload intent được bảo vệ bằng Cognito', () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'POST',
      AuthorizationType: 'COGNITO_USER_POOLS',
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'handlers/upload-intents.handler',
      Runtime: 'nodejs22.x',
    });
  });

  it('cấu hình route danh sách tài liệu được bảo vệ bằng Cognito', () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'GET',
      AuthorizationType: 'COGNITO_USER_POOLS',
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'handlers/documents.handler',
      Runtime: 'nodejs22.x',
      Environment: {
        Variables: Match.objectLike({ TABLE_NAME: Match.anyValue() }),
      },
    });
  });

  it('cấu hình route chi tiết tài liệu và download intent bằng Cognito', () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'handlers/document-detail.handler',
      Runtime: 'nodejs22.x',
      Environment: {
        Variables: Match.objectLike({ TABLE_NAME: Match.anyValue() }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'handlers/download-intents.handler',
      Runtime: 'nodejs22.x',
      Environment: {
        Variables: Match.objectLike({
          TABLE_NAME: Match.anyValue(),
          DOCUMENTS_BUCKET_NAME: Match.anyValue(),
        }),
      },
    });
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'GET',
      AuthorizationType: 'COGNITO_USER_POOLS',
    });
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'POST',
      AuthorizationType: 'COGNITO_USER_POOLS',
    });
  });

  it('cấu hình S3 -> SQS -> Lambda với DLQ và partial batch failure', () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'index.handler',
      Runtime: 'nodejs22.x',
      Environment: {
        Variables: Match.objectLike({ DOCUMENTS_BUCKET_NAME: Match.anyValue() }),
      },
    });
    template.hasResourceProperties('Custom::S3BucketNotifications', {
      NotificationConfiguration: Match.objectLike({
        QueueConfigurations: Match.arrayWith([
          Match.objectLike({
            Events: ['s3:ObjectCreated:Put'],
            Filter: Match.objectLike({
              Key: Match.objectLike({
                FilterRules: Match.arrayWith([
                  Match.objectLike({ Name: 'prefix', Value: 'quarantine/' }),
                ]),
              }),
            }),
          }),
        ]),
      }),
    });
    template.resourceCountIs('AWS::SQS::Queue', 2);
    template.resourceCountIs('AWS::Lambda::EventSourceMapping', 2);
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 5,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    });
  });

  it('tự động xử lý DLQ và gửi cảnh báo an toàn qua SNS', () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'handlers/process-upload-dlq.handler',
      Runtime: 'nodejs22.x',
      MemorySize: 256,
      Timeout: 30,
      Environment: {
        Variables: Match.objectLike({
          TABLE_NAME: Match.anyValue(),
          ALERT_TOPIC_ARN: Match.anyValue(),
          ENVIRONMENT_NAME: 'test',
        }),
      },
    });
  });

  it('cấu hình GuardDuty malware protection cho prefix quarantine', () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties('AWS::GuardDuty::MalwareProtectionPlan', {
      Actions: { Tagging: { Status: 'ENABLED' } },
      ProtectedResource: {
        S3Bucket: Match.objectLike({ ObjectPrefixes: ['quarantine/'] }),
      },
    });
  });

  it('tạo CloudWatch alarms, SNS topic và email subscription tùy chọn', () => {
    const template = synthesizeTemplate('alerts@example.com');

    template.resourceCountIs('AWS::CloudWatch::Alarm', 3);
    template.resourceCountIs('AWS::SNS::Topic', 1);
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'alerts@example.com',
    });
  });

  it('xóa object quarantine sau 7 ngày', () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([Match.objectLike({ ExpirationInDays: 7, Status: 'Enabled' })]),
      },
    });
  });
});
