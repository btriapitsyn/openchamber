#!/bin/bash

# Deploy OpenChamber to dev.fedaykin
# Replicates VSCode task pipeline for remote deployment

set -e  # Exit on any error

REMOTE_HOST="dev.fedaykin"
PACKAGE_FILE=""
PROD_PORT="3001"
DEV_PORT="3002"
PROD_DIR="testing-prod"
DEV_DIR="testing-dev"

# Detect OS
OS_TYPE="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS_TYPE="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS_TYPE="linux"
fi

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

    # On macOS, ask for Remote/Local. On Linux, force local deployment with separate directories
    if [ "$OS_TYPE" = "macos" ]; then
        deployment_mode=$(gum choose "Remote" "Local" --header "Select installation environment")
        if [ -z "$deployment_mode" ]; then
            log_error "Deployment cancelled"
            exit 1
        fi
    else
        deployment_mode="LocalSeparate"
    fi

    local target_choice
    target_choice=$(gum choose "Production (port ${PROD_PORT})" "Development (port ${DEV_PORT})" --header "Select deployment target")

    if [ -z "$target_choice" ]; then
        log_error "Deployment cancelled"
        exit 1
    fi

    local target_port
    local target_dir
    if [[ "$target_choice" == *"Production"* ]]; then
        target_port="$PROD_PORT"
        target_dir="$PROD_DIR"
    else
        target_port="$DEV_PORT"
        target_dir="$DEV_DIR"
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
    if PACKAGE_FILE=$(npm pack --quiet 2>/dev/null); then
        log_success "Archive created: $PACKAGE_FILE"
    else
        log_error "Archive creation failed"
        npm pack
        exit 1
    fi

    if [ "$deployment_mode" = "Remote" ]; then
        log_step "Preparing remote directories..."
        if ssh "$REMOTE_HOST" "mkdir -p ~/$target_dir/releases" > /dev/null 2>&1; then
            log_success "Directory ready: ~/$target_dir/releases"
        else
            log_error "Failed to create directory"
            exit 1
        fi

        log_step "Stopping existing instance (port $target_port)..."
        ssh "$REMOTE_HOST" "cd ~/$target_dir 2>/dev/null && if [ -f ./node_modules/openchamber/bin/cli.js ]; then node ./node_modules/openchamber/bin/cli.js stop --port $target_port >/dev/null 2>&1 || true; fi" > /dev/null 2>&1 || true
        log_success "Stopped (if was running)"

        log_step "Copying package to remote..."
        if scp -q "$PACKAGE_FILE" "$REMOTE_HOST:~/$target_dir/releases/$PACKAGE_FILE" 2>&1; then
            log_success "Copied to remote releases"
        else
            log_error "Copy to remote failed"
            exit 1
        fi

        log_step "Ensuring package manifest..."
        if ssh "$REMOTE_HOST" "cd ~/$target_dir && { [ -f package.json ] || npm init -y >/dev/null 2>&1; }" > /dev/null 2>&1; then
            log_success "package.json ready"
        else
            log_error "Failed to prepare package.json"
            exit 1
        fi

        log_step "Installing package to ~/$target_dir..."
        if ssh "$REMOTE_HOST" "cd ~/$target_dir && npm install ./releases/$PACKAGE_FILE" > /dev/null 2>&1; then
            log_success "Installed"
        else
            log_error "Install failed"
            ssh "$REMOTE_HOST" "cd ~/$target_dir && npm install ./releases/$PACKAGE_FILE" 2>&1
            exit 1
        fi

        log_step "Starting instance (port $target_port)..."
        PASSWORD_VALUE=$(ssh "$REMOTE_HOST" "grep '^export OPENCHAMBER_PASSWORD=' ~/.config/ubura/user 2>/dev/null | sed -E 's/.*=[\"“]?([^\"”]+)[\"”]?/\\1/'")
        if [ -z "$PASSWORD_VALUE" ]; then
            log_error "UI password not found on remote host"
            exit 1
        fi
        UI_PASSWORD_ARGS=(--ui-password "$PASSWORD_VALUE")
        if ssh "$REMOTE_HOST" "cd ~/$target_dir && node ./node_modules/openchamber/bin/cli.js --port $target_port --daemon ${UI_PASSWORD_ARGS[*]}" > /dev/null 2>&1; then
            log_success "Started on port $target_port"
        else
            log_error "Start failed"
            ssh "$REMOTE_HOST" "cd ~/$target_dir && node ./node_modules/openchamber/bin/cli.js --port $target_port --daemon ${UI_PASSWORD_ARGS[*]}" 2>&1
            exit 1
        fi
    elif [ "$deployment_mode" = "LocalSeparate" ]; then
        log_step "Stopping existing instance (port $target_port)..."
        (cd ~/"$target_dir" 2>/dev/null && if [ -f ./node_modules/openchamber/bin/cli.js ]; then node ./node_modules/openchamber/bin/cli.js stop --port "$target_port" > /dev/null 2>&1 || true; fi) > /dev/null 2>&1 || true
        log_success "Stopped (if was running)"

        log_step "Creating installation directory..."
        if mkdir -p ~/"$target_dir" > /dev/null 2>&1; then
            log_success "Directory ready: ~/$target_dir"
        else
            log_error "Failed to create directory"
            exit 1
        fi

        log_step "Ensuring package manifest..."
        if (cd ~/"$target_dir" && [ -f package.json ] || npm init -y > /dev/null 2>&1); then
            log_success "package.json ready"
        else
            log_error "Failed to prepare package.json"
            exit 1
        fi

        log_step "Installing package to ~/$target_dir..."
        local_package_path="$(pwd)/$PACKAGE_FILE"
        if (cd ~/"$target_dir" && npm install "$local_package_path") > /dev/null 2>&1; then
            log_success "Installed"
        else
            log_error "Install failed"
            (cd ~/"$target_dir" && npm install "$local_package_path") 2>&1
            exit 1
        fi

        log_step "Starting instance (port $target_port)..."
        if (cd ~/"$target_dir" && node ./node_modules/openchamber/bin/cli.js --port "$target_port" --daemon) > /dev/null 2>&1; then
            log_success "Started on port $target_port"
        else
            log_error "Start failed"
            (cd ~/"$target_dir" && npx openchamber --port "$target_port" --daemon) 2>&1
            exit 1
        fi
    else
        log_step "Stopping local instance..."
        openchamber stop > /dev/null 2>&1 || true
        log_success "Stopped (if was running)"

        log_step "Uninstalling old version..."
        if npm uninstall -g openchamber > /dev/null 2>&1; then
            log_success "Uninstalled"
        else
            log_success "Skip (not installed)"
        fi

        log_step "Installing new version globally..."
        local_package_path="$(pwd)/$PACKAGE_FILE"
        if npm install -g "$local_package_path" > /dev/null 2>&1; then
            log_success "Installed"
        else
            log_error "Install failed"
            npm install -g "$local_package_path" 2>&1
            exit 1
        fi

        log_step "Starting local instance (port $target_port)..."
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
    if [ "$deployment_mode" = "Remote" ]; then
        echo -e "${GREEN}   Location: $REMOTE_HOST:~/$target_dir${NC}"
        echo -e "${GREEN}   Server: $REMOTE_HOST:$target_port${NC}"
    elif [ "$deployment_mode" = "LocalSeparate" ]; then
        echo -e "${GREEN}   Location: ~/$target_dir${NC}"
        echo -e "${GREEN}   Server: localhost:$target_port${NC}"
    else
        echo -e "${GREEN}   Installation: Global${NC}"
        echo -e "${GREEN}   Server: localhost:$target_port${NC}"
    fi
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
}

build_electron_package() {
    log_step "Building Electron package..."
    if npm run package:electron; then
        log_success "Electron package created"
        latest_dmg=$(ls -t release/*.dmg 2>/dev/null | head -n 1 || true)
        if [ -n "$latest_dmg" ]; then
            echo -e "${YELLOW}Latest DMG:${NC} $latest_dmg"
            open "$latest_dmg" 2>/dev/null || xdg-open "$latest_dmg" 2>/dev/null || echo "Please open it manually."
        else
            latest_pkg=$(ls -t release/*.zip 2>/dev/null | head -n 1 || true)
            if [ -n "$latest_pkg" ]; then
                echo -e "${YELLOW}Latest package:${NC} $latest_pkg"
                open "$latest_pkg" 2>/dev/null || xdg-open "$latest_pkg" 2>/dev/null || echo "Please open it manually."
            else
                echo -e "${YELLOW}Packages are available in:${NC} release/"
            fi
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
