// =============================================================================
// Main CDKTF Application
// =============================================================================
// Orchestrates all infrastructure resources for the Express.js application
// =============================================================================

import { App, TerraformStack, TerraformOutput, S3Backend } from 'cdktf';
import { Construct } from 'constructs';
import { AwsProvider } from '@cdktf/provider-aws/lib/provider';
import { loadConfig, AppConfig } from './config';
import { VpcConstruct } from './lib/vpc';
import { EcrConstruct } from './lib/ecr';
import { IamConstruct } from './lib/iam';
import { AlbConstruct } from './lib/alb';
import { EcsConstruct } from './lib/ecs';
import { MonitoringConstruct } from './lib/monitoring';
import { Route53Construct } from './lib/route53';

class ExpressTsAppStack extends TerraformStack {
  constructor(scope: Construct, id: string, config: AppConfig) {
    super(scope, id);

    // ==========================================================================
    // Remote Backend Configuration
    // ==========================================================================
    new S3Backend(this, {
      bucket: config.backend.bucket,
      key: `terraform.${config.environment}.tfstate`,
      region: config.aws.region,
      dynamodbTable: config.backend.dynamodbTable,
      encrypt: true
    });

    // ==========================================================================
    // AWS Provider
    // ==========================================================================
    new AwsProvider(this, 'aws', {
      region: config.aws.region,
      defaultTags: [{
        tags: config.tags
      }]
    });

    // ==========================================================================
    // Monitoring (Log Group created first for IAM)
    // ==========================================================================
    const monitoring = new MonitoringConstruct(this, 'monitoring', config);

    // ==========================================================================
    // Networking
    // ==========================================================================
    const vpc = new VpcConstruct(this, 'vpc', config);

    // ==========================================================================
    // Container Registry
    // ==========================================================================
    const ecr = new EcrConstruct(this, 'ecr', config);

    // ==========================================================================
    // IAM Roles & Policies
    // ==========================================================================
    const iam = new IamConstruct(this, 'iam', config, ecr.outputs.repositoryArn, monitoring.outputs.logGroupArn);

    // ==========================================================================
    // Load Balancing
    // ==========================================================================
    const route53 = new Route53Construct(this, 'route53', config, '', ''); // Placeholder, updated later

    const alb = new AlbConstruct(
      this,
      'alb',
      config,
      vpc.outputs.vpcId,
      vpc.outputs.publicSubnetIds,
      vpc.outputs.albSecurityGroupId,
      route53.outputs.certificateArn
    );

    // ==========================================================================
    // Compute (ECS)
    // ==========================================================================
    const ecs = new EcsConstruct(
      this,
      'ecs',
      config,
      vpc.outputs.privateSubnetIds,
      vpc.outputs.ecsSecurityGroupId,
      alb.outputs.targetGroupArn,
      iam.outputs.taskRoleArn,
      iam.outputs.executionRoleArn,
      `${ecr.outputs.repositoryUrl}:${config.ecs.imageTag}`,
      monitoring.outputs.logGroupArn
    );

    // ==========================================================================
    // DNS Update (Pointing to ALB)
    // ==========================================================================
    if (config.domain?.name) {
      new Route53Construct(
        this,
        'route53-final',
        config,
        alb.outputs.albDnsName,
        alb.outputs.albZoneId
      );
    }

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
    new TerraformOutput(this, 'cloudwatch_dashboard', {
      value: `https://${config.aws.region}.console.aws.amazon.com/cloudwatch/home?region=${config.aws.region}#dashboards:name=${config.appName}-${config.environment}-dashboard`
    });

    const appUrl = config.domain?.name 
      ? `https://${config.environment === 'prod' ? config.domain.name : `${config.environment}.${config.domain.name}`}`
      : `http://${alb.outputs.albDnsName}`;
    
    new TerraformOutput(this, 'app_url', { value: appUrl });
    new TerraformOutput(this, 'health_check_url', { value: `${appUrl}${config.ecs.healthCheckPath}` });
  }
}

const app = new App();
const config = loadConfig();

new ExpressTsAppStack(app, `express-ts-app-${config.environment}`, config);
app.synth();
