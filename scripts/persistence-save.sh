#!/bin/bash
set -euo pipefail
SAVE_DIR="${SAVE_DIR:-/tmp/opencode-save}"
CONFIG_DIR="$HOME/.config/opencode"
SHARE_DIR="$HOME/.local/share/opencode"

rm -rf "$SAVE_DIR" && mkdir -p "$SAVE_DIR/config" "$SAVE_DIR/share"

# Copy configs (excluding node_modules)
if [ -d "$CONFIG_DIR" ]; then
    find "$CONFIG_DIR" -maxdepth 1 -type f -exec cp -v {} "$SAVE_DIR/config/" \;
fi

# Copy share data (auth, sessions, etc.)
if [ -d "$SHARE_DIR" ]; then
    [ -f "$SHARE_DIR/auth.json" ] && cp -v "$SHARE_DIR/auth.json" "$SAVE_DIR/share/"
    for dir in storage snapshot log; do
        if [ -d "$SHARE_DIR/$dir" ]; then
            mkdir -p "$SAVE_DIR/share/$dir"
            # Copy contents recursively, avoiding glob issues with empty dirs
            cp -r "$SHARE_DIR/$dir/." "$SAVE_DIR/share/$dir/" 2>/dev/null || true
        fi
    done
fi
