#!/bin/bash
# Cloudflare Pages Direct Upload — curl only, no wrangler
# Usage: deploy_cloudflare.sh <dist_dir> <project_name>
# Requires: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env vars
set -euo pipefail

DIST_DIR=${1:?"Usage: deploy_cloudflare.sh <dist_dir> <project_name>"}
PROJECT_NAME=${2:?"Usage: deploy_cloudflare.sh <dist_dir> <project_name>"}
CF_ACCOUNT=${CLOUDFLARE_ACCOUNT_ID:?"CLOUDFLARE_ACCOUNT_ID required"}
CF_TOKEN=${CLOUDFLARE_API_TOKEN:?"CLOUDFLARE_API_TOKEN required"}

log() { echo "[$(date -Iseconds)] $1" >&2; }

if [ ! -d "$DIST_DIR" ]; then
  echo "{\"error\":\"Directory not found: $DIST_DIR\"}"
  exit 1
fi

CF_API="https://api.cloudflare.com/client/v4"
AUTH="Authorization: Bearer $CF_TOKEN"

# 1. Create project if it doesn't exist
CHECK=$(curl -sf "$CF_API/accounts/$CF_ACCOUNT/pages/projects/$PROJECT_NAME" -H "$AUTH" 2>/dev/null || echo '{"success":false}')
EXISTS=$(echo "$CHECK" | jq -r '.success // false')

if [ "$EXISTS" != "true" ]; then
  log "Creating project: $PROJECT_NAME"
  CREATE=$(curl -sf -X POST "$CF_API/accounts/$CF_ACCOUNT/pages/projects" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"name\":\"$PROJECT_NAME\",\"production_branch\":\"main\"}" 2>/dev/null)
  C_OK=$(echo "$CREATE" | jq -r '.success // false')
  if [ "$C_OK" != "true" ]; then
    echo "{\"error\":\"Create project failed\",\"details\":$(echo "$CREATE" | jq -c .)}"
    exit 1
  fi
  log "Project created"
else
  log "Project exists"
fi

# 2. Upload each file in dist/ via Direct Upload API
log "Uploading files from $DIST_DIR..."

# Collect all files relative to dist/
FILE_LIST=$(cd "$DIST_DIR" && find . -type f | sed 's|^\./||' | sort)
FILE_COUNT=$(echo "$FILE_LIST" | wc -l | tr -d ' ')
log "Found $FILE_COUNT files"

# Build manifest JSON
MANIFEST="{"
FIRST=true
for F in $FILE_LIST; do
  SIZE=$(stat -c%s "$DIST_DIR/$F" 2>/dev/null || stat -f%z "$DIST_DIR/$F")
  # Guess content type
  case "$F" in
    *.html) CT="text/html" ;;
    *.css)  CT="text/css" ;;
    *.js)   CT="application/javascript" ;;
    *.json) CT="application/json" ;;
    *.png)  CT="image/png" ;;
    *.jpg|*.jpeg) CT="image/jpeg" ;;
    *.svg)  CT="image/svg+xml" ;;
    *.ico)  CT="image/x-icon" ;;
    *.woff) CT="font/woff" ;;
    *.woff2) CT="font/woff2" ;;
    *.ttf)  CT="font/ttf" ;;
    *)      CT="application/octet-stream" ;;
  esac
  [ "$FIRST" = true ] && FIRST=false || MANIFEST="$MANIFEST,"
  MANIFEST="$MANIFEST\"$F\":{\"contentType\":\"$CT\",\"size\":$SIZE}"
done
MANIFEST="$MANIFEST}"

# Create deployment with files
log "Creating deployment..."
DEPLOY_CMD=(curl -sf -X POST "$CF_API/accounts/$CF_ACCOUNT/pages/projects/$PROJECT_NAME/deployments"
DEPLOY_CMD+=(-H "$AUTH")

# Add each file as a form field
for F in $FILE_LIST; do
  DEPLOY_CMD+=(-F "$F=@$DIST_DIR/$F")
done

# Add manifest
DEPLOY_CMD+=(-F "manifest=$MANIFEST")

# Execute
DEPLOY_RESULT=$("${DEPLOY_CMD[@]}" 2>&1) || {
  # If direct upload fails, try the legacy form method
  log "Direct upload failed, trying legacy method..."
  LEGACY_RESULT=$(curl -sf -X POST "$CF_API/accounts/$CF_ACCOUNT/pages/projects/$PROJECT_NAME/deployments" \
    -H "$AUTH" \
    -F "manifest=$MANIFEST" \
    $(for F in $FILE_LIST; do echo "-F \"$F=@$DIST_DIR/$F\""; done) 2>&1) || {
    echo "{\"error\":\"Deploy failed\",\"output\":$(echo "$LEGACY_RESULT" | jq -Rs .)}"
    exit 1
  }
  DEPLOY_RESULT="$LEGACY_RESULT"
}

# Extract URL
DEPLOY_URL=$(echo "$DEPLOY_RESULT" | jq -r '.result.url // empty' 2>/dev/null)
if [ -z "$DEPLOY_URL" ]; then
  DEPLOY_URL=$(echo "$DEPLOY_RESULT" | grep -oP 'https://[a-z0-9-]+\.pages\.dev' | head -1)
fi
if [ -z "$DEPLOY_URL" ]; then
  DEPLOY_URL="https://${PROJECT_NAME}.pages.dev"
fi

log "Deployed: $DEPLOY_URL"

BUILD_SIZE=$(cd "$DIST_DIR" && du -sb . | cut -f1)

# Return result
cat << EOF
{
  "status": "deployed",
  "projectName": "$PROJECT_NAME",
  "url": "$DEPLOY_URL",
  "buildSize": $BUILD_SIZE,
  "fileCount": $FILE_COUNT
}
EOF
