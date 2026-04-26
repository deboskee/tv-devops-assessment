// =============================================================================
// VPC Construct
// =============================================================================
// Creates a production-ready VPC with public and private subnets
// =============================================================================

import { Construct } from 'constructs';
import { Vpc } from '@cdktf/provider-aws/lib/vpc';
import { Subnet } from '@cdktf/provider-aws/lib/subnet';
import { InternetGateway } from '@cdktf/provider-aws/lib/internet-gateway';
import { NatGateway } from '@cdktf/provider-aws/lib/nat-gateway';
import { Eip } from '@cdktf/provider-aws/lib/eip';
import { RouteTable } from '@cdktf/provider-aws/lib/route-table';
import { Route } from '@cdktf/provider-aws/lib/route';
import { RouteTableAssociation } from '@cdktf/provider-aws/lib/route-table-association';
import { SecurityGroup } from '@cdktf/provider-aws/lib/security-group';
import { SecurityGroupRule } from '@cdktf/provider-aws/lib/security-group-rule';
import { DataAwsAvailabilityZones } from '@cdktf/provider-aws/lib/data-aws-availability-zones';
import { AppConfig } from '../config';

export interface VpcConstructOutputs {
  vpcId: string;
  publicSubnetIds: string[];
  privateSubnetIds: string[];
  albSecurityGroupId: string;
  ecsSecurityGroupId: string;
}

export class VpcConstruct extends Construct {
  public readonly outputs: VpcConstructOutputs;

  constructor(scope: Construct, id: string, config: AppConfig) {
    super(scope, id);

    const prefix = `${config.appName}-${config.environment}`;

    // Get available AZs
    const azs = new DataAwsAvailabilityZones(this, 'azs', {
      state: 'available'
    });

    // Create VPC
    const vpc = new Vpc(this, 'vpc', {
      cidrBlock: config.vpc.cidr,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: {
        ...config.tags,
        Name: `${prefix}-vpc`
      }
    });

    // Create Internet Gateway
    const igw = new InternetGateway(this, 'igw', {
      vpcId: vpc.id,
      tags: {
        ...config.tags,
        Name: `${prefix}-igw`
      }
    });

    // Create subnets
    const publicSubnets: Subnet[] = [];
    const privateSubnets: Subnet[] = [];
    const natGateways: NatGateway[] = [];

    for (let i = 0; i < config.vpc.maxAzs; i++) {
      // Public subnet
      const publicSubnet = new Subnet(this, `public-subnet-${i}`, {
        vpcId: vpc.id,
        cidrBlock: `10.${config.environment === 'prod' ? 2 : config.environment === 'staging' ? 1 : 0}.${i * 16}.0/20`,
        availabilityZone: `\${${azs.fqn}.names[${i}]}`,
        mapPublicIpOnLaunch: true,
        tags: {
          ...config.tags,
          Name: `${prefix}-public-${i}`,
          Type: 'public'
        }
      });
      publicSubnets.push(publicSubnet);

      // Private subnet
      const privateSubnet = new Subnet(this, `private-subnet-${i}`, {
        vpcId: vpc.id,
        cidrBlock: `10.${config.environment === 'prod' ? 2 : config.environment === 'staging' ? 1 : 0}.${(i * 16) + 128}.0/20`,
        availabilityZone: `\${${azs.fqn}.names[${i}]}`,
        mapPublicIpOnLaunch: false,
        tags: {
          ...config.tags,
          Name: `${prefix}-private-${i}`,
          Type: 'private'
        }
      });
      privateSubnets.push(privateSubnet);

      // NAT Gateway (one per AZ for high availability, or single for cost savings in dev)
      if (config.vpc.enableNatGateway && (config.environment !== 'dev' || i === 0)) {
        const eip = new Eip(this, `nat-eip-${i}`, {
          domain: 'vpc',
          tags: {
            ...config.tags,
            Name: `${prefix}-nat-eip-${i}`
          }
        });

        const natGw = new NatGateway(this, `nat-gw-${i}`, {
          allocationId: eip.id,
          subnetId: publicSubnet.id,
          tags: {
            ...config.tags,
            Name: `${prefix}-nat-${i}`
          },
          dependsOn: [igw]
        });
        natGateways.push(natGw);
      }
    }

    // Public route table
    const publicRouteTable = new RouteTable(this, 'public-rt', {
      vpcId: vpc.id,
      tags: {
        ...config.tags,
        Name: `${prefix}-public-rt`
      }
    });

    new Route(this, 'public-route', {
      routeTableId: publicRouteTable.id,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: igw.id
    });

    // Associate public subnets with public route table
    publicSubnets.forEach((subnet, i) => {
      new RouteTableAssociation(this, `public-rta-${i}`, {
        subnetId: subnet.id,
        routeTableId: publicRouteTable.id
      });
    });

    // Private route tables (one per AZ or shared for dev)
    privateSubnets.forEach((subnet, i) => {
      const natIndex = config.environment === 'dev' ? 0 : i;
      const privateRouteTable = new RouteTable(this, `private-rt-${i}`, {
        vpcId: vpc.id,
        tags: {
          ...config.tags,
          Name: `${prefix}-private-rt-${i}`
        }
      });

      if (natGateways[natIndex]) {
        new Route(this, `private-route-${i}`, {
          routeTableId: privateRouteTable.id,
          destinationCidrBlock: '0.0.0.0/0',
          natGatewayId: natGateways[natIndex].id
        });
      }

      new RouteTableAssociation(this, `private-rta-${i}`, {
        subnetId: subnet.id,
        routeTableId: privateRouteTable.id
      });
    });

    // ALB Security Group
    const albSg = new SecurityGroup(this, 'alb-sg', {
      name: `${prefix}-alb-sg`,
      description: 'Security group for Application Load Balancer',
      vpcId: vpc.id,
      tags: {
        ...config.tags,
        Name: `${prefix}-alb-sg`
      }
    });

    // ALB inbound rules
    new SecurityGroupRule(this, 'alb-http-ingress', {
      type: 'ingress',
      fromPort: 80,
      toPort: 80,
      protocol: 'tcp',
      cidrBlocks: ['0.0.0.0/0'],
      securityGroupId: albSg.id,
      description: 'Allow HTTP traffic'
    });

    new SecurityGroupRule(this, 'alb-https-ingress', {
      type: 'ingress',
      fromPort: 443,
      toPort: 443,
      protocol: 'tcp',
      cidrBlocks: ['0.0.0.0/0'],
      securityGroupId: albSg.id,
      description: 'Allow HTTPS traffic'
    });

    new SecurityGroupRule(this, 'alb-egress', {
      type: 'egress',
      fromPort: 0,
      toPort: 0,
      protocol: '-1',
      cidrBlocks: ['0.0.0.0/0'],
      securityGroupId: albSg.id,
      description: 'Allow all outbound traffic'
    });

    // ECS Security Group
    const ecsSg = new SecurityGroup(this, 'ecs-sg', {
      name: `${prefix}-ecs-sg`,
      description: 'Security group for ECS tasks',
      vpcId: vpc.id,
      tags: {
        ...config.tags,
        Name: `${prefix}-ecs-sg`
      }
    });

    // ECS inbound from ALB only (least privilege)
    new SecurityGroupRule(this, 'ecs-ingress', {
      type: 'ingress',
      fromPort: config.ecs.containerPort,
      toPort: config.ecs.containerPort,
      protocol: 'tcp',
      sourceSecurityGroupId: albSg.id,
      securityGroupId: ecsSg.id,
      description: 'Allow traffic from ALB only'
    });

    new SecurityGroupRule(this, 'ecs-egress', {
      type: 'egress',
      fromPort: 0,
      toPort: 0,
      protocol: '-1',
      cidrBlocks: ['0.0.0.0/0'],
      securityGroupId: ecsSg.id,
      description: 'Allow all outbound traffic (for ECR, CloudWatch, etc.)'
    });

    this.outputs = {
      vpcId: vpc.id,
      publicSubnetIds: publicSubnets.map(s => s.id),
      privateSubnetIds: privateSubnets.map(s => s.id),
      albSecurityGroupId: albSg.id,
      ecsSecurityGroupId: ecsSg.id
    };
  }
}
