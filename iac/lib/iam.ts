// =============================================================================
// IAM Construct
// =============================================================================
// Creates IAM roles with least privilege for ECS tasks
// =============================================================================

import { Construct } from 'constructs';
import { IamRole } from '@cdktf/provider-aws/lib/iam-role';
import { IamRolePolicy } from '@cdktf/provider-aws/lib/iam-role-policy';
import { IamRolePolicyAttachment } from '@cdktf/provider-aws/lib/iam-role-policy-attachment';
import { AppConfig } from '../config';

export interface IamConstructOutputs {
  taskRoleArn: string;
  executionRoleArn: string;
}

export class IamConstruct extends Construct {
  public readonly outputs: IamConstructOutputs;

  constructor(scope: Construct, id: string, config: AppConfig, ecrArn: string, logGroupArn: string) {
    super(scope, id);

    const prefix = `${config.appName}-${config.environment}`;

    // ECS Task Execution Role (for pulling images, pushing logs)
    const executionRole = new IamRole(this, 'execution-role', {
      namePrefix: `${prefix}-ecs-exec-`,
      assumeRolePolicy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'ecs-tasks.amazonaws.com'
            },
            Action: 'sts:AssumeRole'
          }
        ]
      }),
      tags: {
        ...config.tags,
        Name: `${prefix}-ecs-execution-role`
      }
    });

    // Attach AWS managed policy for ECS task execution
    new IamRolePolicyAttachment(this, 'execution-policy', {
      role: executionRole.name,
      policyArn: 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'
    });

    // Additional execution role policy for ECR and CloudWatch (least privilege)
    new IamRolePolicy(this, 'execution-inline-policy', {
      name: `${prefix}-ecs-execution-inline`,
      role: executionRole.id,
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'ECRAuth',
            Effect: 'Allow',
            Action: [
              'ecr:GetAuthorizationToken'
            ],
            Resource: '*'
          },
          {
            Sid: 'ECRPull',
            Effect: 'Allow',
            Action: [
              'ecr:BatchCheckLayerAvailability',
              'ecr:GetDownloadUrlForLayer',
              'ecr:BatchGetImage'
            ],
            Resource: ecrArn
          },
          {
            Sid: 'CloudWatchLogs',
            Effect: 'Allow',
            Action: [
              'logs:CreateLogStream',
              'logs:PutLogEvents'
            ],
            Resource: `${logGroupArn}:*`
          }
        ]
      })
    });

    // ECS Task Role (for application-level permissions)
    const taskRole = new IamRole(this, 'task-role', {
      namePrefix: `${prefix}-ecs-task-`,
      assumeRolePolicy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'ecs-tasks.amazonaws.com'
            },
            Action: 'sts:AssumeRole'
          }
        ]
      }),
      tags: {
        ...config.tags,
        Name: `${prefix}-ecs-task-role`
      }
    });

    // Task role policy - minimal permissions for the application
    // Add more as needed for your application (S3, DynamoDB, etc.)
    new IamRolePolicy(this, 'task-policy', {
      name: `${prefix}-ecs-task-policy`,
      role: taskRole.id,
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'CloudWatchMetrics',
            Effect: 'Allow',
            Action: [
              'cloudwatch:PutMetricData'
            ],
            Resource: '*',
            Condition: {
              StringEquals: {
                'cloudwatch:namespace': `${config.appName}/${config.environment}`
              }
            }
          },
          {
            Sid: 'XRayTracing',
            Effect: 'Allow',
            Action: [
              'xray:PutTraceSegments',
              'xray:PutTelemetryRecords'
            ],
            Resource: '*'
          }
        ]
      })
    });

    this.outputs = {
      taskRoleArn: taskRole.arn,
      executionRoleArn: executionRole.arn
    };
  }
}
