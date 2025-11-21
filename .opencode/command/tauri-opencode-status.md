Notification Click-to-Open - macOS Limitation:
- Investigated `tauri-plugin-notification` on macOS.
- Confirmed that there is no direct Rust-side click handler for native desktop notifications.
- The `RunEvent::Reopen` handler was removed as it doesn't reliably trigger from notification clicks.
- App re-opening from minimized state on notification click will rely on default macOS behavior.
- Dock icon clicks should still re-open the window.
- Verification: `pnpm -r build` passed.