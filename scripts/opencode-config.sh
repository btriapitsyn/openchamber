#!/bin/bash
# ==============================================================================
# OpenCode Configuration Script
# ==============================================================================
# This script manages OpenCode configuration with intelligent detection of
# restored artifacts. If a config file exists from a previous session (restored
# via artifact), it will be preserved. Otherwise, a default config is generated.
# ==============================================================================

set -euo pipefail

CONFIG_DIR="$HOME/.config/opencode"
RESTORE_DIR="${RESTORE_DIR:-/tmp/opencode-restore}"

echo "=== OpenCode Configuration Setup ==="
echo "Config directory: $CONFIG_DIR"
echo "Restore directory: $RESTORE_DIR"

# Create config directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# ------------------------------------------------------------------------------
# Check for restored configuration (artifact preference)
# ------------------------------------------------------------------------------
check_restored_config() {
    local restored_config_json="$RESTORE_DIR/config/opencode.json"
    local restored_config_yml="$RESTORE_DIR/config/opencode.yml"
    local restored_config_yaml="$RESTORE_DIR/config/opencode.yaml"

    # Priority: .yml > .yaml > .json from artifacts
    if [ -f "$restored_config_yml" ]; then
        echo "Found restored opencode.yml from artifact - using it"
        cp -v "$restored_config_yml" "$CONFIG_DIR/opencode.yml"
        return 0
    elif [ -f "$restored_config_yaml" ]; then
        echo "Found restored opencode.yaml from artifact - using it"
        cp -v "$restored_config_yaml" "$CONFIG_DIR/opencode.yaml"
        return 0
    elif [ -f "$restored_config_json" ]; then
        echo "Found restored opencode.json from artifact - using it"
        cp -v "$restored_config_json" "$CONFIG_DIR/opencode.json"
        return 0
    fi

    return 1
}

# ------------------------------------------------------------------------------
# Check for existing configuration in config directory
# ------------------------------------------------------------------------------
check_existing_config() {
    if [ -f "$CONFIG_DIR/opencode.yml" ] || \
       [ -f "$CONFIG_DIR/opencode.yaml" ] || \
       [ -f "$CONFIG_DIR/opencode.json" ]; then
        echo "Existing configuration found in $CONFIG_DIR - keeping it"
        ls -la "$CONFIG_DIR"/opencode.* 2>/dev/null || true
        return 0
    fi
    return 1
}

# ------------------------------------------------------------------------------
# Generate default configuration
# ------------------------------------------------------------------------------
generate_default_config() {
    echo "Generating default OpenCode configuration..."

    cat << 'EOF' > "$CONFIG_DIR/opencode.json"
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-antigravity-auth@beta"],
  "provider": {
    "google": {
      "models": {
        "antigravity-gemini-3-pro": {
          "name": "Gemini 3 Pro (Antigravity)",
          "limit": { "context": 1048576, "output": 65535 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingLevel": "low" },
            "high": { "thinkingLevel": "high" }
          }
        },
        "antigravity-gemini-3-flash": {
          "name": "Gemini 3 Flash (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "minimal": { "thinkingLevel": "minimal" },
            "low": { "thinkingLevel": "low" },
            "medium": { "thinkingLevel": "medium" },
            "high": { "thinkingLevel": "high" }
          }
        },
        "antigravity-claude-sonnet-4-5": {
          "name": "Claude Sonnet 4.5 (no thinking) (Antigravity)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "antigravity-claude-sonnet-4-5-thinking": {
          "name": "Claude Sonnet 4.5 Thinking (Antigravity)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "antigravity-claude-opus-4-5-thinking": {
          "name": "Claude Opus 4.5 Thinking (Antigravity)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "gemini-2.5-flash": {
          "name": "Gemini 2.5 Flash (Gemini CLI)",
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "gemini-2.5-pro": {
          "name": "Gemini 2.5 Pro (Gemini CLI)",
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "gemini-3-flash-preview": {
          "name": "Gemini 3 Flash Preview (Gemini CLI)",
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "gemini-3-pro-preview": {
          "name": "Gemini 3 Pro Preview (Gemini CLI)",
          "limit": { "context": 1048576, "output": 65535 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        }
      }
    }
  }
}
EOF

    echo "Default configuration created at $CONFIG_DIR/opencode.json"
}

# ==============================================================================
# Main Logic
# ==============================================================================

# Step 1: Check if config was restored from artifact (highest priority)
if check_restored_config; then
    echo "Using restored configuration from artifact"
# Step 2: Check if config already exists (from previous run or manual setup)
elif check_existing_config; then
    echo "Using existing configuration"
# Step 3: No config found - generate default
else
    generate_default_config
fi

echo ""
echo "=== Configuration Summary ==="
echo "Active configuration files:"
ls -la "$CONFIG_DIR"/*.json "$CONFIG_DIR"/*.yml "$CONFIG_DIR"/*.yaml 2>/dev/null || echo "No config files found"
echo ""
echo "Configuration setup complete!"
