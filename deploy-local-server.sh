#!/bin/bash

# Deploy OpenChamber locally on dev.fedaykin
# Provides interactive choice between production and development instances

set -e

PACKAGE_FILE=""
PROD_PORT="3001"
DEV_PORT="3002"
PROD_DIR="testing-prod"
DEV_DIR="testing-dev"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_step() {
    echo -e "${YELLOW}-> $1${NC}"
}

log_success() {
    echo -e "${GREEN}[OK] $1${NC}"
}

log_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

# Default to dev, unless 'prod' argument is passed
if [ "$1" = "prod" ] || [ "$1" = "production" ] || [ "$1" = "p" ]; then
    TARGET_PORT="$PROD_PORT"
    TARGET_DIR="$PROD_DIR"
    TARGET_LABEL="Production"
else
    TARGET_PORT="$DEV_PORT"
    TARGET_DIR="$DEV_DIR"
    TARGET_LABEL="Development"
fi

log_step "Building package..."
if pnpm run build:package > /dev/null 2>&1; then
    log_success "Package built"
else
    log_error "Build failed"
    pnpm run build:package
    exit 1
fi

log_step "Creating archive..."
pack_json_file="$(mktemp)"
if pnpm pack --pack-destination . --json > "$pack_json_file"; then
    if PACKAGE_FILE=$(PNPM_PACK_JSON="$pack_json_file" node -e "const fs=require('fs');const raw=fs.readFileSync(process.env.PNPM_PACK_JSON,'utf8');let data;try{data=JSON.parse(raw);}catch(e){process.exit(1);}if(Array.isArray(data))data=data[0];if(!data||!data.filename)process.exit(1);process.stdout.write(data.filename);"); then
        log_success "Archive created: $PACKAGE_FILE"
    else
        log_error "Archive creation failed (pack json parse)"
        rm -f "$pack_json_file"
        exit 1
    fi
else
    log_error "Archive creation failed"
    rm -f "$pack_json_file"
    exit 1
fi
rm -f "$pack_json_file"

log_step "Preparing installation directory..."
if mkdir -p ~/"$TARGET_DIR" > /dev/null 2>&1; then
    log_success "Directory ready: ~/$TARGET_DIR"
else
    log_error "Failed to prepare directory"
    exit 1
fi

log_step "Ensuring package manifest..."
if (cd ~/"$TARGET_DIR" && { [ -f package.json ] || PATH="$HOME/.local/share/pnpm:$PATH" pnpm init > /dev/null 2>&1; }); then
    log_success "package.json ready"
else
    log_error "Failed to prepare package.json"
    exit 1
fi

log_step "Stopping existing instance (port $TARGET_PORT)..."
(cd ~/"$TARGET_DIR" 2>/dev/null && if [ -f ./node_modules/.bin/openchamber ]; then ./node_modules/.bin/openchamber stop --port "$TARGET_PORT" >/dev/null 2>&1 || true; elif [ -f ./node_modules/openchamber/bin/cli.js ]; then node ./node_modules/openchamber/bin/cli.js stop --port "$TARGET_PORT" >/dev/null 2>&1 || true; fi) > /dev/null 2>&1 || true
log_success "Stopped (if was running)"

log_step "Installing package to ~/$TARGET_DIR..."
local_package_path="$(pwd)/$PACKAGE_FILE"
if (cd ~/"$TARGET_DIR" && PATH="$HOME/.local/share/pnpm:$PATH" pnpm add "$local_package_path") > /dev/null 2>&1; then
    log_success "Installed"
else
    log_error "Install failed"
    (cd ~/"$TARGET_DIR" && PATH="$HOME/.local/share/pnpm:$PATH" pnpm add "$local_package_path") 2>&1
    exit 1
fi

log_step "Starting instance (port $TARGET_PORT)..."
PASSWORD_FILE="$HOME/.config/ubura/user"
PASSWORD_VALUE=$(grep '^export OPENCHAMBER_PASSWORD=' "$PASSWORD_FILE" 2>/dev/null | sed -E 's/.*=["“]?([^"”]+)["”]?/\1/')
if [ -z "$PASSWORD_VALUE" ]; then
    log_error "OPENCHAMBER_PASSWORD not found in $PASSWORD_FILE"
    exit 1
fi

UI_PASSWORD_ARGS=(--ui-password "$PASSWORD_VALUE")
if (cd ~/"$TARGET_DIR" && node ./node_modules/openchamber/bin/cli.js --port "$TARGET_PORT" --daemon "${UI_PASSWORD_ARGS[@]}") > /dev/null 2>&1; then
    log_success "Started on port $TARGET_PORT"
else
    log_error "Start failed"
    (cd ~/"$TARGET_DIR" && node ./node_modules/openchamber/bin/cli.js --port "$TARGET_PORT" --daemon "${UI_PASSWORD_ARGS[@]}") 2>&1
    exit 1
fi


echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}   Deployment completed successfully!${NC}"
echo -e "${GREEN}   Target: $TARGET_LABEL${NC}"
echo -e "${GREEN}   Location: ~/$TARGET_DIR${NC}"
echo -e "${GREEN}   Server: localhost:$TARGET_PORT${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
