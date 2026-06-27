#!/bin/bash
# Cloudflare Pages Deploy Tool - with auto project creation
# Usage: deploy_cloudflare.sh <project_dir> [project_name]
#
# Requires: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env vars
set -e

PROJECT_DIR=${1:?"Usage: deploy_cloudflare.sh <project_dir> [project_name]"}
PROJECT_NAME=${2:-"mizpa-$(date +%s)"}
CF_ACCOUNT=${3:-$CLOUDFLARE_ACCOUNT_ID}
CF_TOKEN=${4:-$CLOUDFLARE_API_TOKEN}

log() { echo "[$(date -Iseconds)] $1" >&2; }

# Validate
if [ -z "$CF_ACCOUNT" ] || [ -z "$CF_TOKEN" ]; then
  echo '{"error":"CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required"}'
  exit 1
fi

if [ ! -d "$PROJECT_DIR" ]; then
  echo "{\"error\":\"Directory not found: $PROJECT_DIR\"}"
  exit 1
fi

log "Deploying to Cloudflare Pages: $PROJECT_NAME"

# 1. Check if project exists, create if not
PROJECT_CHECK=$(curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/pages/projects/$PROJECT_NAME" \
  -H "Authorization: Bearer $CF_TOKEN")

PROJECT_EXISTS=$(echo "$PROJECT_CHECK" | jq -r '.success // false')

if [ "$PROJECT_EXISTS" != "true" ]; then
  log "Creating new Pages project: $PROJECT_NAME"
  CREATE_RESULT=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/pages/projects" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$PROJECT_NAME\",\"production_branch\":\"main\"}")
  
  CREATE_SUCCESS=$(echo "$CREATE_RESULT" | jq -r '.success // false')
  if [ "$CREATE_SUCCESS" != "true" ]; then
    echo "{\"error\":\"Failed to create project\",\"details\":$(echo "$CREATE_RESULT" | jq .)}"
    exit 1
  fi
  log "Project created: $PROJECT_NAME.pages.dev"
else
  log "Project exists: $PROJECT_NAME.pages.dev"
fi

# 2. Install dependencies if needed
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  log "Installing dependencies..."
  cd "$PROJECT_DIR" && npm install --silent 2>/dev/null
fi

# 3. Build
log "Building project..."
cd "$PROJECT_DIR"
npm run build 2>/dev/null

if [ ! -d "dist" ]; then
  echo '{"error":"Build failed - no dist directory"}'
  exit 1
fi

BUILD_SIZE=$(du -sb dist | cut -f1)
log "Build complete: $BUILD_SIZE bytes"

# 4. Deploy via wrangler
log "Deploying to Cloudflare Pages..."
DEPLOY_RESULT=$(CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT" CLOUDFLARE_API_TOKEN="$CF_TOKEN" \
  npx wrangler pages deploy dist --project-name="$PROJECT_NAME" --commit-dirty=true 2>&1)

# Extract the URL from wrangler output
DEPLOY_URL=$(echo "$DEPLOY_RESULT" | grep -oP 'https://[a-z0-9-]+\.pages\.dev' | head -1)

if [ -z "$DEPLOY_URL" ]; then
  DEPLOY_URL="https://${PROJECT_NAME}.pages.dev"
fi

log "Deployed: $DEPLOY_URL"

# 5. Return result as JSON
cat << EOF
{
  "status": "deployed",
  "projectName": "$PROJECT_NAME",
  "url": "$DEPLOY_URL",
  "buildSize": $BUILD_SIZE,
  "deployOutput": $(echo "$DEPLOY_RESULT" | tail -5 | jq -Rs .)
}
EOF
