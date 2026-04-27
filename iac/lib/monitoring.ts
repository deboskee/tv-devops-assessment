// =============================================================================
// Monitoring Construct
// =============================================================================
// Creates CloudWatch Log Groups, Alarms, and Dashboard
// =============================================================================

import { Construct } from 'constructs';
import { CloudwatchLogGroup } from '@cdktf/provider-aws/lib/cloudwatch-log-group';
import { CloudwatchMetricAlarm } from '@cdktf/provider-aws/lib/cloudwatch-metric-alarm';
import { CloudwatchDashboard } from '@cdktf/provider-aws/lib/cloudwatch-dashboard';
import { SnsTopic } from '@cdktf/provider-aws/lib/sns-topic';
import { SnsTopicSubscription } from '@cdktf/provider-aws/lib/sns-topic-subscription';
import { AppConfig } from '../config';

export interface MonitoringConstructOutputs {
  logGroupName: string;
  logGroupArn: string;
  dashboardName?: string;
  alarmTopicArn?: string;
}

export class MonitoringConstruct extends Construct {
  public readonly outputs: MonitoringConstructOutputs;

  constructor(scope: Construct, id: string, config: AppConfig) {
    super(scope, id);

    const prefix = config.appName;

    // CloudWatch Log Group
    const logGroup = new CloudwatchLogGroup(this, 'log-group', {
      name: `/ecs/${prefix}`,
      retentionInDays: config.monitoring.logRetentionDays,
      tags: {
        ...config.tags,
        Name: `${prefix}-logs`
      }
    });

    let alarmTopicArn: string | undefined;
    let dashboardName: string | undefined;

    // SNS Topic for Alarms (if enabled)
    if (config.monitoring.enableAlarms) {
      const alarmTopic = new SnsTopic(this, 'alarm-topic', {
        name: `${prefix}-alarms`,
        tags: config.tags
      });
      alarmTopicArn = alarmTopic.arn;

      // Email subscription if provided
      if (config.monitoring.alarmEmail) {
        new SnsTopicSubscription(this, 'alarm-email', {
          topicArn: alarmTopic.arn,
          protocol: 'email',
          endpoint: config.monitoring.alarmEmail
        });
      }
    }

    this.outputs = {
      logGroupName: logGroup.name,
      logGroupArn: logGroup.arn,
      dashboardName,
      alarmTopicArn
    };
  }

  // Method to create alarms after ECS resources are created
  public createAlarms(
    config: AppConfig,
    clusterName: string,
    serviceName: string,
    albArnSuffix: string,
    targetGroupArnSuffix: string
  ): void {
    if (!config.monitoring.enableAlarms || !this.outputs.alarmTopicArn) return;

    const prefix = config.appName;

    // High CPU Alarm
    new CloudwatchMetricAlarm(this, 'high-cpu-alarm', {
      alarmName: `${prefix}-high-cpu`,
      comparisonOperator: 'GreaterThanThreshold',
      evaluationPeriods: 3,
      metricName: 'CPUUtilization',
      namespace: 'AWS/ECS',
      period: 60,
      statistic: 'Average',
      threshold: 85,
      alarmDescription: 'ECS CPU utilization is high',
      dimensions: {
        ClusterName: clusterName,
        ServiceName: serviceName
      },
      alarmActions: [this.outputs.alarmTopicArn!],
      okActions: [this.outputs.alarmTopicArn!],
      treatMissingData: 'notBreaching',
      tags: config.tags
    });

    // High Memory Alarm
    new CloudwatchMetricAlarm(this, 'high-memory-alarm', {
      alarmName: `${prefix}-high-memory`,
      comparisonOperator: 'GreaterThanThreshold',
      evaluationPeriods: 3,
      metricName: 'MemoryUtilization',
      namespace: 'AWS/ECS',
      period: 60,
      statistic: 'Average',
      threshold: 90,
      alarmDescription: 'ECS memory utilization is high',
      dimensions: {
        ClusterName: clusterName,
        ServiceName: serviceName
      },
      alarmActions: [this.outputs.alarmTopicArn!],
      okActions: [this.outputs.alarmTopicArn!],
      treatMissingData: 'notBreaching',
      tags: config.tags
    });

    // Unhealthy Hosts Alarm
    new CloudwatchMetricAlarm(this, 'unhealthy-hosts-alarm', {
      alarmName: `${prefix}-unhealthy-hosts`,
      comparisonOperator: 'GreaterThanThreshold',
      evaluationPeriods: 2,
      metricName: 'UnHealthyHostCount',
      namespace: 'AWS/ApplicationELB',
      period: 60,
      statistic: 'Sum',
      threshold: 0,
      alarmDescription: 'There are unhealthy hosts in the target group',
      dimensions: {
        LoadBalancer: albArnSuffix,
        TargetGroup: targetGroupArnSuffix
      },
      alarmActions: [this.outputs.alarmTopicArn!],
      okActions: [this.outputs.alarmTopicArn!],
      treatMissingData: 'notBreaching',
      tags: config.tags
    });

    // 5xx Error Rate Alarm
    new CloudwatchMetricAlarm(this, 'http-5xx-alarm', {
      alarmName: `${prefix}-http-5xx`,
      comparisonOperator: 'GreaterThanThreshold',
      evaluationPeriods: 2,
      metricName: 'HTTPCode_Target_5XX_Count',
      namespace: 'AWS/ApplicationELB',
      period: 60,
      statistic: 'Sum',
      threshold: 10,
      alarmDescription: 'High rate of 5xx errors',
      dimensions: {
        LoadBalancer: albArnSuffix,
        TargetGroup: targetGroupArnSuffix
      },
      alarmActions: [this.outputs.alarmTopicArn!],
      treatMissingData: 'notBreaching',
      tags: config.tags
    });

    // Response Time Alarm
    new CloudwatchMetricAlarm(this, 'response-time-alarm', {
      alarmName: `${prefix}-response-time`,
      comparisonOperator: 'GreaterThanThreshold',
      evaluationPeriods: 3,
      metricName: 'TargetResponseTime',
      namespace: 'AWS/ApplicationELB',
      period: 60,
      statistic: 'Average',
      threshold: 2, // 2 seconds
      alarmDescription: 'High response time',
      dimensions: {
        LoadBalancer: albArnSuffix,
        TargetGroup: targetGroupArnSuffix
      },
      alarmActions: [this.outputs.alarmTopicArn!],
      treatMissingData: 'notBreaching',
      tags: config.tags
    });
  }

  // Create CloudWatch Dashboard
  public createDashboard(
    config: AppConfig,
    clusterName: string,
    serviceName: string,
    albArnSuffix: string
  ): void {
    if (!config.monitoring.enableCloudWatch) return;

    const prefix = config.appName;

    const dashboardBody = {
      widgets: [
        {
          type: 'text',
          x: 0,
          y: 0,
          width: 24,
          height: 1,
          properties: {
            markdown: `# ${config.appName} - ${config.environment.toUpperCase()} Dashboard`
          }
        },
        {
          type: 'metric',
          x: 0,
          y: 1,
          width: 12,
          height: 6,
          properties: {
            title: 'ECS CPU Utilization',
            metrics: [
              ['AWS/ECS', 'CPUUtilization', 'ClusterName', `${clusterName}`, 'ServiceName', `${serviceName}`]
            ],
            period: 60,
            stat: 'Average',
            region: config.aws.region
          }
        },
        {
          type: 'metric',
          x: 12,
          y: 1,
          width: 12,
          height: 6,
          properties: {
            title: 'ECS Memory Utilization',
            metrics: [
              ['AWS/ECS', 'MemoryUtilization', 'ClusterName', `${clusterName}`, 'ServiceName', `${serviceName}`]
            ],
            period: 60,
            stat: 'Average',
            region: config.aws.region
          }
        },
        {
          type: 'metric',
          x: 0,
          y: 7,
          width: 8,
          height: 6,
          properties: {
            title: 'ALB Request Count',
            metrics: [
              ['AWS/ApplicationELB', 'RequestCount', 'LoadBalancer', `${albArnSuffix}`]
            ],
            period: 60,
            stat: 'Sum',
            region: config.aws.region
          }
        },
        {
          type: 'metric',
          x: 8,
          y: 7,
          width: 8,
          height: 6,
          properties: {
            title: 'ALB Response Time',
            metrics: [
              ['AWS/ApplicationELB', 'TargetResponseTime', 'LoadBalancer', `${albArnSuffix}`]
            ],
            period: 60,
            stat: 'Average',
            region: config.aws.region
          }
        },
        {
          type: 'metric',
          x: 16,
          y: 7,
          width: 8,
          height: 6,
          properties: {
            title: 'HTTP Error Codes',
            metrics: [
              ['AWS/ApplicationELB', 'HTTPCode_Target_4XX_Count', 'LoadBalancer', `${albArnSuffix}`],
              ['AWS/ApplicationELB', 'HTTPCode_Target_5XX_Count', 'LoadBalancer', `${albArnSuffix}`]
            ],
            period: 60,
            stat: 'Sum',
            region: config.aws.region
          }
        }
      ]
    };

    new CloudwatchDashboard(this, 'dashboard', {
      dashboardName: `${prefix}-dashboard`,
      dashboardBody: JSON.stringify(dashboardBody)
    });

    this.outputs.dashboardName = `${prefix}-dashboard`;
  }
}
