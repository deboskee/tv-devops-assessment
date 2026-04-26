# Express.js + TypeScript Application

[![CI/CD Pipeline](https://github.com/YOUR_USERNAME/tv-devops-assessment/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/YOUR_USERNAME/tv-devops-assessment/actions/workflows/ci-cd.yml)

A production-ready Express.js application with TypeScript, Docker, and AWS deployment capabilities.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- AWS CLI (for deployment)

### Local Development

**Option 1: Native Node.js**

```bash
# Install dependencies
npm install

# Start development server with hot-reload
npm run dev

# Access the app
curl http://localhost:3000/health
```

**Option 2: Docker Compose (Production Build)**

```bash
# Build and run
docker compose up --build

# Access the app
curl http://localhost:3000/health
```

**Option 3: Docker Compose (Development with Hot-Reload)**

```bash
# Run development container with volume mounts
docker compose --profile dev up app-dev --build
```

### Verify It's Working

```bash
# Health check endpoint
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2024-01-01T00:00:00.000Z",
#   "uptime": 10.123,
#   "version": "1.0.0",
#   "environment": "development"
# }

# Root endpoint
curl http://localhost:3000/
# Response: Hello from Express + TypeScript!
```

## 📁 Project Structure

```
app/
├── src/
│   ├── app.ts              # Express app setup
│   ├── server.ts           # Server entry point
│   └── routes/
│       └── index.ts        # Route definitions
├── Dockerfile              # Multi-stage production build
├── Dockerfile.dev          # Development build with hot-reload
├── docker-compose.yml      # Container orchestration
├── .dockerignore           # Docker build exclusions
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── .github/
    └── workflows/
        ├── ci-cd.yml       # Main CI/CD pipeline
        └── destroy.yml     # Infrastructure teardown
```

## 🐳 Docker Setup

### Dockerfile Features

- **Multi-stage build** for minimal image size (~150MB)
- **Non-root user** for security
- **Health check** built into container
- **Graceful shutdown** handling
- **Layer caching** optimized

### Building Locally

```bash
# Build production image
docker build -t express-ts-app .

# Run container
docker run -p 3000:3000 express-ts-app

# Check logs
docker logs <container_id>
```

### Image Size Optimization

The Dockerfile uses several techniques to minimize image size:

1. **Alpine base image** - Minimal Linux distribution
2. **Multi-stage build** - Only production files in final image
3. **npm prune --production** - Remove devDependencies
4. **Combined RUN commands** - Fewer layers

## 🔄 CI/CD Pipeline

### Workflow Overview

The GitHub Actions pipeline (`ci-cd.yml`) does:

1. **Build & Test** - Lint, test, compile TypeScript
2. **Docker Build** - Build and push to ECR
3. **Deploy** - Update ECS service via CDKTF

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `AWS_ACCOUNT_ID` | Your AWS account ID |

### Required GitHub Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_REGION` | AWS deployment region | `us-east-1` |
| `ECR_REPOSITORY_NAME` | ECR repository name | `express-ts-app` |
| `ECS_CLUSTER_NAME` | ECS cluster name | `express-ts-cluster` |
| `ECS_SERVICE_NAME` | ECS service name | `express-ts-service` |

### Optional Variables (for HTTPS/Domain)

| Variable | Description |
|----------|-------------|
| `DOMAIN_NAME` | Your domain (e.g., `app.example.com`) |
| `HOSTED_ZONE_ID` | Route53 hosted zone ID |
| `ENABLE_HTTPS` | Set to `true` to enable SSL |

### Trigger Deployment

Push to `main` branch to trigger the pipeline:

```bash
git add .
git commit -m "Deploy changes"
git push origin main
```

### Manual Deployment

Use the GitHub Actions UI to trigger a manual deployment:

1. Go to Actions tab
2. Select "CI/CD Pipeline"
3. Click "Run workflow"
4. Choose environment (dev/staging/prod)

## 🔒 Security

- Container runs as non-root user
- No secrets committed to repository
- IAM roles follow least privilege
- Health check endpoint is public (by design)
- All sensitive config via environment variables

## 📝 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled application |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests |

## 🛠️ Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs app

# Verify health check
docker compose exec app wget -qO- http://localhost:3000/health
```

### Port already in use

```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3001 npm run dev
```

### TypeScript errors

```bash
# Clean and rebuild
npm run clean
npm run build
```

## 📚 Related Documentation

- [Infrastructure (CDKTF)](../iac/README.md)
- [Deployment Guide](../iac/README.md#deployment)
