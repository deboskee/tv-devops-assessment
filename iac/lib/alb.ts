// =============================================================================
// ALB Construct
// =============================================================================
// Creates Application Load Balancer with target groups and listeners
// =============================================================================

import { Construct } from 'constructs';
import { Alb } from '@cdktf/provider-aws/lib/alb';
import { AlbListener } from '@cdktf/provider-aws/lib/alb-listener';
import { AlbTargetGroup } from '@cdktf/provider-aws/lib/alb-target-group';
import { AppConfig } from '../config';

export interface AlbConstructOutputs {
  albArn: string;
  albArnSuffix: string;
  albDnsName: string;
  albZoneId: string;
  targetGroupArn: string;
  targetGroupArnSuffix: string;
  httpListenerArn: string;
  httpsListenerArn?: string;
}

export class AlbConstruct extends Construct {
  public readonly outputs: AlbConstructOutputs;

  constructor(
    scope: Construct,
    id: string,
    config: AppConfig,
    vpcId: string,
    publicSubnetIds: string[],
    securityGroupId: string,
    certificateArn?: string
  ) {
    super(scope, id);

    const prefix = `${config.appName}-${config.environment}`;

    // Create ALB
    const alb = new Alb(this, 'alb', {
      name: config.alb.name.substring(0, 32), // ALB name max 32 chars
      internal: config.alb.internal,
      loadBalancerType: 'application',
      securityGroups: [securityGroupId],
      subnets: publicSubnetIds,
      enableDeletionProtection: config.environment === 'prod',
      idleTimeout: config.alb.idleTimeout,
      enableHttp2: true,
      dropInvalidHeaderFields: true,
      tags: {
        ...config.tags,
        Name: config.alb.name
      }
    });

    // Target Group
    const targetGroup = new AlbTargetGroup(this, 'tg', {
      name: `${prefix}-tg`.substring(0, 32),
      port: config.ecs.containerPort,
      protocol: 'HTTP',
      vpcId: vpcId,
      targetType: 'ip', // Required for Fargate
      deregistrationDelay: '30',
      healthCheck: {
        enabled: true,
        path: config.ecs.healthCheckPath,
        port: 'traffic-port',
        protocol: 'HTTP',
        healthyThreshold: 2,
        unhealthyThreshold: 3,
        timeout: 5,
        interval: 30,
        matcher: '200-299'
      },
      tags: {
        ...config.tags,
        Name: `${prefix}-tg`
      }
    });

    // HTTP Listener
    const httpListener = new AlbListener(this, 'http-listener', {
      loadBalancerArn: alb.arn,
      port: 80,
      protocol: 'HTTP',
      defaultAction: certificateArn ? [
        {
          type: 'redirect',
          redirect: {
            port: '443',
            protocol: 'HTTPS',
            statusCode: 'HTTP_301'
          }
        }
      ] : [
        {
          type: 'forward',
          targetGroupArn: targetGroup.arn
        }
      ],
      tags: config.tags
    });

    let httpsListenerArn: string | undefined;

    // HTTPS Listener (if certificate provided)
    if (certificateArn) {
      const httpsListener = new AlbListener(this, 'https-listener', {
        loadBalancerArn: alb.arn,
        port: 443,
        protocol: 'HTTPS',
        sslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06',
        certificateArn: certificateArn,
        defaultAction: [
          {
            type: 'forward',
            targetGroupArn: targetGroup.arn
          }
        ],
        tags: config.tags
      });
      httpsListenerArn = httpsListener.arn;
    }

    this.outputs = {
      albArn: alb.arn,
      albArnSuffix: alb.arnSuffix,
      albDnsName: alb.dnsName,
      albZoneId: alb.zoneId,
      targetGroupArn: targetGroup.arn,
      targetGroupArnSuffix: targetGroup.arnSuffix,
      httpListenerArn: httpListener.arn,
      httpsListenerArn
    };
  }
}
