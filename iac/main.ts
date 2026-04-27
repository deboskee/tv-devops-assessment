// =============================================================================
// Main CDKTF Application
// =============================================================================

import { App, TerraformStack, TerraformOutput, S3Backend } from 'cdktf';
import { Construct } from 'constructs';
import { AwsProvider } from '@cdktf/provider-aws/lib/provider';
import { RandomProvider } from '@cdktf/provider-random/lib/provider';
import { StringResource } from '@cdktf/provider-random/lib/string-resource';
import { loadConfig, AppConfig } from './config';
import { VpcConstruct } from './lib/vpc';
import { EcrConstruct } from './lib/ecr';
import { IamConstruct } from './lib/iam';
import { AlbConstruct } from './lib/alb';
import { EcsConstruct } from './lib/ecs';
import { MonitoringConstruct } from './lib/monitoring';

class ExpressTsAppStack extends TerraformStack {
  constructor(scope: Construct, id: string, config: AppConfig) {
    super(scope, id);

    // ==========================================================================
    // Providers
    // ==========================================================================
    new AwsProvider(this, 'aws', {
      region: config.aws.region,
      defaultTags: [{
        tags: config.tags
      }]
    });

    new RandomProvider(this, 'random');

    // ==========================================================================
    // Remote Backend Configuration
    // ==========================================================================
    if (config.backend?.bucket) {
      new S3Backend(this, {
        bucket: config.backend.bucket,
        key: `terraform.${config.environment}.tfstate`,
        region: config.aws.region,
        dynamodbTable: config.backend.dynamodbTable,
        encrypt: true
      });
    }

    // ==========================================================================
    // Random Suffix for Dynamic Resources
    // ==========================================================================
    const suffix = new StringResource(this, 'suffix', {
      length: 4,
      special: false,
      upper: false
    });

    // Create a unique prefix for all resources. 
    // We truncate the static part to 24 chars to leave room for the 4-char suffix and '-tg' suffix (total 32).
    // This ensures we stay within AWS limits for ALB/TargetGroup names without truncating CDKTF tokens.
    const basePrefix = `${config.appName}-${config.environment}`.substring(0, 24);
    const dynamicPrefix = `${basePrefix}-${suffix.result}`;
    const ecrRepoName = dynamicPrefix; // Now dynamic! Scripts must extract this from synth output before pushing.

    // ==========================================================================
    // Monitoring (Log Group created first for IAM)
    // ==========================================================================
    const monitoring = new MonitoringConstruct(this, 'monitoring', {
      ...config,
      appName: dynamicPrefix // Propagate dynamic name
    });

    // ==========================================================================
    // Networking (VPC remains stable/static)
    // ==========================================================================
    const vpc = new VpcConstruct(this, 'vpc', config);

    // ==========================================================================
    // Container Registry
    // ==========================================================================
    const ecr = new EcrConstruct(this, 'ecr', {
      ...config,
      ecr: {
        ...config.ecr,
        repositoryName: ecrRepoName // We keep ECR name stable but handle it with self-healing
      }
    });

    // ==========================================================================
    // IAM Roles & Policies
    // ==========================================================================
    const iam = new IamConstruct(this, 'iam', {
      ...config,
      appName: dynamicPrefix
    }, ecr.outputs.repositoryArn, monitoring.outputs.logGroupArn);

    // ==========================================================================
    // Load Balancing
    // ==========================================================================
    const alb = new AlbConstruct(
      this,
      'alb',
      {
        ...config,
        appName: dynamicPrefix
      },
      vpc.outputs.vpcId,
      vpc.outputs.publicSubnetIds,
      vpc.outputs.albSecurityGroupId,
      '' // No SSL cert for now
    );

    // ==========================================================================
    // Compute (ECS)
    // ==========================================================================
    const ecs = new EcsConstruct(
      this,
      'ecs',
      {
        ...config,
        appName: dynamicPrefix
      },
      vpc.outputs.privateSubnetIds,
      vpc.outputs.ecsSecurityGroupId,
      alb.outputs.targetGroupArn,
      iam.outputs.taskRoleArn,
      iam.outputs.executionRoleArn,
      `${ecr.outputs.repositoryUrl}:${config.ecs.imageTag}`,
      monitoring.outputs.logGroupName
    );

    // ==========================================================================
    // CloudWatch Alarms & Dashboard
    // ==========================================================================
    if (config.monitoring.enableAlarms) {
      monitoring.createAlarms(
        config,
        ecs.outputs.clusterName,
        ecs.outputs.serviceName,
        alb.outputs.albArnSuffix,
        alb.outputs.targetGroupArnSuffix
      );
    }

    monitoring.createDashboard(
      config,
      ecs.outputs.clusterName,
      ecs.outputs.serviceName,
      alb.outputs.albArnSuffix
    );

    // ==========================================================================
    // Outputs
    // ==========================================================================
    new TerraformOutput(this, 'vpc_id', { value: vpc.outputs.vpcId });
    new TerraformOutput(this, 'ecr_repository_url', { value: ecr.outputs.repositoryUrl });
    new TerraformOutput(this, 'alb_dns_name', { value: alb.outputs.albDnsName });
    new TerraformOutput(this, 'ecs_cluster_name', { value: ecs.outputs.clusterName });
    new TerraformOutput(this, 'ecs_service_name', { value: ecs.outputs.serviceName });
    new TerraformOutput(this, 'cloudwatch_log_group', { value: monitoring.outputs.logGroupArn });
    new TerraformOutput(this, 'app_url', { value: `http://${alb.outputs.albDnsName}` });
  }
}

const app = new App();
const config = loadConfig();

new ExpressTsAppStack(app, `express-ts-app-${config.environment}`, config);
app.synth();
