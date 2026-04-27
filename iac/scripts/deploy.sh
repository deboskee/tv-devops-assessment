#!/bin/bash
# =============================================================================
# Deploy Script
# =============================================================================
# Convenience script for deploying infrastructure
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IAC_DIR="$(dirname "${SCRIPT_DIR}")"

# Default environment
ENVIRONMENT="${1:-dev}"

echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}Deploying Express.js App Infrastructure - $(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""

# Load environment file if exists
if [ -f "${IAC_DIR}/.env.${ENVIRONMENT}" ]; then
    echo -e "${YELLOW}Loading environment file: .env.${ENVIRONMENT}${NC}"
    export $(grep -v '^#' "${IAC_DIR}/.env.${ENVIRONMENT}" | xargs)
elif [ -f "${IAC_DIR}/.env" ]; then
    echo -e "${YELLOW}Loading environment file: .env${NC}"
    export $(grep -v '^#' "${IAC_DIR}/.env" | xargs)
fi

# Set environment
export TF_VAR_environment="${ENVIRONMENT}"

# Verify AWS credentials
if ! aws sts get-caller-identity >/dev/null; then
    echo -e "${RED}Error: AWS credentials not configured or session expired.${NC}"
    echo "Please ensure you have run 'aws configure' or exported your AWS keys."
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export TF_VAR_aws_account_id="${TF_VAR_aws_account_id:-${ACCOUNT_ID}}"

echo "Configuration:"
echo "  Environment:  ${ENVIRONMENT}"
echo "  AWS Account:  ${TF_VAR_aws_account_id}"
echo "  AWS Region:   ${TF_VAR_aws_region:-us-east-1}"
echo ""

cd "${IAC_DIR}"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm ci
fi

# Synthesize Terraform configuration
echo -e "${YELLOW}Synthesizing Terraform configuration...${NC}"
npx cdktf synth

# Ensure ECR exists to avoid "Chicken and Egg" failures during image push
echo -e "${YELLOW}Ensuring ECR repository exists...${NC}"
APP_NAME="${APP_NAME:-express-ts-app}"
REPO_NAME="${TF_VAR_ecr_repository_name:-${APP_NAME}-${ENVIRONMENT}}"
if aws ecr describe-repositories --repository-names "${REPO_NAME}" &>/dev/null; then
    echo -e "${GREEN}ECR repository '${REPO_NAME}' already exists.${NC}"
else
    echo -e "${YELLOW}Creating ECR repository '${REPO_NAME}'...${NC}"
    aws ecr create-repository --repository-name "${REPO_NAME}" \
        --image-scanning-configuration scanOnPush=true \
        --encryption-configuration encryptionType=AES256 > /dev/null
fi

# Try to import ECR into terraform state if it exists but is not tracked
# This prevents "repository already exists" errors during cdktf deploy
echo -e "${YELLOW}Synchronizing ECR state...${NC}"
STACK_NAME="express-ts-app-${ENVIRONMENT}"
STACK_DIR="cdktf.out/stacks/${STACK_NAME}"

if [ -d "${STACK_DIR}" ]; then
    echo "  Checking if ECR '${REPO_NAME}' is tracked in state..."
    (
        cd "${STACK_DIR}"
        # Initialize terraform in the synth directory to enable import
        terraform init -no-color >/dev/null 2>&1
        
        # Check if already in state
        if ! terraform state show aws_ecr_repository.ecr_repo >/dev/null 2>&1; then
            echo "  Importing existing ECR repository into state..."
            terraform import -no-color aws_ecr_repository.ecr_repo "${REPO_NAME}" >/dev/null 2>&1 || true
        else
            echo "  ECR repository is already tracked in state."
        fi
    )
fi

# Deploy
echo -e "${YELLOW}Deploying infrastructure...${NC}"
npx cdktf deploy --auto-approve

echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""

# Show outputs
cd "cdktf.out/stacks/express-ts-app-${ENVIRONMENT}"
echo "Outputs:"
terraform output 2>/dev/null || true
