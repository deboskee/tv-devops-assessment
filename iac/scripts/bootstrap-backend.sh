#!/bin/bash
# =============================================================================
# Bootstrap Terraform Remote Backend
# =============================================================================
# Creates S3 bucket and DynamoDB table for Terraform state management
# Run this once per AWS account before first deployment
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="${APP_NAME:-express-ts-app}"
AWS_REGION="${AWS_REGION:-us-east-2}"
BUCKET_NAME="${TF_BACKEND_BUCKET:-${APP_NAME}-tfstate-${AWS_REGION}}"
DYNAMODB_TABLE="${TF_BACKEND_DYNAMODB:-${APP_NAME}-tfstate-lock}"

echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}Bootstrapping Terraform Remote Backend${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""
echo "Configuration:"
echo "  App Name:       ${APP_NAME}"
echo "  AWS Region:     ${AWS_REGION}"
echo "  S3 Bucket:      ${BUCKET_NAME}"
echo "  DynamoDB Table: ${DYNAMODB_TABLE}"
echo ""

# Check AWS credentials
if ! aws sts get-caller-identity &>/dev/null; then
    echo -e "${RED}Error: AWS credentials not configured or invalid${NC}"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${YELLOW}Using AWS Account: ${ACCOUNT_ID}${NC}"
echo ""

# Create S3 bucket
echo -e "${YELLOW}Creating S3 bucket for Terraform state...${NC}"
if aws s3api head-bucket --bucket "${BUCKET_NAME}" 2>/dev/null; then
    echo -e "${GREEN}✓ Bucket already exists${NC}"
else
    if [ "${AWS_REGION}" = "us-east-1" ]; then
        aws s3api create-bucket \
            --bucket "${BUCKET_NAME}" \
            --region "${AWS_REGION}"
    else
        aws s3api create-bucket \
            --bucket "${BUCKET_NAME}" \
            --region "${AWS_REGION}" \
            --create-bucket-configuration LocationConstraint="${AWS_REGION}"
    fi
    echo -e "${GREEN}✓ Bucket created${NC}"
fi

# Enable versioning
echo -e "${YELLOW}Enabling S3 versioning...${NC}"
aws s3api put-bucket-versioning \
    --bucket "${BUCKET_NAME}" \
    --versioning-configuration Status=Enabled
echo -e "${GREEN}✓ Versioning enabled${NC}"

# Enable encryption
echo -e "${YELLOW}Enabling S3 encryption...${NC}"
aws s3api put-bucket-encryption \
    --bucket "${BUCKET_NAME}" \
    --server-side-encryption-configuration '{
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }
        ]
    }'
echo -e "${GREEN}✓ Encryption enabled${NC}"

# Block public access
echo -e "${YELLOW}Blocking public access...${NC}"
aws s3api put-public-access-block \
    --bucket "${BUCKET_NAME}" \
    --public-access-block-configuration '{
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }'
echo -e "${GREEN}✓ Public access blocked${NC}"

# Create DynamoDB table
echo -e "${YELLOW}Creating DynamoDB table for state locking...${NC}"
if aws dynamodb describe-table --table-name "${DYNAMODB_TABLE}" &>/dev/null; then
    echo -e "${GREEN}✓ Table already exists${NC}"
else
    aws dynamodb create-table \
        --table-name "${DYNAMODB_TABLE}" \
        --attribute-definitions AttributeName=LockID,AttributeType=S \
        --key-schema AttributeName=LockID,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST \
        --tags Key=Application,Value="${APP_NAME}" Key=ManagedBy,Value=cdktf

    echo -e "${YELLOW}Waiting for table to be active...${NC}"
    aws dynamodb wait table-exists --table-name "${DYNAMODB_TABLE}"
    echo -e "${GREEN}✓ Table created${NC}"
fi

echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}Backend Bootstrap Complete!${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""
echo "Add these environment variables to enable remote backend:"
echo ""
echo "  export TF_VAR_backend_bucket=\"${BUCKET_NAME}\""
echo "  export TF_VAR_backend_dynamodb_table=\"${DYNAMODB_TABLE}\""
echo ""
echo "Or add to your .env file:"
echo ""
echo "  TF_VAR_backend_bucket=${BUCKET_NAME}"
echo "  TF_VAR_backend_dynamodb_table=${DYNAMODB_TABLE}"
echo ""
