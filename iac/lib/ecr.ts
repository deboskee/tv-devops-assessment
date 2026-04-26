// =============================================================================
// ECR Construct
// =============================================================================
// Creates ECR repository with lifecycle policies and scanning
// =============================================================================

import { Construct } from 'constructs';
import { EcrRepository } from '@cdktf/provider-aws/lib/ecr-repository';
import { EcrLifecyclePolicy } from '@cdktf/provider-aws/lib/ecr-lifecycle-policy';
import { EcrRepositoryPolicy } from '@cdktf/provider-aws/lib/ecr-repository-policy';
import { AppConfig } from '../config';

export interface EcrConstructOutputs {
  repositoryUrl: string;
  repositoryArn: string;
  repositoryName: string;
}

export class EcrConstruct extends Construct {
  public readonly outputs: EcrConstructOutputs;

  constructor(scope: Construct, id: string, config: AppConfig) {
    super(scope, id);

    // Create ECR repository
    const repository = new EcrRepository(this, 'repo', {
      name: config.ecr.repositoryName,
      imageTagMutability: config.ecr.imageTagMutability,
      imageScanningConfiguration: {
        scanOnPush: config.ecr.scanOnPush
      },
      encryptionConfiguration: [{
        encryptionType: 'AES256'
      }],
      forceDelete: config.environment !== 'prod', // Protect prod
      tags: {
        ...config.tags,
        Name: config.ecr.repositoryName
      }
    });

    repository.overrideLogicalId('ecr_repo');

    // Lifecycle policy to limit image count
    new EcrLifecyclePolicy(this, 'lifecycle', {
      repository: repository.name,
      policy: JSON.stringify({
        rules: [
          {
            rulePriority: 1,
            description: 'Keep last N tagged images',
            selection: {
              tagStatus: 'tagged',
              tagPrefixList: ['v', 'release'],
              countType: 'imageCountMoreThan',
              countNumber: config.ecr.maxImageCount
            },
            action: {
              type: 'expire'
            }
          },
          {
            rulePriority: 2,
            description: 'Remove untagged images after 7 days',
            selection: {
              tagStatus: 'untagged',
              countType: 'sinceImagePushed',
              countUnit: 'days',
              countNumber: 7
            },
            action: {
              type: 'expire'
            }
          },
          {
            rulePriority: 3,
            description: 'Keep only last N images total',
            selection: {
              tagStatus: 'any',
              countType: 'imageCountMoreThan',
              countNumber: config.ecr.maxImageCount * 2
            },
            action: {
              type: 'expire'
            }
          }
        ]
      })
    });

    // Repository policy for cross-account access if needed
    if (config.environment === 'prod') {
      new EcrRepositoryPolicy(this, 'policy', {
        repository: repository.name,
        policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'AllowPullFromECS',
              Effect: 'Allow',
              Principal: {
                Service: 'ecs-tasks.amazonaws.com'
              },
              Action: [
                'ecr:GetDownloadUrlForLayer',
                'ecr:BatchGetImage',
                'ecr:BatchCheckLayerAvailability'
              ]
            }
          ]
        })
      });
    }

    this.outputs = {
      repositoryUrl: repository.repositoryUrl,
      repositoryArn: repository.arn,
      repositoryName: repository.name
    };
  }
}
