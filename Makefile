.PHONY: package

package:
	bun install
	bun run --cwd packages/desktop build:sidecar
	bun run --cwd packages/desktop tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}' --bundles deb,rpm
