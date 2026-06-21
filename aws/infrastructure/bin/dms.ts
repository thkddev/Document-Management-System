#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DmsStack } from '../lib/dms-stack.js';

const app = new cdk.App();
const environmentName = app.node.tryGetContext('environment') ?? 'dev';
const alertEmail = app.node.tryGetContext('alertEmail') ?? process.env.DMS_ALERT_EMAIL;
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? 'ap-southeast-1';

new DmsStack(app, `Dms-${environmentName}`, {
  environmentName,
  alertEmail,
  env: account ? { account, region } : { region },
  description: `DMS serverless foundation (${environmentName})`,
});
