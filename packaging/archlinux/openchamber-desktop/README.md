# Arch Linux packaging skeleton for OpenChamber Desktop

This directory is a source-built Arch packaging starting point for the OpenChamber desktop app. It is intentionally limited to an **unofficial / experimental** `x86_64` `PKGBUILD` skeleton plus a matching `.desktop` template, and it is currently aimed at building the `gqcdm/openchamber` `i18n` branch rather than a tagged release tarball.

## What this skeleton reflects

- Package name defaults to `openchamber-desktop`
- Source strategy targets the `gqcdm/openchamber` `i18n` branch archive (`refs/heads/i18n`) instead of `refs/tags/v...`
- Build flow follows the repository's desktop entrypoint: `bun run desktop:build`
- That root script currently expands to:
  - `packages/desktop/scripts/build-sidecar.mjs`
  - `bun run --cwd packages/desktop tauri build`
- Sidecar build produces a platform-specific `openchamber-server-<target-triple>` binary and copies `packages/web/dist` into Tauri resources
- Tauri config bundles both:
  - `sidecars/openchamber-server`
  - `resources/web-dist/**/*`

## Important assumptions

- Linux desktop support is **not official upstream support** today; upstream docs and release messaging are still macOS-first
- This packaging target is intentionally branch-oriented for the current `gqcdm/openchamber` `i18n` work rather than release-oriented version packaging
- The OpenChamber desktop app still has an external runtime prerequisite: **`opencode` must be installed separately**
- The `PKGBUILD` currently assumes a Linux AppDir-style output path from Tauri during `package()`
- Dependency lists are best-effort placeholders derived from the repo's Tauri/Bun/Rust build context and likely need tightening after a real Arch build

## What still needs verification later

1. Confirm the exact Linux bundle output path emitted by `tauri build` on Arch
2. Confirm whether the final installed binary path inside the bundle matches `/usr/lib/openchamber-desktop/openchamber-desktop`
3. Validate the icon extraction/install path on Linux
4. Refine `depends`, `makedepends`, and any required system libraries after an actual build in a clean Arch environment
5. Decide whether packaging should install the full AppDir contents or a more selective layout

## Why the `PKGBUILD` is still useful now

It gives the orchestrator a repo-native packaging base that already captures the correct desktop build sequence, targets the `gqcdm/openchamber` `i18n` branch source model explicitly, names the Linux target triple (`x86_64-unknown-linux-gnu`), and keeps the unsupported / experimental Linux status visible instead of implying that this is a finished official package.
