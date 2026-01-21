set -euo pipefail

RESTORE_DIR="${RESTORE_DIR:-/tmp/opencode-restore}"
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

mkdir -p "$CONFIG_DIR" "$SHARE_DIR"

if [ -d "$RESTORE_DIR" ]; then
    if [ -n "$PASSWORD" ] && [ -f "$RESTORE_DIR/$ENCRYPTED_NAME" ]; then
        openssl enc -d -aes-256-cbc -pbkdf2 \
            -pass env:OPENCHAMBER_UI_PASSWORD \
            -in "$RESTORE_DIR/$ENCRYPTED_NAME" \
            -out "$STAGING_DIR/$ARCHIVE_NAME"
        tar -xzf "$STAGING_DIR/$ARCHIVE_NAME" -C "$STAGING_DIR"
    elif [ -d "$RESTORE_DIR/config" ] || [ -d "$RESTORE_DIR/share" ]; then
        cp -r "$RESTORE_DIR/." "$STAGING_DIR/"
    else
        exit 0
    fi

    # Restore config files
    if [ -d "$STAGING_DIR/config" ]; then
        find "$STAGING_DIR/config" -maxdepth 1 -type f -exec cp -v {} "$CONFIG_DIR/" \; 2>/dev/null || true
    fi
    # Restore share data (auth, storage, snapshots)
    if [ -d "$STAGING_DIR/share" ]; then
        [ -f "$STAGING_DIR/share/auth.json" ] && cp -v "$STAGING_DIR/share/auth.json" "$SHARE_DIR/"
        [ -d "$STAGING_DIR/share/storage" ] && mkdir -p "$SHARE_DIR/storage" && cp -rv "$STAGING_DIR/share/storage/"* "$SHARE_DIR/storage/" || true
        [ -d "$STAGING_DIR/share/snapshot" ] && mkdir -p "$SHARE_DIR/snapshot" && cp -rv "$STAGING_DIR/share/snapshot/"* "$SHARE_DIR/snapshot/" || true
    fi
fi
