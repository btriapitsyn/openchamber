#!/bin/bash
# ==============================================================================
# OpenCode Persistence Restore Script
# ==============================================================================
# This script restores session data from GitHub Actions artifacts.
# It handles the restoration of:
#   - Configuration files (~/.config/opencode/)
#   - Session data, messages, chats (~/.local/share/opencode/storage/)
#   - Project snapshots (~/.local/share/opencode/snapshot/)
#   - Authentication tokens (~/.local/share/opencode/auth.json)
#
# If the artifact is encrypted (session.enc exists), it will be decrypted
# using OPENCODE_SERVER_PASSWORD.
# ==============================================================================

set -euo pipefail

RESTORE_DIR="${RESTORE_DIR:-/tmp/opencode-restore}"
CONFIG_DIR="$HOME/.config/opencode"
SHARE_DIR="$HOME/.local/share/opencode"
ENCRYPTION_PASSWORD="${OPENCODE_SERVER_PASSWORD:-}"
PERSISTENCE_MODE="${PERSISTENCE_MODE:-artifact}"
R2_BUCKET_NAME="${R2_BUCKET_NAME:-}"

echo "=== OpenCode Session Restore ==="
echo "Restore directory: $RESTORE_DIR"
echo "Persistence Mode:  $PERSISTENCE_MODE"
echo "Config directory:  $CONFIG_DIR"
echo "Share directory:   $SHARE_DIR"
echo ""

# ------------------------------------------------------------------------------
# Handle Persistence Modes
# ------------------------------------------------------------------------------
if [ "$PERSISTENCE_MODE" = "none" ]; then
    echo "Persistence mode is 'none'. Exiting."
    exit 0
elif [ "$PERSISTENCE_MODE" = "r2" ]; then
    echo "=== R2 Restore ==="
    if [ -z "$R2_BUCKET_NAME" ]; then
        echo "ERROR: R2_BUCKET_NAME is not set."
        exit 1
    fi

    echo "Downloading session from R2 bucket: $R2_BUCKET_NAME"
    mkdir -p "$RESTORE_DIR"

    # Try downloading encrypted first, then fallback or check unencrypted
    if rclone copy "r2:$R2_BUCKET_NAME/session.enc" "$RESTORE_DIR/" 2>/dev/null; then
        echo "Download successful (Encrypted)."
    elif rclone copy "r2:$R2_BUCKET_NAME/session.tar.gz" "$RESTORE_DIR/" 2>/dev/null; then
        echo "Download successful (Unencrypted)."
    else
        echo "Warning: Download failed or session not found in R2."
    fi
fi

# ------------------------------------------------------------------------------
# Check for encrypted artifact and decrypt if needed
# ------------------------------------------------------------------------------
if [ -f "$RESTORE_DIR/session.enc" ]; then
    echo "=== Encrypted Artifact Detected ==="
    
    if [ -z "$ENCRYPTION_PASSWORD" ]; then
        echo "ERROR: Encrypted artifact found but OPENCODE_SERVER_PASSWORD is not set."
        echo "Cannot decrypt session data. Starting fresh."
        rm -rf "$RESTORE_DIR"
        exit 0
    fi
    
    echo "Decrypting session data..."
    TEMP_ARCHIVE="/tmp/opencode-session-data.tar.gz"
    
    if openssl enc -aes-256-cbc -d -salt -pbkdf2 -iter 100000 \
        -in "$RESTORE_DIR/session.enc" \
        -out "$TEMP_ARCHIVE" \
        -pass pass:"$ENCRYPTION_PASSWORD" 2>/dev/null; then
        
        rm -rf "$RESTORE_DIR"
        mkdir -p "$RESTORE_DIR"
        tar -xzf "$TEMP_ARCHIVE" -C "$RESTORE_DIR"
        rm -f "$TEMP_ARCHIVE"
        echo "Decryption successful."
    else
        echo "ERROR: Decryption failed. Password may be incorrect."
        echo "Starting fresh session."
        rm -rf "$RESTORE_DIR"
        rm -f "$TEMP_ARCHIVE"
        exit 0
    fi
    echo ""
elif [ -f "$RESTORE_DIR/session.tar.gz" ]; then
    echo "=== Unencrypted Archive Detected ==="
    echo "Extracting session data..."
    tar -xzf "$RESTORE_DIR/session.tar.gz" -C "$RESTORE_DIR"
    rm -f "$RESTORE_DIR/session.tar.gz"
    echo "Extraction successful."
    echo ""
fi

# ------------------------------------------------------------------------------
# Debug: Show what we're working with
# ------------------------------------------------------------------------------
echo "=== RESTORE DEBUG ==="
echo "Contents of $RESTORE_DIR:"
if [ -d "$RESTORE_DIR" ]; then
    ls -la "$RESTORE_DIR/" 2>/dev/null || echo "Directory exists but empty"
    echo ""
    echo "Full tree of restore directory:"
    find "$RESTORE_DIR" -type f 2>/dev/null | head -50 || echo "No files found"
else
    echo "Restore directory does not exist - fresh start"
    exit 0
fi
echo ""

# ------------------------------------------------------------------------------
# Create target directories
# ------------------------------------------------------------------------------
mkdir -p "$CONFIG_DIR"
mkdir -p "$SHARE_DIR"

# ------------------------------------------------------------------------------
# Restore configuration files
# ------------------------------------------------------------------------------
restore_config() {
    local src="$RESTORE_DIR/config"

    if [ -d "$src" ] && [ "$(ls -A "$src" 2>/dev/null)" ]; then
        echo "Restoring configuration files..."

        # Restore all config files except node_modules (will be reinstalled)
        find "$src" -maxdepth 1 -type f -exec cp -v {} "$CONFIG_DIR/" \; 2>/dev/null || true

        # Count restored files
        local count=$(find "$src" -maxdepth 1 -type f 2>/dev/null | wc -l)
        echo "Restored $count configuration file(s)"
    else
        echo "No configuration files to restore"
    fi
}

# ------------------------------------------------------------------------------
# Restore share data (sessions, messages, snapshots, etc.)
# ------------------------------------------------------------------------------
restore_share() {
    local src="$RESTORE_DIR/share"

    if [ -d "$src" ] && [ "$(ls -A "$src" 2>/dev/null)" ]; then
        echo "Restoring share data..."

        # Restore auth.json
        if [ -f "$src/auth.json" ]; then
            cp -v "$src/auth.json" "$SHARE_DIR/" 2>/dev/null || true
            echo "Authentication data restored"
        fi

        # Restore storage directory (sessions, messages, parts, projects)
        if [ -d "$src/storage" ]; then
            mkdir -p "$SHARE_DIR/storage"
            cp -rv "$src/storage/"* "$SHARE_DIR/storage/" 2>/dev/null || true
            local storage_count=$(find "$SHARE_DIR/storage" -type f 2>/dev/null | wc -l)
            echo "Storage data restored: $storage_count file(s)"
        fi

        # Restore snapshot directory (project snapshots)
        if [ -d "$src/snapshot" ]; then
            mkdir -p "$SHARE_DIR/snapshot"
            cp -rv "$src/snapshot/"* "$SHARE_DIR/snapshot/" 2>/dev/null || true
            local snapshot_count=$(find "$SHARE_DIR/snapshot" -type f 2>/dev/null | wc -l)
            echo "Snapshot data restored: $snapshot_count file(s)"
        fi

        # Restore log directory
        if [ -d "$src/log" ]; then
            mkdir -p "$SHARE_DIR/log"
            cp -rv "$src/log/"* "$SHARE_DIR/log/" 2>/dev/null || true
            echo "Log data restored"
        fi
    else
        echo "No share data to restore"
    fi
}

# ==============================================================================
# Main Restoration Process
# ==============================================================================

echo "=== Starting Restoration ==="

restore_config
echo ""

restore_share
echo ""

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------
echo "=== Restoration Summary ==="

echo "Config directory contents:"
ls -la "$CONFIG_DIR/" 2>/dev/null | head -10 || echo "Empty"
echo ""

echo "Share directory structure:"
if [ -d "$SHARE_DIR" ]; then
    du -sh "$SHARE_DIR"/* 2>/dev/null || echo "Empty"
fi
echo ""

# Count total restored items
config_files=$(find "$CONFIG_DIR" -maxdepth 1 -type f 2>/dev/null | wc -l)
share_files=$(find "$SHARE_DIR" -type f 2>/dev/null | wc -l)

echo "Total restored: $config_files config files, $share_files share files"
echo ""
echo "Session restoration complete!"
