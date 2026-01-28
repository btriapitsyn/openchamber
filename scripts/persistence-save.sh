#!/bin/bash
# ==============================================================================
# OpenCode Persistence Save Script
# ==============================================================================
# This script prepares all session data for artifact upload.
# It saves:
#   - Configuration files (~/.config/opencode/)
#   - Session data, messages, chats (~/.local/share/opencode/storage/)
#   - Project snapshots (~/.local/share/opencode/snapshot/)
#   - Authentication tokens (~/.local/share/opencode/auth.json)
#   - Logs (~/.local/share/opencode/log/)
#
# Excludes (to keep artifact size manageable):
#   - node_modules/ directories
#   - bin/ directory (will be reinstalled)
#   - tool-output/ (temporary tool outputs)
#
# If OPENCODE_SERVER_PASSWORD is set, the artifact will be encrypted.
# ==============================================================================

set -euo pipefail

SAVE_DIR="${SAVE_DIR:-/tmp/opencode-save}"
CONFIG_DIR="$HOME/.config/opencode"
SHARE_DIR="$HOME/.local/share/opencode"
ENCRYPTION_PASSWORD="${OPENCODE_SERVER_PASSWORD:-}"
PERSISTENCE_MODE="${PERSISTENCE_MODE:-artifact}"
R2_BUCKET_NAME="${R2_BUCKET_NAME:-}"

echo "=== OpenCode Session Save ==="
echo "Persistence Mode: $PERSISTENCE_MODE"
echo "Save directory:   $SAVE_DIR"
echo "Config directory: $CONFIG_DIR"
echo "Share directory:  $SHARE_DIR"

if [ "$PERSISTENCE_MODE" = "none" ]; then
    echo "Persistence mode is 'none'. Exiting."
    exit 0
fi

if [ -n "$ENCRYPTION_PASSWORD" ]; then
    echo "Encryption: ENABLED"
else
    echo "Encryption: DISABLED (set OPENCODE_SERVER_PASSWORD to enable)"
fi
echo ""

# ------------------------------------------------------------------------------
# Clean up and create save directory
# ------------------------------------------------------------------------------
rm -rf "$SAVE_DIR"
mkdir -p "$SAVE_DIR/config"
mkdir -p "$SAVE_DIR/share"

# ------------------------------------------------------------------------------
# Save configuration files
# ------------------------------------------------------------------------------
save_config() {
    echo "=== Saving Configuration Files ==="

    if [ -d "$CONFIG_DIR" ] && [ "$(ls -A "$CONFIG_DIR" 2>/dev/null)" ]; then
        # Save all config files (excluding node_modules)
        for item in "$CONFIG_DIR"/*; do
            if [ -e "$item" ]; then
                local basename=$(basename "$item")

                # Skip node_modules and bun.lock (will be reinstalled)
                if [ "$basename" = "node_modules" ] || [ "$basename" = "bun.lock" ]; then
                    echo "Skipping: $basename (will be reinstalled)"
                    continue
                fi

                # Copy file or directory
                if [ -f "$item" ]; then
                    cp -v "$item" "$SAVE_DIR/config/" 2>/dev/null || true
                fi
            fi
        done

        local count=$(find "$SAVE_DIR/config" -type f 2>/dev/null | wc -l)
        echo "Config files saved: $count"
    else
        echo "No config data to save"
    fi
}

# ------------------------------------------------------------------------------
# Save share data (sessions, messages, snapshots, auth)
# ------------------------------------------------------------------------------
save_share() {
    echo ""
    echo "=== Saving Share Data ==="

    if [ ! -d "$SHARE_DIR" ]; then
        echo "No share directory found"
        return
    fi

    # Save auth.json (authentication tokens - critical!)
    if [ -f "$SHARE_DIR/auth.json" ]; then
        cp -v "$SHARE_DIR/auth.json" "$SAVE_DIR/share/" 2>/dev/null || true
        echo "Auth data saved"
    fi

    # Save storage directory (sessions, messages, parts, projects)
    if [ -d "$SHARE_DIR/storage" ] && [ "$(ls -A "$SHARE_DIR/storage" 2>/dev/null)" ]; then
        echo "Saving storage data (sessions, messages, chats)..."
        mkdir -p "$SAVE_DIR/share/storage"

        # Copy all storage subdirectories
        for subdir in message migration part project session session_diff; do
            if [ -d "$SHARE_DIR/storage/$subdir" ]; then
                cp -r "$SHARE_DIR/storage/$subdir" "$SAVE_DIR/share/storage/" 2>/dev/null || true
            fi
        done

        local storage_count=$(find "$SAVE_DIR/share/storage" -type f 2>/dev/null | wc -l)
        echo "Storage files saved: $storage_count"
    fi

    # Save snapshot directory (project snapshots for undo/rollback)
    if [ -d "$SHARE_DIR/snapshot" ] && [ "$(ls -A "$SHARE_DIR/snapshot" 2>/dev/null)" ]; then
        echo "Saving snapshot data..."
        mkdir -p "$SAVE_DIR/share/snapshot"
        cp -r "$SHARE_DIR/snapshot/"* "$SAVE_DIR/share/snapshot/" 2>/dev/null || true

        local snapshot_count=$(find "$SAVE_DIR/share/snapshot" -type f 2>/dev/null | wc -l)
        echo "Snapshot files saved: $snapshot_count"
    fi

    # Save log directory (useful for debugging)
    if [ -d "$SHARE_DIR/log" ] && [ "$(ls -A "$SHARE_DIR/log" 2>/dev/null)" ]; then
        echo "Saving log data..."
        mkdir -p "$SAVE_DIR/share/log"
        cp -r "$SHARE_DIR/log/"* "$SAVE_DIR/share/log/" 2>/dev/null || true
        echo "Log files saved"
    fi
}

# ------------------------------------------------------------------------------
# Create manifest with metadata
# ------------------------------------------------------------------------------
create_manifest() {
    echo ""
    echo "=== Creating Manifest ==="

    local manifest="$SAVE_DIR/manifest.json"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local config_count=$(find "$SAVE_DIR/config" -type f 2>/dev/null | wc -l)
    local share_count=$(find "$SAVE_DIR/share" -type f 2>/dev/null | wc -l)
    local total_size=$(du -sh "$SAVE_DIR" 2>/dev/null | cut -f1)

    cat << EOF > "$manifest"
{
  "version": "2.0",
  "timestamp": "$timestamp",
  "hostname": "$(hostname)",
  "stats": {
    "config_files": $config_count,
    "share_files": $share_count,
    "total_size": "$total_size"
  },
  "contents": {
    "config": $([ -d "$SAVE_DIR/config" ] && ls "$SAVE_DIR/config" 2>/dev/null | jq -R -s -c 'split("\n") | map(select(length > 0))' || echo '[]'),
    "share": $([ -d "$SAVE_DIR/share" ] && ls "$SAVE_DIR/share" 2>/dev/null | jq -R -s -c 'split("\n") | map(select(length > 0))' || echo '[]')
  }
}
EOF

    echo "Manifest created: $manifest"
    cat "$manifest"
}

# ==============================================================================
# Main Save Process
# ==============================================================================

save_config
save_share
create_manifest

# ------------------------------------------------------------------------------
# Final Summary
# ------------------------------------------------------------------------------
echo ""
echo "=== Save Summary ==="

# Calculate totals
total_files=$(find "$SAVE_DIR" -type f 2>/dev/null | wc -l)
total_size=$(du -sh "$SAVE_DIR" 2>/dev/null | cut -f1)

echo "Save directory structure:"
if command -v tree &> /dev/null; then
    tree -L 2 "$SAVE_DIR" 2>/dev/null || ls -laR "$SAVE_DIR" | head -50
else
    ls -laR "$SAVE_DIR" | head -50
fi

echo ""
echo "Total files to upload: $total_files"
echo "Total size: $total_size"
echo ""

# Verify we have something to save
if [ "$total_files" -gt 1 ]; then
    echo "Session data prepared successfully for artifact upload!"
else
    echo "Warning: Minimal data to save. Creating placeholder..."
    echo "{\"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"status\": \"empty\"}" > "$SAVE_DIR/placeholder.json"
fi

# ------------------------------------------------------------------------------
# Optional Encryption (if OPENCODE_SERVER_PASSWORD is set)
# ------------------------------------------------------------------------------
if [ -n "$ENCRYPTION_PASSWORD" ]; then
    echo ""
    echo "=== Encrypting Session Data ==="
    
    TEMP_ARCHIVE="/tmp/opencode-session-data.tar.gz"
    ENCRYPTED_FILE="$SAVE_DIR.enc"
    
    tar -czf "$TEMP_ARCHIVE" -C "$SAVE_DIR" .
    
    openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
        -in "$TEMP_ARCHIVE" \
        -out "$ENCRYPTED_FILE" \
        -pass pass:"$ENCRYPTION_PASSWORD"
    
    rm -f "$TEMP_ARCHIVE"
    rm -rf "$SAVE_DIR"
    mkdir -p "$SAVE_DIR"
    mv "$ENCRYPTED_FILE" "$SAVE_DIR/session.enc"
    
    echo '{"encrypted": true, "algorithm": "aes-256-cbc", "kdf": "pbkdf2", "iterations": 100000}' > "$SAVE_DIR/manifest.json"
    
    echo "Encryption complete. Artifact is password-protected."
    echo "Encrypted file: $SAVE_DIR/session.enc"
else
    # For R2 mode without password, we need to create a single archive
    if [ "$PERSISTENCE_MODE" = "r2" ]; then
        echo ""
        echo "=== Archiving Session Data (Unencrypted) ==="
        TEMP_ARCHIVE="$SAVE_DIR/session.tar.gz"
        # Create archive of contents
        tar -czf "/tmp/session_temp.tar.gz" -C "$SAVE_DIR" .

        # Clean directory and move archive back
        rm -rf "$SAVE_DIR"/*
        mv "/tmp/session_temp.tar.gz" "$TEMP_ARCHIVE"

        echo "Archive created: $TEMP_ARCHIVE"
    fi
fi

echo ""
echo "Save location: $SAVE_DIR"

# ------------------------------------------------------------------------------
# R2 Upload Logic
# ------------------------------------------------------------------------------
if [ "$PERSISTENCE_MODE" = "r2" ]; then
    echo "=== R2 Upload ==="
    if [ -z "$R2_BUCKET_NAME" ]; then
        echo "ERROR: R2_BUCKET_NAME is not set."
        exit 1
    fi

    if [ -f "$SAVE_DIR/session.enc" ]; then
        FILE_TO_UPLOAD="session.enc"
    elif [ -f "$SAVE_DIR/session.tar.gz" ]; then
        FILE_TO_UPLOAD="session.tar.gz"
    else
        echo "ERROR: No session file (enc or tar.gz) found to upload."
        exit 1
    fi

    echo "Uploading $FILE_TO_UPLOAD to R2 bucket: $R2_BUCKET_NAME"
    if rclone copy "$SAVE_DIR/$FILE_TO_UPLOAD" "r2:$R2_BUCKET_NAME/"; then
        echo "Upload successful."
    else
        echo "ERROR: Upload failed."
        exit 1
    fi
else
    echo "Ready for artifact upload!"
fi
