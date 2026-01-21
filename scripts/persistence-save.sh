set -euo pipefail
SAVE_DIR="${SAVE_DIR:-/tmp/opencode-save}"
CONFIG_DIR="$HOME/.config/opencode"
SHARE_DIR="$HOME/.local/share/opencode"
PASSWORD="${OPENCHAMBER_UI_PASSWORD:-}"
ARCHIVE_NAME="session.tar.gz"
ENCRYPTED_NAME="session.tar.gz.enc"

STAGING_DIR="$(mktemp -d)"
cleanup() {
    rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

rm -rf "$SAVE_DIR" && mkdir -p "$SAVE_DIR"
mkdir -p "$STAGING_DIR/config" "$STAGING_DIR/share"

# Copy configs (excluding node_modules)
if [ -d "$CONFIG_DIR" ]; then
    find "$CONFIG_DIR" -maxdepth 1 -type f -exec cp -v {} "$STAGING_DIR/config/" \;
fi

# Copy share data (auth, sessions, etc.)
if [ -d "$SHARE_DIR" ]; then
    [ -f "$SHARE_DIR/auth.json" ] && cp -v "$SHARE_DIR/auth.json" "$STAGING_DIR/share/"
    for dir in storage snapshot; do
        if [ -d "$SHARE_DIR/$dir" ]; then
            mkdir -p "$STAGING_DIR/share/$dir"
            # Copy contents recursively, avoiding glob issues with empty dirs
            cp -r "$SHARE_DIR/$dir/." "$STAGING_DIR/share/$dir/" 2>/dev/null || true
        fi
    done
fi

if [ -n "$PASSWORD" ]; then
    tar -czf "$SAVE_DIR/$ARCHIVE_NAME" -C "$STAGING_DIR" .
    openssl enc -aes-256-cbc -pbkdf2 -salt \
        -pass env:OPENCHAMBER_UI_PASSWORD \
        -in "$SAVE_DIR/$ARCHIVE_NAME" \
        -out "$SAVE_DIR/$ENCRYPTED_NAME"
    rm -f "$SAVE_DIR/$ARCHIVE_NAME"
else
    cp -r "$STAGING_DIR/." "$SAVE_DIR/"
fi
