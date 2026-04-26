# Infrastructure as Code (CDKTF)

Production-ready AWS infrastructure for the Express.js application using CDK for Terraform (TypeScript).

## 🏗️ Architecture

```
                                    ┌─────────────────────────────────────────────────────────────┐
                                    │                         AWS Cloud                           │
                                    │  ┌───────────────────────────────────────────────────────┐  │
                                    │  │                         VPC                           │  │
Internet ──► Route53 ──► ALB ──────►│  │  ┌─────────────────┐    ┌─────────────────┐          │  │
             (Optional)   │         │  │  │  Public Subnet  │    │  Public Subnet  │          │  │
                          │         │  │  │    (AZ-a)       │    │    (AZ-b)       │          │  │
                          │         │  │  │   [NAT GW]      │    │   [NAT GW]      │          │  │
                          │         │  │  └────────┬────────┘    └────────┬────────┘          │  │
                          │         │  │           │                      │                    │  │
                          ▼         │  │  ┌────────▼────────┐    ┌────────▼────────┐          │  │
                    ┌─────────┐     │  │  │ Private Subnet  │    │ Private Subnet  │          │  │
                    │   ALB   │─────│  │  │    (AZ-a)       │    │    (AZ-b)       │          │  │
                    └────┬────┘     │  │  │  ┌───────────┐  │    │  ┌───────────┐  │          │  │
                         │          │  │  │  │ECS Fargate│  │    │  │ECS Fargate│  │          │  │
                         │          │  │  │  │   Task    │  │    │  │   Task    │  │          │  │
                         └──────────│  │  │  └───────────┘  │    │  └───────────┘  │          │  │
                                    │  │  └─────────────────┘    └─────────────────┘          │  │
                                    │  └───────────────────────────────────────────────────────┘  │
                                    │                                                             │
                                    │  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐  │
                                    │  │   ECR    │  │  CloudWatch  │  │         IAM           │  │
                                    │  │Repository│  │ Logs/Alarms  │  │    Roles/Policies     │  │
                                    │  └──────────┘  └──────────────┘  └───────────────────────┘  │
                                    └─────────────────────────────────────────────────────────────┘
```

## 📦 What Gets Created

| Resource | Description |
|----------|-------------|
| **VPC** | Custom VPC with public/private subnets across multiple AZs |
| **ECR** | Container registry with lifecycle policies |
| **ECS Cluster** | Fargate cluster with container insights |
| **ECS Service** | Auto-scaling service with health checks |
| **ALB** | Application Load Balancer with health checks |
| **IAM Roles** | Least-privilege execution and task roles |
| **CloudWatch** | Log groups, dashboard, and optional alarms |
| **Route53** | DNS records (optional) |
| **ACM** | SSL certificate (optional) |
| **S3 + DynamoDB** | Remote backend (optional) |

## 🚀 Deployment Guide

### Prerequisites

1. **AWS CLI** configured with credentials
2. **Node.js 20+**
3. **Terraform 1.7+**
4. Docker image pushed to ECR (CI/CD handles this)

### Step 1: Clone and Setup

```bash
cd iac
npm install
```

### Step 2: Configure Environment

```bash
# Copy example configuration
cp .env.example .env

# Edit with your values
vim .env
```

**Minimum required variables:**

```bash
TF_VAR_aws_region=us-east-1
TF_VAR_aws_account_id=123456789012
```

### Step 3: (Optional) Setup Remote Backend

For team collaboration and state locking:

```bash
./scripts/bootstrap-backend.sh
```

This creates an S3 bucket and DynamoDB table. Add the output variables to your `.env`:

```bash
TF_VAR_backend_bucket=express-ts-app-tfstate-us-east-1
TF_VAR_backend_dynamodb_table=express-ts-app-tfstate-lock
```

### Step 4: Deploy

```bash
# Deploy to dev environment
./scripts/deploy.sh dev

# Or deploy to staging/prod
./scripts/deploy.sh staging
./scripts/deploy.sh prod
```

**Manual deployment:**

```bash
export TF_VAR_environment=dev
export TF_VAR_aws_region=us-east-1
export TF_VAR_aws_account_id=123456789012

npx cdktf synth
npx cdktf deploy --auto-approve
```

### Step 5: Verify Deployment

```bash
# Get the ALB URL from outputs
cd cdktf.out/stacks/express-ts-app-dev
terraform output alb_dns_name

# Test health endpoint
curl http://<ALB_DNS_NAME>/health
```

## 🔧 Configuration Reference

### Environment Variables

All configuration is done via environment variables prefixed with `TF_VAR_`:

#### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `TF_VAR_aws_region` | AWS region | `us-east-1` |
| `TF_VAR_aws_account_id` | AWS account ID | `123456789012` |

#### Optional - Application

| Variable | Description | Default |
|----------|-------------|---------|
| `TF_VAR_app_name` | Application name | `express-ts-app` |
| `TF_VAR_environment` | Environment (dev/staging/prod) | `dev` |
| `TF_VAR_image_tag` | Docker image tag | `latest` |

#### Optional - ECS

| Variable | Description | Default (dev) |
|----------|-------------|---------------|
| `TF_VAR_ecs_cpu` | CPU units | `256` |
| `TF_VAR_ecs_memory` | Memory (MB) | `512` |
| `TF_VAR_desired_count` | Initial task count | `1` |
| `TF_VAR_min_count` | Minimum tasks | `1` |
| `TF_VAR_max_count` | Maximum tasks | `2` |

#### Optional - Networking

| Variable | Description | Default |
|----------|-------------|---------|
| `TF_VAR_vpc_cidr` | VPC CIDR block | `10.0.0.0/16` |
| `TF_VAR_max_azs` | Number of AZs | `2` |

#### Optional - Domain & HTTPS

| Variable | Description |
|----------|-------------|
| `TF_VAR_domain_name` | Domain name (e.g., `app.example.com`) |
| `TF_VAR_hosted_zone_id` | Route53 hosted zone ID |
| `TF_VAR_enable_https` | Enable SSL/TLS (`true`/`false`) |

#### Optional - Monitoring

| Variable | Description | Default |
|----------|-------------|---------|
| `TF_VAR_enable_cloudwatch` | Enable CloudWatch | `true` |
| `TF_VAR_log_retention_days` | Log retention | `7` |
| `TF_VAR_enable_alarms` | Enable alarms | `false` |
| `TF_VAR_alarm_email` | Alarm notification email | - |

#### Optional - Remote Backend

| Variable | Description |
|----------|-------------|
| `TF_VAR_backend_bucket` | S3 bucket for state |
| `TF_VAR_backend_dynamodb_table` | DynamoDB table for locking |

### Environment Presets

Different environments have different defaults:

| Setting | Dev | Staging | Prod |
|---------|-----|---------|------|
| CPU | 256 | 512 | 1024 |
| Memory | 512 | 1024 | 2048 |
| Desired Count | 1 | 2 | 3 |
| Min Count | 1 | 1 | 2 |
| Max Count | 2 | 4 | 10 |
| Log Retention | 7 days | 14 days | 30 days |
| Alarms | No | Yes | Yes |
| AZs | 2 | 2 | 3 |

## 🗑️ Destroying Infrastructure

```bash
# Destroy dev environment
./scripts/destroy.sh dev

# Destroy staging (no confirmation)
./scripts/destroy.sh staging

# Destroy prod (requires typing "DESTROY PRODUCTION")
./scripts/destroy.sh prod
```

**Manual destruction:**

```bash
npx cdktf destroy --auto-approve
```

## 📁 Project Structure

```
iac/
├── main.ts                 # Main stack entry point
├── config/
│   └── index.ts            # Configuration loader
├── lib/
│   ├── index.ts            # Construct exports
│   ├── vpc.ts              # VPC, subnets, security groups
│   ├── ecr.ts              # ECR repository
│   ├── iam.ts              # IAM roles and policies
│   ├── alb.ts              # Application Load Balancer
│   ├── ecs.ts              # ECS cluster and service
│   ├── monitoring.ts       # CloudWatch logs, alarms, dashboard
│   └── route53.ts          # DNS and SSL certificate
├── scripts/
│   ├── bootstrap-backend.sh # Create remote backend
│   ├── deploy.sh           # Deploy infrastructure
│   └── destroy.sh          # Tear down infrastructure
├── cdktf.json              # CDKTF configuration
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
├── .env.example            # Example configuration
└── README.md               # This file
```

## 🔒 Security Features

1. **Private Subnets** - ECS tasks run in private subnets
2. **Security Groups** - ECS only accepts traffic from ALB
3. **IAM Least Privilege** - Minimal permissions for each role
4. **Encryption** - S3 backend encrypted at rest
5. **Non-root Container** - Application runs as non-root user
6. **No Hardcoded Secrets** - All sensitive data via environment variables

## 🎯 Bonus Features Implemented

- ✅ **Route53 Domain & HTTPS** - Automatic DNS and SSL
- ✅ **Multi-Environment Support** - dev/staging/prod configurations
- ✅ **Terraform Remote Backend** - S3 + DynamoDB state management
- ✅ **CloudWatch Integration** - Logs, dashboard, and alarms

## 🛠️ Troubleshooting

### ECS tasks failing to start

```bash
# Check task logs
aws logs tail /ecs/express-ts-app-dev --follow

# Check task status
aws ecs describe-tasks --cluster express-ts-cluster-dev --tasks <TASK_ARN>
```

### Can't pull image from ECR

1. Verify the image exists:
   ```bash
   aws ecr describe-images --repository-name express-ts-app-dev
   ```

2. Check execution role has ECR permissions

### ALB health checks failing

1. Verify security group allows traffic on container port
2. Check ECS task is running
3. Verify `/health` endpoint returns 200

### State locking errors

```bash
# Force unlock (use with caution)
cd cdktf.out/stacks/express-ts-app-dev
terraform force-unlock <LOCK_ID>
```

## 📚 Related Documentation

- [Application README](../app/README.md)
- [CDKTF Documentation](https://developer.hashicorp.com/terraform/cdktf)
- [AWS ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
