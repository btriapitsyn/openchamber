#!/bin/bash
set -euo pipefail

RESTORE_DIR="${RESTORE_DIR:-/tmp/opencode-restore}"
CONFIG_DIR="$HOME/.config/opencode"
SHARE_DIR="$HOME/.local/share/opencode"

mkdir -p "$CONFIG_DIR" "$SHARE_DIR"

if [ -d "$RESTORE_DIR" ]; then
    # Restore config files
    if [ -d "$RESTORE_DIR/config" ]; then
        find "$RESTORE_DIR/config" -maxdepth 1 -type f -exec cp -v {} "$CONFIG_DIR/" \; 2>/dev/null || true
    fi
    # Restore share data (auth, storage, snapshots)
    if [ -d "$RESTORE_DIR/share" ]; then
        [ -f "$RESTORE_DIR/share/auth.json" ] && cp -v "$RESTORE_DIR/share/auth.json" "$SHARE_DIR/"
        [ -d "$RESTORE_DIR/share/storage" ] && mkdir -p "$SHARE_DIR/storage" && cp -rv "$RESTORE_DIR/share/storage/"* "$SHARE_DIR/storage/" || true
        [ -d "$RESTORE_DIR/share/snapshot" ] && mkdir -p "$SHARE_DIR/snapshot" && cp -rv "$RESTORE_DIR/share/snapshot/"* "$SHARE_DIR/snapshot/" || true
    fi
fi
