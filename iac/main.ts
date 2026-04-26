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
    // Remote Backend Configuration (Optional)
    // ==========================================================================
    if (config.backend?.enabled) {
      new S3Backend(this, {
        bucket: config.backend.bucket,
        key: config.backend.key,
        region: config.aws.region,
        dynamodbTable: config.backend.dynamodbTable,
        encrypt: true
      });
    }

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
    // ECR Repository
    // ==========================================================================
    const ecr = new EcrConstruct(this, 'ecr', config);

    // ==========================================================================
    // VPC & Networking
    // ==========================================================================
    const vpc = new VpcConstruct(this, 'vpc', config);

    // ==========================================================================
    // IAM Roles
    // ==========================================================================
    const iam = new IamConstruct(
      this,
      'iam',
      config,
      ecr.outputs.repositoryArn,
      monitoring.outputs.logGroupArn
    );

    // ==========================================================================
    // Application Load Balancer
    // ==========================================================================
    const alb = new AlbConstruct(
      this,
      'alb',
      config,
      vpc.outputs.vpcId,
      vpc.outputs.publicSubnetIds,
      vpc.outputs.albSecurityGroupId
    );

    // ==========================================================================
    // Route53 & HTTPS (if configured)
    // ==========================================================================
    let route53: Route53Construct | undefined;
    if (config.domain) {
      route53 = new Route53Construct(
        this,
        'route53',
        config,
        alb.outputs.albDnsName,
        alb.outputs.albZoneId
      );

      // If certificate is created, recreate ALB with HTTPS
      if (route53.outputs.certificateArn) {
        // Note: In a real scenario, you'd restructure this
        // For now, we reference the certificate in outputs
      }
    }

    // ==========================================================================
    // ECS Cluster & Service
    // ==========================================================================
    const imageUri = `${ecr.outputs.repositoryUrl}:${config.ecs.imageTag}`;
    
    const ecs = new EcsConstruct(
      this,
      'ecs',
      config,
      vpc.outputs.privateSubnetIds,
      vpc.outputs.ecsSecurityGroupId,
      alb.outputs.targetGroupArn,
      iam.outputs.taskRoleArn,
      iam.outputs.executionRoleArn,
      imageUri,
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
    new TerraformOutput(this, 'alb_dns_name', {
      value: alb.outputs.albDnsName,
      description: 'Application Load Balancer DNS name'
    });

    new TerraformOutput(this, 'app_url', {
      value: route53?.outputs.domainName
        ? `https://${route53.outputs.domainName}`
        : `http://${alb.outputs.albDnsName}`,
      description: 'Application URL'
    });

    new TerraformOutput(this, 'health_check_url', {
      value: route53?.outputs.domainName
        ? `https://${route53.outputs.domainName}/health`
        : `http://${alb.outputs.albDnsName}/health`,
      description: 'Health check endpoint URL'
    });

    new TerraformOutput(this, 'ecr_repository_url', {
      value: ecr.outputs.repositoryUrl,
      description: 'ECR repository URL'
    });

    new TerraformOutput(this, 'ecs_cluster_name', {
      value: ecs.outputs.clusterName,
      description: 'ECS cluster name'
    });

    new TerraformOutput(this, 'ecs_service_name', {
      value: ecs.outputs.serviceName,
      description: 'ECS service name'
    });

    new TerraformOutput(this, 'vpc_id', {
      value: vpc.outputs.vpcId,
      description: 'VPC ID'
    });

    new TerraformOutput(this, 'cloudwatch_log_group', {
      value: monitoring.outputs.logGroupName,
      description: 'CloudWatch log group name'
    });

    if (monitoring.outputs.dashboardName) {
      new TerraformOutput(this, 'cloudwatch_dashboard', {
        value: `https://${config.aws.region}.console.aws.amazon.com/cloudwatch/home?region=${config.aws.region}#dashboards:name=${monitoring.outputs.dashboardName}`,
        description: 'CloudWatch dashboard URL'
      });
    }

    if (route53?.outputs.certificateArn) {
      new TerraformOutput(this, 'certificate_arn', {
        value: route53.outputs.certificateArn,
        description: 'ACM certificate ARN'
      });
    }
  }
}

// =============================================================================
// Application Entry Point
// =============================================================================
const app = new App();
const config = loadConfig();

new ExpressTsAppStack(app, `express-ts-app-${config.environment}`, config);

app.synth();
