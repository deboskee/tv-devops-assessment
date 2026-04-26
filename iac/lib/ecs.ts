// =============================================================================
// ECS Construct
// =============================================================================
// Creates ECS Fargate cluster, service, and task definition
// =============================================================================

import { Construct } from 'constructs';
import { EcsCluster } from '@cdktf/provider-aws/lib/ecs-cluster';
import { EcsService } from '@cdktf/provider-aws/lib/ecs-service';
import { EcsTaskDefinition } from '@cdktf/provider-aws/lib/ecs-task-definition';
import { AppautoscalingTarget } from '@cdktf/provider-aws/lib/appautoscaling-target';
import { AppautoscalingPolicy } from '@cdktf/provider-aws/lib/appautoscaling-policy';
import { AppConfig } from '../config';

export interface EcsConstructOutputs {
  clusterArn: string;
  clusterName: string;
  serviceArn: string;
  serviceName: string;
  taskDefinitionArn: string;
}

export class EcsConstruct extends Construct {
  public readonly outputs: EcsConstructOutputs;

  constructor(
    scope: Construct,
    id: string,
    config: AppConfig,
    privateSubnetIds: string[],
    securityGroupId: string,
    targetGroupArn: string,
    taskRoleArn: string,
    executionRoleArn: string,
    imageUri: string,
    logGroupName: string
  ) {
    super(scope, id);

    const prefix = `${config.appName}-${config.environment}`;

    // ECS Cluster with Container Insights
    const cluster = new EcsCluster(this, 'cluster', {
      name: config.ecs.clusterName,
      setting: [
        {
          name: 'containerInsights',
          value: config.monitoring.enableCloudWatch ? 'enabled' : 'disabled'
        }
      ],
      tags: {
        ...config.tags,
        Name: config.ecs.clusterName
      }
    });

    // Task Definition
    const containerDefinitions = JSON.stringify([
      {
        name: config.appName,
        image: imageUri,
        essential: true,
        portMappings: [
          {
            containerPort: config.ecs.containerPort,
            hostPort: config.ecs.containerPort,
            protocol: 'tcp'
          }
        ],
        environment: [
          { name: 'NODE_ENV', value: config.environment === 'prod' ? 'production' : 'development' },
          { name: 'PORT', value: String(config.ecs.containerPort) },
          { name: 'APP_VERSION', value: config.ecs.imageTag }
        ],
        logConfiguration: {
          logDriver: 'awslogs',
          options: {
            'awslogs-group': logGroupName,
            'awslogs-region': config.aws.region,
            'awslogs-stream-prefix': 'ecs'
          }
        },
        healthCheck: {
          command: [
            'CMD-SHELL',
            `wget --no-verbose --tries=1 --spider http://localhost:${config.ecs.containerPort}${config.ecs.healthCheckPath} || exit 1`
          ],
          interval: 30,
          timeout: 10,
          retries: 3,
          startPeriod: 60
        },
        // Resource limits for the container
        cpu: config.ecs.cpu,
        memory: config.ecs.memory,
        memoryReservation: Math.floor(config.ecs.memory * 0.8)
      }
    ]);

    const taskDefinition = new EcsTaskDefinition(this, 'task-def', {
      family: `${prefix}-task`,
      networkMode: 'awsvpc',
      requiresCompatibilities: ['FARGATE'],
      cpu: String(config.ecs.cpu),
      memory: String(config.ecs.memory),
      executionRoleArn: executionRoleArn,
      taskRoleArn: taskRoleArn,
      containerDefinitions: containerDefinitions,
      runtimePlatform: {
        operatingSystemFamily: 'LINUX',
        cpuArchitecture: 'X86_64'
      },
      tags: {
        ...config.tags,
        Name: `${prefix}-task`
      }
    });

    // ECS Service
    const service = new EcsService(this, 'service', {
      name: config.ecs.serviceName,
      cluster: cluster.arn,
      taskDefinition: taskDefinition.arn,
      desiredCount: config.ecs.desiredCount,
      launchType: 'FARGATE',
      platformVersion: 'LATEST',
      enableEcsManagedTags: true,
      propagateTags: 'SERVICE',
      enableExecuteCommand: config.environment !== 'prod', // Allow exec in non-prod
      healthCheckGracePeriodSeconds: 60,
      deploymentCircuitBreaker: {
        enable: true,
        rollback: true
      },
      deploymentController: {
        type: 'ECS'
      },
      networkConfiguration: {
        subnets: privateSubnetIds,
        securityGroups: [securityGroupId],
        assignPublicIp: false
      },
      loadBalancer: [
        {
          targetGroupArn: targetGroupArn,
          containerName: config.appName,
          containerPort: config.ecs.containerPort
        }
      ],
      lifecycle: {
        ignoreChanges: ['desired_count'] // Allow autoscaling to manage
      },
      tags: {
        ...config.tags,
        Name: config.ecs.serviceName
      }
    });

    // Auto Scaling Target
    const scalingTarget = new AppautoscalingTarget(this, 'scaling-target', {
      maxCapacity: config.ecs.maxCount,
      minCapacity: config.ecs.minCount,
      resourceId: `service/${cluster.name}/${service.name}`,
      scalableDimension: 'ecs:service:DesiredCount',
      serviceNamespace: 'ecs'
    });

    // CPU-based Auto Scaling Policy
    new AppautoscalingPolicy(this, 'cpu-scaling', {
      name: `${prefix}-cpu-scaling`,
      policyType: 'TargetTrackingScaling',
      resourceId: scalingTarget.resourceId,
      scalableDimension: scalingTarget.scalableDimension,
      serviceNamespace: scalingTarget.serviceNamespace,
      targetTrackingScalingPolicyConfiguration: {
        predefinedMetricSpecification: {
          predefinedMetricType: 'ECSServiceAverageCPUUtilization'
        },
        targetValue: 70,
        scaleInCooldown: 300,
        scaleOutCooldown: 60
      }
    });

    // Memory-based Auto Scaling Policy
    new AppautoscalingPolicy(this, 'memory-scaling', {
      name: `${prefix}-memory-scaling`,
      policyType: 'TargetTrackingScaling',
      resourceId: scalingTarget.resourceId,
      scalableDimension: scalingTarget.scalableDimension,
      serviceNamespace: scalingTarget.serviceNamespace,
      targetTrackingScalingPolicyConfiguration: {
        predefinedMetricSpecification: {
          predefinedMetricType: 'ECSServiceAverageMemoryUtilization'
        },
        targetValue: 80,
        scaleInCooldown: 300,
        scaleOutCooldown: 60
      }
    });

    this.outputs = {
      clusterArn: cluster.arn,
      clusterName: cluster.name,
      serviceArn: service.id,
      serviceName: service.name,
      taskDefinitionArn: taskDefinition.arn
    };
  }
}
