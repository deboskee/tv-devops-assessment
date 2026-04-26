#!/bin/bash
# =============================================================================
# Destroy Script
# =============================================================================
# Tears down all infrastructure for the specified environment
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

echo -e "${RED}==============================================================================${NC}"
echo -e "${RED}DESTROYING Express.js App Infrastructure - $(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')${NC}"
echo -e "${RED}==============================================================================${NC}"
echo ""

# Safety check for production
if [ "${ENVIRONMENT}" = "prod" ]; then
    echo -e "${RED}⚠️  WARNING: You are about to destroy PRODUCTION infrastructure!${NC}"
    echo ""
    read -p "Type 'DESTROY PRODUCTION' to confirm: " confirmation
    if [ "${confirmation}" != "DESTROY PRODUCTION" ]; then
        echo -e "${GREEN}Destruction cancelled.${NC}"
        exit 0
    fi
fi

# Load environment file if exists
if [ -f "${IAC_DIR}/.env.${ENVIRONMENT}" ]; then
    export $(grep -v '^#' "${IAC_DIR}/.env.${ENVIRONMENT}" | xargs)
elif [ -f "${IAC_DIR}/.env" ]; then
    export $(grep -v '^#' "${IAC_DIR}/.env" | xargs)
fi

export TF_VAR_environment="${ENVIRONMENT}"

cd "${IAC_DIR}"

echo -e "${YELLOW}Destroying infrastructure...${NC}"
npx cdktf destroy --auto-approve

echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}Infrastructure Destroyed${NC}"
echo -e "${GREEN}==============================================================================${NC}"
