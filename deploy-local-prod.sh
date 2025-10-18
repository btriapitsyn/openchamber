#!/bin/bash

# Deploy OpenChamber locally to ~/openchamber-prod/
# No interactive choices - direct deployment to production directory

set -e  # Exit on any error

PACKAGE_NAME="openchamber-1.0.0.tgz"
PROD_PORT="3001"
PROD_DIR="openchamber-prod"

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

log_step "Building package..."
if npm run build:package > /dev/null 2>&1; then
    log_success "Package built"
else
    log_error "Build failed"
    npm run build:package
    exit 1
fi

log_step "Creating archive..."
if npm pack > /dev/null 2>&1; then
    log_success "Archive created"
else
    log_error "Archive creation failed"
    npm pack
    exit 1
fi

log_step "Stopping existing instance (port $PROD_PORT)..."
(cd ~/"$PROD_DIR" 2>/dev/null && npx openchamber stop --port "$PROD_PORT" 2>/dev/null || true) > /dev/null 2>&1 || true
log_success "Stopped (if was running)"

log_step "Creating installation directory..."
if mkdir -p ~/"$PROD_DIR" > /dev/null 2>&1; then
    log_success "Directory ready: ~/$PROD_DIR"
else
    log_error "Failed to create directory"
    exit 1
fi

log_step "Installing package to ~/$PROD_DIR..."
local_package_path="$(pwd)/$PACKAGE_NAME"
if (cd ~/"$PROD_DIR" && npm install "$local_package_path") > /dev/null 2>&1; then
    log_success "Installed"
else
    log_error "Install failed"
    (cd ~/"$PROD_DIR" && npm install "$local_package_path") 2>&1
    exit 1
fi

log_step "Starting instance (port $PROD_PORT)..."
if (cd ~/"$PROD_DIR" && npx openchamber --port "$PROD_PORT" --daemon) > /dev/null 2>&1; then
    log_success "Started on port $PROD_PORT"
else
    log_error "Start failed"
    (cd ~/"$PROD_DIR" && npx openchamber --port "$PROD_PORT" --daemon) 2>&1
    exit 1
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}   Deployment completed successfully!${NC}"
echo -e "${GREEN}   Location: ~/$PROD_DIR${NC}"
echo -e "${GREEN}   Server: localhost:$PROD_PORT${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
