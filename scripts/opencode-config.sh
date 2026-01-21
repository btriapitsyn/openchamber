#!/bin/bash
set -euo pipefail
CONFIG_DIR="$HOME/.config/opencode"
RESTORE_DIR="${RESTORE_DIR:-/tmp/opencode-restore}"

mkdir -p "$CONFIG_DIR"

# Check for restored configuration in priority: .yml > .yaml > .json
if [ -f "$RESTORE_DIR/config/opencode.yml" ]; then
    cp -v "$RESTORE_DIR/config/opencode.yml" "$CONFIG_DIR/opencode.yml"
elif [ -f "$RESTORE_DIR/config/opencode.json" ]; then
    cp -v "$RESTORE_DIR/config/opencode.json" "$CONFIG_DIR/opencode.json"
else
    # Generate default configuration if none restored
    cat << 'EOF' > "$CONFIG_DIR/opencode.json"
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-antigravity-auth@beta"],
  "provider": { "google": { "models": { "gemini-3-flash-preview": { "name": "Gemini 3 Flash Preview" } } } }
}
EOF
fi
