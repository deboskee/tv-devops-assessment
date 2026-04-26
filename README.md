# TurboVets DevOps Assessment

[![CI/CD Pipeline](https://github.com/YOUR_USERNAME/tv-devops-assessment/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/YOUR_USERNAME/tv-devops-assessment/actions/workflows/ci-cd.yml)

A production-ready Express.js + TypeScript application with Docker containerization and AWS deployment via CDK for Terraform.

## 📋 Table of Contents

- [Overview](#-overview)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Local Development](#-local-development)
- [AWS Deployment](#-aws-deployment)
- [CI/CD Pipeline](#-cicd-pipeline)
- [Configuration](#-configuration)
- [Bonus Features](#-bonus-features)
- [Video Walkthrough](#-video-walkthrough)

## 🎯 Overview

This project demonstrates:

1. **Containerization** - Multi-stage Docker build optimized for production
2. **Infrastructure as Code** - CDKTF (TypeScript) for AWS resources
3. **CI/CD** - GitHub Actions for automated deployments
4. **Security** - IAM least privilege, non-root containers, no hardcoded secrets

### Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              GitHub Actions                                   │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│   │    Build    │───►│    Test     │───►│  Push ECR   │───►│   Deploy    │   │
│   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                                   AWS                                         │
│                                                                              │
│   ┌─────────┐     ┌─────────┐     ┌─────────────────────────────────────┐   │
│   │  ECR    │────►│   ALB   │────►│         ECS Fargate                 │   │
│   │ (Image) │     │         │     │  ┌─────────┐  ┌─────────┐          │   │
│   └─────────┘     └─────────┘     │  │  Task   │  │  Task   │  (Auto-  │   │
│                        │          │  │   1     │  │   2     │  scaling)│   │
│                        │          │  └─────────┘  └─────────┘          │   │
│   ┌─────────┐          │          └─────────────────────────────────────┘   │
│   │Route53  │──────────┘                           │                         │
│   │(Optional)                                      │                         │
│   └─────────┘              ┌───────────────────────┘                         │
│                            ▼                                                  │
│                     ┌─────────────┐                                          │
│                     │ CloudWatch  │                                          │
│                     │Logs/Alarms  │                                          │
│                     └─────────────┘                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- AWS CLI configured
- Terraform 1.7+

### Local Development (30 seconds)

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/tv-devops-assessment.git
cd tv-devops-assessment/app

# Run with Docker Compose
docker compose up --build

# Test the health endpoint
curl http://localhost:3000/health
```

### Deploy to AWS (5 minutes)

```bash
# 1. Configure AWS credentials
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret

# 2. Set required variables
export TF_VAR_aws_region=us-east-1
export TF_VAR_aws_account_id=$(aws sts get-caller-identity --query Account --output text)

# 3. Deploy infrastructure
cd iac
npm install
./scripts/deploy.sh dev

# 4. Build and push image (or let CI/CD handle it)
cd ../app
aws ecr get-login-password | docker login --username AWS --password-stdin $TF_VAR_aws_account_id.dkr.ecr.$TF_VAR_aws_region.amazonaws.com
docker build -t express-ts-app .
docker tag express-ts-app:latest $TF_VAR_aws_account_id.dkr.ecr.$TF_VAR_aws_region.amazonaws.com/express-ts-app-dev:latest
docker push $TF_VAR_aws_account_id.dkr.ecr.$TF_VAR_aws_region.amazonaws.com/express-ts-app-dev:latest
```

## 📁 Project Structure

```
tv-devops-assessment/
├── README.md                   # This file
├── app/                        # Application code
│   ├── src/                    # TypeScript source
│   ├── Dockerfile              # Multi-stage production build
│   ├── Dockerfile.dev          # Development build
│   ├── docker-compose.yml      # Local orchestration
│   ├── .dockerignore           # Build exclusions
│   ├── .github/workflows/      # CI/CD pipelines
│   │   ├── ci-cd.yml           # Main pipeline
│   │   └── destroy.yml         # Teardown workflow
│   └── README.md               # App documentation
└── iac/                        # Infrastructure code
    ├── main.ts                 # CDKTF stack
    ├── config/                 # Configuration
    ├── lib/                    # Constructs (VPC, ECS, etc.)
    ├── scripts/                # Deployment scripts
    └── README.md               # IaC documentation
```

## 🐳 Local Development

### Using Docker Compose

```bash
cd app

# Production build
docker compose up --build

# Development with hot-reload
docker compose --profile dev up app-dev --build

# Stop and cleanup
docker compose down -v
```

### Native Node.js

```bash
cd app
npm install
npm run dev
```

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Hello message |
| `GET /health` | Health check (returns JSON) |

## ☁️ AWS Deployment

### Configure for Your AWS Account

1. **Create `.env` file:**
   ```bash
   cd iac
   cp .env.example .env
   ```

2. **Set your values:**
   ```bash
   TF_VAR_aws_region=us-east-1
   TF_VAR_aws_account_id=YOUR_ACCOUNT_ID
   ```

3. **(Optional) Setup remote backend:**
   ```bash
   ./scripts/bootstrap-backend.sh
   ```

4. **Deploy:**
   ```bash
   ./scripts/deploy.sh dev
   ```

### Required AWS Permissions

The deploying IAM user/role needs permissions for:
- VPC (create/modify/delete)
- ECS (clusters, services, tasks)
- ECR (repositories)
- ELB (load balancers, target groups)
- IAM (roles, policies)
- CloudWatch (log groups, alarms, dashboards)
- Route53 (optional, for domain)
- ACM (optional, for SSL)

See [iac/README.md](iac/README.md) for the complete permissions list.

## 🔄 CI/CD Pipeline

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key |
| `AWS_ACCOUNT_ID` | AWS account ID |

### GitHub Variables (Optional)

| Variable | Default |
|----------|---------|
| `AWS_REGION` | `us-east-1` |
| `DOMAIN_NAME` | - |
| `HOSTED_ZONE_ID` | - |
| `ENABLE_HTTPS` | `false` |

### Setting Up Secrets

1. Go to your repository → Settings → Secrets and variables → Actions
2. Add each secret listed above
3. Optionally add variables for customization

### Triggering Deployments

- **Automatic:** Push to `main` branch
- **Manual:** Actions → CI/CD Pipeline → Run workflow

## ⚙️ Configuration

### Environment-Specific Settings

| Setting | Dev | Staging | Prod |
|---------|-----|---------|------|
| CPU | 256 | 512 | 1024 |
| Memory | 512MB | 1024MB | 2048MB |
| Min Tasks | 1 | 1 | 2 |
| Max Tasks | 2 | 4 | 10 |
| Log Retention | 7 days | 14 days | 30 days |
| Alarms | No | Yes | Yes |

### Full Configuration Reference

See [iac/README.md#configuration-reference](iac/README.md#-configuration-reference)

## ⭐ Bonus Features

All bonus features have been implemented:

### ✅ Route53 Domain & HTTPS

Enable with:
```bash
TF_VAR_domain_name=app.example.com
TF_VAR_hosted_zone_id=Z1234567890ABC
TF_VAR_enable_https=true
```

### ✅ Multi-Environment Support

Deploy to different environments:
```bash
./scripts/deploy.sh dev
./scripts/deploy.sh staging
./scripts/deploy.sh prod
```

### ✅ Terraform Remote Backend

Setup S3 + DynamoDB backend:
```bash
./scripts/bootstrap-backend.sh
```

### ✅ CloudWatch Integration

Includes:
- Log groups with retention
- CloudWatch dashboard
- Alarms for CPU, memory, errors (staging/prod)
- SNS notifications

## 🎥 Video Walkthrough

[Link to video walkthrough - record 5-10 minute explanation]

The video covers:
1. Docker + Compose setup and how it works
2. CDKTF structure and deployment logic
3. GitHub Actions CI/CD workflow
4. Instructions for deploying to your AWS account
5. Design decisions and tradeoffs

## 📚 Additional Documentation

- [Application README](app/README.md) - Docker, local dev, CI/CD details
- [Infrastructure README](iac/README.md) - CDKTF, AWS resources, configuration

## 🧹 Cleanup

To destroy all AWS resources:

```bash
cd iac
./scripts/destroy.sh dev  # or staging, prod
```

Or via GitHub Actions:
1. Go to Actions → Destroy Infrastructure
2. Select environment
3. Type "DESTROY" to confirm

## 📝 License

ISC
