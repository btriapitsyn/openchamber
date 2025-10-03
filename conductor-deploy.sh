#!/bin/bash

# Deploy OpenCode WebUI to dev.fedaykin
# Replicates VSCode task pipeline for remote deployment

set -e  # Exit on any error

REMOTE_HOST="dev.fedaykin"
PACKAGE_NAME="opencode-webui-1.0.0.tgz"
DEPLOY_PORT="3001"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_step() {
    echo -e "${YELLOW}▶ $1${NC}"
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

log_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Step 1: Build Package
log_step "Building package..."
if npm run build:package > /dev/null 2>&1; then
    log_success "Package built"
else
    log_error "Build failed"
    npm run build:package  # Show full output on error
    exit 1
fi

# Step 2: Create Archive
log_step "Creating archive..."
if npm pack > /dev/null 2>&1; then
    log_success "Archive created"
else
    log_error "Archive creation failed"
    npm pack  # Show full output on error
    exit 1
fi

# Step 3: Copy to Remote
log_step "Copying to remote..."
if scp -q "$PACKAGE_NAME" "$REMOTE_HOST:~/$PACKAGE_NAME" 2>&1; then
    log_success "Copied to remote"
else
    log_error "Copy to remote failed"
    exit 1
fi

# Step 4: Stop OpenCode
log_step "Stopping OpenCode on remote..."
if ssh "$REMOTE_HOST" 'mise exec -- opencode-webui stop' > /dev/null 2>&1; then
    log_success "Stopped"
else
    log_success "Skip (not installed or already stopped)"
fi

# Step 5: Uninstall Old Version
log_step "Uninstalling old version..."
if ssh "$REMOTE_HOST" 'mise exec -- npm uninstall -g opencode-webui' > /dev/null 2>&1; then
    log_success "Uninstalled"
else
    log_error "Uninstall failed"
    ssh "$REMOTE_HOST" 'mise exec -- npm uninstall -g opencode-webui' 2>&1
    exit 1
fi

# Step 6: Install New Version
log_step "Installing new version..."
if ssh "$REMOTE_HOST" "mise exec -- npm install -g ~/$PACKAGE_NAME" > /dev/null 2>&1; then
    log_success "Installed"
else
    log_error "Install failed"
    ssh "$REMOTE_HOST" "mise exec -- npm install -g ~/$PACKAGE_NAME" 2>&1
    exit 1
fi

# Step 7: Start OpenCode
log_step "Starting OpenCode on remote..."
if ssh "$REMOTE_HOST" "mise exec -- opencode-webui --port $DEPLOY_PORT --daemon" > /dev/null 2>&1; then
    log_success "Started on port $DEPLOY_PORT"
else
    log_error "Start failed"
    ssh "$REMOTE_HOST" "mise exec -- opencode-webui --port $DEPLOY_PORT --daemon" 2>&1
    exit 1
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}   Deployment completed successfully!${NC}"
echo -e "${GREEN}   Server: $REMOTE_HOST:$DEPLOY_PORT${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
