# OpenChamber Mobile

Mobile app for OpenChamber that connects to remote sessions via QR code scanning.

**IMPORTANT: This app only works with Cloudflare Tunnel.** You must run OpenChamber with the `--try-cf-tunnel` flag to generate the HTTPS URL that this app connects to.

## How It Works

1. On your desktop, run OpenChamber with Cloudflare Tunnel:
   ```bash
   openchamber --try-cf-tunnel --tunnel-qr
   ```

2. A QR code appears in your terminal with a `https://*.trycloudflare.com` URL

3. Open the mobile app and scan the QR code

4. You're now connected to your desktop OpenChamber session

All connections are HTTPS only via Cloudflare Tunnel - no local network or HTTP connections.

## Setup

```bash
# Install dependencies
bun install

# Build
bun run mobile:build

# Add platforms
cd packages/mobile
bunx cap add ios
bunx cap add android

# Sync
bunx cap sync

# Open in Xcode/Android Studio
bunx cap open ios
bunx cap open android
```

## iOS Camera Permission

Add to `ios/App/App/Info.plist`:
```xml
<key>NSCameraUsageDescription</key>
<string>Camera access needed to scan QR codes</string>
```

## Password Protection

For password-protected sessions:
```bash
openchamber --try-cf-tunnel --tunnel-qr --tunnel-password-url --ui-password mysecret
```

The password is embedded in the QR code URL.
