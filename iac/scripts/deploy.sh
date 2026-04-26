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
