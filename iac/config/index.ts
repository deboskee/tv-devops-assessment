// =============================================================================
// Configuration Management
// =============================================================================
// Centralized configuration for all environments
// Override via environment variables or cdktf.json
// =============================================================================

import * as dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  // Core identifiers
  appName: string;
  environment: 'dev' | 'staging' | 'prod';
  
  // AWS Configuration
  aws: {
    region: string;
    accountId: string;
  };
  
  // Networking
  vpc: {
    cidr: string;
    maxAzs: number;
    enableNatGateway: boolean;
  };
  
  // ECR
  ecr: {
    repositoryName: string;
    imageTagMutability: 'MUTABLE' | 'IMMUTABLE';
    scanOnPush: boolean;
    maxImageCount: number;
  };
  
  // ECS
  ecs: {
    clusterName: string;
    serviceName: string;
    cpu: number;
    memory: number;
    desiredCount: number;
    minCount: number;
    maxCount: number;
    containerPort: number;
    healthCheckPath: string;
    imageTag: string;
  };
  
  // Load Balancer
  alb: {
    name: string;
    internal: boolean;
    idleTimeout: number;
  };
  
  // Domain & HTTPS (Optional)
  domain?: {
    name: string;
    hostedZoneId: string;
    enableHttps: boolean;
  };
  
  // Monitoring
  monitoring: {
    enableCloudWatch: boolean;
    logRetentionDays: number;
    enableAlarms: boolean;
    alarmEmail?: string;
  };
  
  // Remote Backend (Optional)
  backend?: {
    enabled: boolean;
    bucket: string;
    dynamodbTable: string;
    key: string;
  };
  
  // Tags
  tags: Record<string, string>;
}

// Environment-specific defaults
const environmentDefaults: Record<string, Partial<AppConfig>> = {
  dev: {
    ecs: {
      clusterName: 'express-ts-cluster-dev',
      serviceName: 'express-ts-service-dev',
      cpu: 256,
      memory: 512,
      desiredCount: 1,
      minCount: 1,
      maxCount: 2,
      containerPort: 3000,
      healthCheckPath: '/health',
      imageTag: 'latest'
    },
    vpc: {
      cidr: '10.0.0.0/16',
      maxAzs: 2,
      enableNatGateway: true
    },
    monitoring: {
      enableCloudWatch: true,
      logRetentionDays: 7,
      enableAlarms: false
    }
  },
  staging: {
    ecs: {
      clusterName: 'express-ts-cluster-staging',
      serviceName: 'express-ts-service-staging',
      cpu: 512,
      memory: 1024,
      desiredCount: 2,
      minCount: 1,
      maxCount: 4,
      containerPort: 3000,
      healthCheckPath: '/health',
      imageTag: 'latest'
    },
    vpc: {
      cidr: '10.1.0.0/16',
      maxAzs: 2,
      enableNatGateway: true
    },
    monitoring: {
      enableCloudWatch: true,
      logRetentionDays: 14,
      enableAlarms: true
    }
  },
  prod: {
    ecs: {
      clusterName: 'express-ts-cluster-prod',
      serviceName: 'express-ts-service-prod',
      cpu: 1024,
      memory: 2048,
      desiredCount: 3,
      minCount: 2,
      maxCount: 10,
      containerPort: 3000,
      healthCheckPath: '/health',
      imageTag: 'latest'
    },
    vpc: {
      cidr: '10.2.0.0/16',
      maxAzs: 3,
      enableNatGateway: true
    },
    monitoring: {
      enableCloudWatch: true,
      logRetentionDays: 30,
      enableAlarms: true
    }
  }
};

export function loadConfig(): AppConfig {
  const environment = (process.env.TF_VAR_environment || 'dev') as AppConfig['environment'];
  const envDefaults = environmentDefaults[environment] || environmentDefaults.dev;
  
  const appName = process.env.TF_VAR_app_name || 'express-ts-app';
  
  return {
    appName,
    environment,
    
    aws: {
      region: process.env.TF_VAR_aws_region || process.env.AWS_REGION || 'us-east-1',
      accountId: process.env.TF_VAR_aws_account_id || process.env.AWS_ACCOUNT_ID || ''
    },
    
    vpc: {
      cidr: process.env.TF_VAR_vpc_cidr || envDefaults.vpc?.cidr || '10.0.0.0/16',
      maxAzs: parseInt(process.env.TF_VAR_max_azs || '') || envDefaults.vpc?.maxAzs || 2,
      enableNatGateway: process.env.TF_VAR_enable_nat === 'true' || envDefaults.vpc?.enableNatGateway || true
    },
    
    ecr: {
      repositoryName: process.env.TF_VAR_ecr_repository_name || `${appName}-${environment}`,
      imageTagMutability: (process.env.TF_VAR_image_tag_mutability || 'MUTABLE') as 'MUTABLE' | 'IMMUTABLE',
      scanOnPush: process.env.TF_VAR_scan_on_push !== 'false',
      maxImageCount: parseInt(process.env.TF_VAR_max_image_count || '') || 30
    },
    
    ecs: {
      clusterName: process.env.TF_VAR_ecs_cluster_name || envDefaults.ecs?.clusterName || `${appName}-cluster-${environment}`,
      serviceName: process.env.TF_VAR_ecs_service_name || envDefaults.ecs?.serviceName || `${appName}-service-${environment}`,
      cpu: parseInt(process.env.TF_VAR_ecs_cpu || '') || envDefaults.ecs?.cpu || 256,
      memory: parseInt(process.env.TF_VAR_ecs_memory || '') || envDefaults.ecs?.memory || 512,
      desiredCount: parseInt(process.env.TF_VAR_desired_count || '') || envDefaults.ecs?.desiredCount || 1,
      minCount: parseInt(process.env.TF_VAR_min_count || '') || envDefaults.ecs?.minCount || 1,
      maxCount: parseInt(process.env.TF_VAR_max_count || '') || envDefaults.ecs?.maxCount || 2,
      containerPort: parseInt(process.env.TF_VAR_container_port || '') || 3000,
      healthCheckPath: process.env.TF_VAR_health_check_path || '/health',
      imageTag: process.env.TF_VAR_image_tag || 'latest'
    },
    
    alb: {
      name: process.env.TF_VAR_alb_name || `${appName}-alb-${environment}`,
      internal: process.env.TF_VAR_alb_internal === 'true',
      idleTimeout: parseInt(process.env.TF_VAR_alb_idle_timeout || '') || 60
    },
    
    domain: process.env.TF_VAR_domain_name ? {
      name: process.env.TF_VAR_domain_name,
      hostedZoneId: process.env.TF_VAR_hosted_zone_id || '',
      enableHttps: process.env.TF_VAR_enable_https === 'true'
    } : undefined,
    
    monitoring: {
      enableCloudWatch: process.env.TF_VAR_enable_cloudwatch !== 'false',
      logRetentionDays: parseInt(process.env.TF_VAR_log_retention_days || '') || envDefaults.monitoring?.logRetentionDays || 7,
      enableAlarms: process.env.TF_VAR_enable_alarms === 'true' || envDefaults.monitoring?.enableAlarms || false,
      alarmEmail: process.env.TF_VAR_alarm_email
    },
    
    backend: process.env.TF_VAR_backend_bucket ? {
      enabled: true,
      bucket: process.env.TF_VAR_backend_bucket,
      dynamodbTable: process.env.TF_VAR_backend_dynamodb_table || `${appName}-tfstate-lock`,
      key: process.env.TF_VAR_backend_key || `${environment}/terraform.tfstate`
    } : undefined,
    
    tags: {
      Application: appName,
      Environment: environment,
      ManagedBy: 'cdktf',
      Project: 'turboVets-assessment',
      ...parseCustomTags(process.env.TF_VAR_custom_tags)
    }
  };
}

function parseCustomTags(tagsString?: string): Record<string, string> {
  if (!tagsString) return {};
  try {
    return JSON.parse(tagsString);
  } catch {
    return {};
  }
}
