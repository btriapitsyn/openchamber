#!/bin/bash

# Deploy OpenChamber to dev.fedaykin
# Replicates VSCode task pipeline for remote deployment

set -e  # Exit on any error

REMOTE_HOST="dev.fedaykin"
PACKAGE_NAME="openchamber-1.0.0.tgz"
PROD_PORT="3001"
DEV_PORT="3002"

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

require_gum() {
    if ! command -v gum >/dev/null 2>&1; then
        log_error "gum is required for interactive selection"
        exit 1
    fi
}

deploy_remote_web() {
    local deployment_mode
    deployment_mode=$(gum choose "Remote" "Local" --header "Select installation environment")
    if [ -z "$deployment_mode" ]; then
        log_error "Deployment cancelled"
        exit 1
    fi

    local target_port
    target_port=$(gum choose "Production (port ${PROD_PORT})" "Development (port ${DEV_PORT})" --header "Select deployment target" | awk '{print $NF}' | tr -d ')(')

    if [ -z "$target_port" ]; then
        log_error "Deployment cancelled"
        exit 1
    fi

    local exec_prefix=""
    local copy_prefix=""
    if [ "$deployment_mode" = "Remote" ]; then
        exec_prefix="ssh $REMOTE_HOST"
        copy_prefix="scp -q"
    fi

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

    if [ "$deployment_mode" = "Remote" ]; then
        log_step "Copying to remote..."
        if scp -q "$PACKAGE_NAME" "$REMOTE_HOST:~/$PACKAGE_NAME" 2>&1; then
            log_success "Copied to remote"
        else
            log_error "Copy to remote failed"
            exit 1
        fi
    fi

    log_step "Stopping OpenCode on remote..."
    if [ "$deployment_mode" = "Remote" ]; then
        if ssh "$REMOTE_HOST" 'mise exec -- openchamber stop' > /dev/null 2>&1; then
            log_success "Stopped"
        else
            log_success "Skip (not installed or already stopped)"
        fi
    else
        if mise exec -- openchamber stop > /dev/null 2>&1; then
            log_success "Stopped"
        else
            log_success "Skip (not installed or already stopped)"
        fi
    fi

    log_step "Uninstalling old version..."
    if [ "$deployment_mode" = "Remote" ]; then
        if ssh "$REMOTE_HOST" 'mise exec -- npm uninstall -g openchamber' > /dev/null 2>&1; then
            log_success "Uninstalled"
        else
            log_error "Uninstall failed"
            ssh "$REMOTE_HOST" 'mise exec -- npm uninstall -g openchamber' 2>&1
            exit 1
        fi
    else
        if mise exec -- npm uninstall -g openchamber > /dev/null 2>&1; then
            log_success "Uninstalled"
        else
            log_error "Uninstall failed"
            mise exec -- npm uninstall -g openchamber 2>&1
            exit 1
        fi
    fi

    log_step "Installing new version..."
    if [ "$deployment_mode" = "Remote" ]; then
        if ssh "$REMOTE_HOST" "mise exec -- npm install -g ~/$PACKAGE_NAME" > /dev/null 2>&1; then
            log_success "Installed"
        else
            log_error "Install failed"
            ssh "$REMOTE_HOST" "mise exec -- npm install -g ~/$PACKAGE_NAME" 2>&1
            exit 1
        fi
    else
        if npm install -g "./$PACKAGE_NAME" > /dev/null 2>&1; then
            log_success "Installed"
        else
            log_error "Install failed"
            npm install -g "./$PACKAGE_NAME" 2>&1
            exit 1
        fi
    fi

    log_step "Starting OpenCode on remote (port $target_port)..."
    if [ "$deployment_mode" = "Remote" ]; then
        if ssh "$REMOTE_HOST" "mise exec -- openchamber --port $target_port --daemon" > /dev/null 2>&1; then
            log_success "Started on port $target_port"
        else
            log_error "Start failed"
            ssh "$REMOTE_HOST" "mise exec -- openchamber --port $target_port --daemon" 2>&1
            exit 1
        fi
    else
        if openchamber --port "$target_port" --daemon > /dev/null 2>&1; then
            log_success "Started on port $target_port"
        else
            log_error "Start failed"
            openchamber --port "$target_port" --daemon 2>&1
            exit 1
        fi
    fi

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}   Deployment completed successfully!${NC}"
    echo -e "${GREEN}   Server: $REMOTE_HOST:$target_port${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
}

build_electron_package() {
    log_step "Building Electron package..."
    if npm run package:electron; then
        log_success "Electron package created"
        latest_pkg=$(ls -t release/*.dmg release/*.zip 2>/dev/null | head -n 1 || true)
        if [ -n "$latest_pkg" ]; then
            echo -e "${YELLOW}Latest package:${NC} $latest_pkg"
        else
            echo -e "${YELLOW}Packages are available in:${NC} release/"
        fi
    else
        log_error "Electron packaging failed"
        exit 1
    fi
}

require_gum

CHOICE=$(gum choose "Build/Deploy web" "Build electron package" "Run both" --header "Select Conductor action")

case "$CHOICE" in
    "Build/Deploy web")
        deploy_remote_web
        ;;
    "Build electron package")
        build_electron_package
        ;;
    "Run both")
        deploy_remote_web
        build_electron_package
        ;;
    *)
        echo "Cancelled"
        ;;
esac
