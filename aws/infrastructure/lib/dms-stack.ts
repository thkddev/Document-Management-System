import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export interface DmsStackProps extends cdk.StackProps {
  environmentName: string;
  alertEmail?: string;
}

export class DmsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DmsStackProps) {
    super(scope, id, props);

    const isProduction = props.environmentName === 'production';
    const removalPolicy = isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `dms-${props.environmentName}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: true, mutable: true },
      },
      customAttributes: {
        departmentId: new cognito.StringAttribute({ mutable: true, minLen: 2, maxLen: 40 }),
        employeeCode: new cognito.StringAttribute({ mutable: true, minLen: 1, maxLen: 40 }),
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy,
    });

    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: { userSrp: true, userPassword: true },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(7),
    });
    const corsAllowOrigin = isProduction ? 'https://dms.example.com' : 'http://localhost:5173';

    for (const [groupName, precedence] of [
      ['EMPLOYEE', 30],
      ['DEPARTMENT_ADMIN', 20],
      ['SYSTEM_ADMIN', 10],
    ] as const) {
      new cognito.CfnUserPoolGroup(this, `${groupName}Group`, {
        userPoolId: userPool.userPoolId,
        groupName,
        precedence,
      });
    }

    const frontendBucket = this.createPrivateBucket('FrontendBucket', removalPolicy, isProduction);
    const quarantineBucket = this.createPrivateBucket(
      'QuarantineBucket',
      removalPolicy,
      isProduction,
    );
    const documentsBucket = this.createPrivateBucket(
      'DocumentsBucket',
      removalPolicy,
      isProduction,
    );

    quarantineBucket.addLifecycleRule({
      id: 'ExpireQuarantineObjectsAfterSevenDays',
      abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
      expiration: cdk.Duration.days(7),
    });
    quarantineBucket.addCorsRule({
      allowedOrigins: isProduction ? ['https://dms.example.com'] : ['http://localhost:5173'],
      allowedMethods: [s3.HttpMethods.PUT],
      allowedHeaders: ['content-type', 'x-amz-*'],
      exposedHeaders: ['etag'],
      maxAge: 300,
    });

    const table = new dynamodb.Table(this, 'DocumentsTable', {
      tableName: `dms-${props.environmentName}`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'expiresAtEpoch',
      removalPolicy,
    });

    // GSI1: tài liệu theo phòng ban — pk=DEPT#{departmentId}, sk=UPDATED#{updatedAt}#DOC#{documentId}
    table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: tài liệu theo owner — pk=OWNER#{ownerId}, sk=UPDATED#{updatedAt}#DOC#{documentId}
    table.addGlobalSecondaryIndex({
      indexName: 'gsi2',
      partitionKey: { name: 'gsi2pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi2sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI3: tài liệu được chia sẻ với principal — pk=PRINCIPAL#{type}#{id}, sk=SHARED#{createdAt}#DOC#{documentId}
    table.addGlobalSecondaryIndex({
      indexName: 'gsi3',
      partitionKey: { name: 'gsi3pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi3sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI4: phát hiện nội dung trùng checksum — pk=CHECKSUM#{sha256}, sk=DOC#{documentId}#VERSION#{version}
    table.addGlobalSecondaryIndex({
      indexName: 'gsi4',
      partitionKey: { name: 'gsi4pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi4sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    const meFunction = new lambda.Function(this, 'MeFunction', {
      code: lambda.Code.fromAsset(path.join(currentDirectory, '../../functions/dist')),
      handler: 'handlers/me.handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      logGroup: new logs.LogGroup(this, 'MeFunctionLogs', {
        retention: isProduction ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS,
        removalPolicy,
      }),
      environment: {
        TABLE_NAME: table.tableName,
        DOCUMENTS_BUCKET_NAME: documentsBucket.bucketName,
        QUARANTINE_BUCKET_NAME: quarantineBucket.bucketName,
        ENVIRONMENT_NAME: props.environmentName,
        CORS_ALLOW_ORIGIN: corsAllowOrigin,
      },
    });

    table.grantReadWriteData(meFunction);
    documentsBucket.grantReadWrite(meFunction);
    quarantineBucket.grantReadWrite(meFunction);

    const documentsFunction = new lambda.Function(this, 'DocumentsFunction', {
      code: lambda.Code.fromAsset(path.join(currentDirectory, '../../functions/dist')),
      handler: 'handlers/documents.handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      logGroup: new logs.LogGroup(this, 'DocumentsFunctionLogs', {
        retention: isProduction ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS,
        removalPolicy,
      }),
      environment: {
        TABLE_NAME: table.tableName,
        ENVIRONMENT_NAME: props.environmentName,
        CORS_ALLOW_ORIGIN: corsAllowOrigin,
      },
    });

    table.grantReadData(documentsFunction);

    const documentDetailFunction = new lambda.Function(this, 'DocumentDetailFunction', {
      code: lambda.Code.fromAsset(path.join(currentDirectory, '../../functions/dist')),
      handler: 'handlers/document-detail.handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      logGroup: new logs.LogGroup(this, 'DocumentDetailFunctionLogs', {
        retention: isProduction ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS,
        removalPolicy,
      }),
      environment: {
        TABLE_NAME: table.tableName,
        ENVIRONMENT_NAME: props.environmentName,
        CORS_ALLOW_ORIGIN: corsAllowOrigin,
      },
    });
    table.grantReadData(documentDetailFunction);

    const downloadIntentFunction = new lambda.Function(this, 'DownloadIntentFunction', {
      code: lambda.Code.fromAsset(path.join(currentDirectory, '../../functions/dist')),
      handler: 'handlers/download-intents.handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      tracing: lambda.Tracing.ACTIVE,
      logGroup: new logs.LogGroup(this, 'DownloadIntentFunctionLogs', {
        retention: isProduction ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS,
        removalPolicy,
      }),
      environment: {
        TABLE_NAME: table.tableName,
        DOCUMENTS_BUCKET_NAME: documentsBucket.bucketName,
        ENVIRONMENT_NAME: props.environmentName,
        CORS_ALLOW_ORIGIN: corsAllowOrigin,
      },
    });
    table.grantReadWriteData(downloadIntentFunction);
    documentsBucket.grantRead(downloadIntentFunction);

    const documentSharingFunction = new lambda.Function(this, 'DocumentSharingFunction', {
      code: lambda.Code.fromAsset(path.join(currentDirectory, '../../functions/dist')),
      handler: 'handlers/document-sharing.handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      tracing: lambda.Tracing.ACTIVE,
      logGroup: new logs.LogGroup(this, 'DocumentSharingFunctionLogs', {
        retention: isProduction ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS,
        removalPolicy,
      }),
      environment: {
        TABLE_NAME: table.tableName,
        ENVIRONMENT_NAME: props.environmentName,
        CORS_ALLOW_ORIGIN: corsAllowOrigin,
      },
    });
    table.grantReadWriteData(documentSharingFunction);

    const uploadIntentFunction = new lambda.Function(this, 'UploadIntentFunction', {
      code: lambda.Code.fromAsset(path.join(currentDirectory, '../../functions/dist')),
      handler: 'handlers/upload-intents.handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      tracing: lambda.Tracing.ACTIVE,
      logGroup: new logs.LogGroup(this, 'UploadIntentFunctionLogs', {
        retention: isProduction ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS,
        removalPolicy,
      }),
      environment: {
        TABLE_NAME: table.tableName,
        QUARANTINE_BUCKET_NAME: quarantineBucket.bucketName,
        ENVIRONMENT_NAME: props.environmentName,
        CORS_ALLOW_ORIGIN: corsAllowOrigin,
      },
    });

    table.grantReadWriteData(uploadIntentFunction);
    quarantineBucket.grantReadWrite(uploadIntentFunction);

    const uploadDeadLetterQueue = new sqs.Queue(this, 'UploadDeadLetterQueue', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: cdk.Duration.minutes(2),
      retentionPeriod: cdk.Duration.days(14),
      removalPolicy,
    });
    const uploadQueue = new sqs.Queue(this, 'UploadQueue', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: cdk.Duration.minutes(6),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: uploadDeadLetterQueue,
        maxReceiveCount: 10,
      },
      removalPolicy,
    });

    quarantineBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT,
      new s3n.SqsDestination(uploadQueue),
      { prefix: 'quarantine/' },
    );

    const malwareProtectionRole = new iam.Role(this, 'MalwareProtectionRole', {
      assumedBy: new iam.ServicePrincipal('malware-protection-plan.guardduty.amazonaws.com'),
      description: 'Cho phep GuardDuty quet va gan tag cho file trong S3 quarantine.',
    });
    malwareProtectionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetObject',
          's3:GetObjectVersion',
          's3:GetObjectTagging',
          's3:GetObjectVersionTagging',
          's3:PutObjectTagging',
          's3:PutObjectVersionTagging',
        ],
        resources: [quarantineBucket.arnForObjects('*')],
      }),
    );
    malwareProtectionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetBucketLocation',
          's3:GetBucketNotification',
          's3:GetBucketPolicyStatus',
          's3:GetBucketPublicAccessBlock',
          's3:ListBucket',
          's3:PutBucketNotification',
        ],
        resources: [quarantineBucket.bucketArn],
      }),
    );
    malwareProtectionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [
          quarantineBucket.arnForObjects('malware-protection-resource-validation-object'),
        ],
      }),
    );
    const guardDutyManagedRuleArn = cdk.Stack.of(this).formatArn({
      service: 'events',
      resource: 'rule',
      resourceName: 'DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3*',
    });
    malwareProtectionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'events:DeleteRule',
          'events:DescribeRule',
          'events:ListTargetsByRule',
          'events:PutRule',
          'events:PutTargets',
          'events:RemoveTargets',
        ],
        resources: [guardDutyManagedRuleArn],
        conditions: {
          StringLike: {
            'events:ManagedBy': 'malware-protection-plan.guardduty.amazonaws.com',
          },
        },
      }),
    );

    const malwareProtectionPlan = new guardduty.CfnMalwareProtectionPlan(
      this,
      'MalwareProtectionPlan',
      {
        role: malwareProtectionRole.roleArn,
        protectedResource: {
          s3Bucket: {
            bucketName: quarantineBucket.bucketName,
            objectPrefixes: ['quarantine/'],
          },
        },
        actions: { tagging: { status: 'ENABLED' } },
      },
    );
    malwareProtectionPlan.node.addDependency(malwareProtectionRole);

    const uploadProcessorLogGroup = new logs.LogGroup(this, 'UploadProcessorFunctionLogs', {
      retention: isProduction ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS,
      removalPolicy,
    });
    const uploadProcessorFunction = new nodejs.NodejsFunction(this, 'UploadProcessorFunction', {
      entry: path.join(currentDirectory, '../../functions/src/handlers/process-upload.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: 'node22',
        sourceMap: true,
        banner:
          "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
      logGroup: uploadProcessorLogGroup,
      environment: {
        TABLE_NAME: table.tableName,
        DOCUMENTS_BUCKET_NAME: documentsBucket.bucketName,
        ENVIRONMENT_NAME: props.environmentName,
      },
    });

    table.grantReadWriteData(uploadProcessorFunction);
    quarantineBucket.grantRead(uploadProcessorFunction);
    documentsBucket.grantReadWrite(uploadProcessorFunction);
    uploadProcessorFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(uploadQueue, {
        batchSize: 5,
        reportBatchItemFailures: true,
      }),
    );

    const alertTopic = new sns.Topic(this, 'SecurityAlertTopic', {
      displayName: `DMS ${props.environmentName} security alerts`,
    });
    if (props.alertEmail) {
      alertTopic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
    }
    const alertAction = new cloudwatchActions.SnsAction(alertTopic);

    const uploadDlqProcessorLogGroup = new logs.LogGroup(this, 'UploadDlqProcessorFunctionLogs', {
      retention: isProduction ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS,
      removalPolicy,
    });
    const uploadDlqProcessorFunction = new lambda.Function(this, 'UploadDlqProcessorFunction', {
      code: lambda.Code.fromAsset(path.join(currentDirectory, '../../functions/dist')),
      handler: 'handlers/process-upload-dlq.handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      logGroup: uploadDlqProcessorLogGroup,
      environment: {
        TABLE_NAME: table.tableName,
        ALERT_TOPIC_ARN: alertTopic.topicArn,
        ENVIRONMENT_NAME: props.environmentName,
      },
    });
    table.grantReadWriteData(uploadDlqProcessorFunction);
    alertTopic.grantPublish(uploadDlqProcessorFunction);
    uploadDlqProcessorFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(uploadDeadLetterQueue, {
        batchSize: 5,
        reportBatchItemFailures: true,
      }),
    );

    const securityEventFilter = new logs.MetricFilter(this, 'SecurityEventMetricFilter', {
      logGroup: uploadProcessorLogGroup,
      filterPattern: logs.FilterPattern.anyTerm('MALWARE_INFECTED', 'MALWARE_SCAN_FAILED'),
      metricNamespace: 'DMS/Security',
      metricName: 'UnsafeUploadEvents',
      metricValue: '1',
      defaultValue: 0,
    });
    const unsafeUploadAlarm = new cloudwatch.Alarm(this, 'UnsafeUploadAlarm', {
      metric: securityEventFilter.metric({ period: cdk.Duration.minutes(1), statistic: 'Sum' }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Phat hien file nhiem hoac malware scan that bai.',
    });
    unsafeUploadAlarm.addAlarmAction(alertAction);

    const deadLetterAlarm = new cloudwatch.Alarm(this, 'UploadDeadLetterAlarm', {
      metric: uploadDeadLetterQueue.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(1),
        statistic: 'Maximum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Upload job da vao dead-letter queue.',
    });
    deadLetterAlarm.addAlarmAction(alertAction);

    const processorErrorAlarm = new cloudwatch.Alarm(this, 'UploadProcessorErrorAlarm', {
      metric: uploadProcessorFunction.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Upload Processor Lambda phat sinh loi he thong.',
    });
    processorErrorAlarm.addAlarmAction(alertAction);

    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: `dms-${props.environmentName}`,
      deployOptions: {
        stageName: props.environmentName,
        tracingEnabled: true,
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        throttlingRateLimit: 50,
        throttlingBurstLimit: 100,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: [corsAllowOrigin],
        allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['authorization', 'content-type', 'x-request-id'],
      },
    });

    for (const [responseName, responseType] of [
      ['Default4xxGatewayResponse', apigateway.ResponseType.DEFAULT_4XX],
      ['Default5xxGatewayResponse', apigateway.ResponseType.DEFAULT_5XX],
      ['UnauthorizedGatewayResponse', apigateway.ResponseType.UNAUTHORIZED],
      ['AccessDeniedGatewayResponse', apigateway.ResponseType.ACCESS_DENIED],
    ] as const) {
      api.addGatewayResponse(responseName, {
        type: responseType,
        responseHeaders: {
          'Access-Control-Allow-Origin': `'${corsAllowOrigin}'`,
          'Access-Control-Allow-Headers': "'authorization,content-type,x-request-id'",
          'Access-Control-Allow-Methods': "'GET,POST,PATCH,DELETE,OPTIONS'",
          Vary: "'Origin'",
        },
      });
    }

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
    });

    api.root.addResource('me').addMethod('GET', new apigateway.LambdaIntegration(meFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const documentsResource = api.root.addResource('documents');
    documentsResource.addMethod('GET', new apigateway.LambdaIntegration(documentsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const documentResource = documentsResource.addResource('{documentId}');
    documentResource.addMethod('GET', new apigateway.LambdaIntegration(documentDetailFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    documentResource
      .addResource('download-intents')
      .addMethod('POST', new apigateway.LambdaIntegration(downloadIntentFunction), {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      });
    documentResource
      .addResource('department-shares')
      .addMethod('POST', new apigateway.LambdaIntegration(documentSharingFunction), {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      });

    documentsResource
      .addResource('upload-intents')
      .addMethod('POST', new apigateway.LambdaIntegration(uploadIntentFunction), {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      });

    const shareRequestsResource = api.root.addResource('share-requests');
    shareRequestsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(documentSharingFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );
    const shareRequestResource = shareRequestsResource.addResource('{shareRequestId}');
    shareRequestResource
      .addResource('approve')
      .addMethod('POST', new apigateway.LambdaIntegration(documentSharingFunction), {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      });
    shareRequestResource
      .addResource('reject')
      .addMethod('POST', new apigateway.LambdaIntegration(documentSharingFunction), {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'CloudFrontUrl', { value: `https://${distribution.domainName}` });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'UploadQueueUrl', { value: uploadQueue.queueUrl });
    new cdk.CfnOutput(this, 'SecurityAlertTopicArn', { value: alertTopic.topicArn });
  }

  private createPrivateBucket(
    id: string,
    removalPolicy: cdk.RemovalPolicy,
    isProduction: boolean,
  ): s3.Bucket {
    return new s3.Bucket(this, id, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: id === 'DocumentsBucket',
      removalPolicy,
      autoDeleteObjects: !isProduction,
    });
  }
}
