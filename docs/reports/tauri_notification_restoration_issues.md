# Investigation: macOS Notification Click Window Restoration

## Objective
Enable the OpenChamber Tauri desktop application to automatically restore its main window from a minimized or hidden state when a user clicks on a native desktop notification (e.g., "Assistant Ready").

## Current Architecture
- **Backend:** Rust (Tauri).
- **Frontend:** React/TypeScript.
- **Notifications:** Generated server-side in `packages/desktop/src-tauri/src/opencode/sse.rs` upon assistant task completion using `tauri-plugin-notification`.

## Implementation Attempts & Findings

### 1. RunEvent::Reopen Strategy
- **Approach:** Listened for `tauri::RunEvent::Reopen` in the main event loop.
- **Outcome:** Failed. This event is triggered by clicking the **Dock icon**, but NOT by clicking a standard notification on macOS.

### 2. Window Focus Strategy
- **Approach:** Listened for `RunEvent::WindowEvent { event: Focused(true), ... }`.
- **Outcome:** Unreliable. It triggers on *any* focus event. Since the window doesn't automatically gain focus on notification click (the core issue), this event is never triggered to start the restoration process.

### 3. Global `notification_clicked` Listener (Synchronous)
- **Approach:** Registered `app.listen("notification_clicked", ...)` in `main.rs` setup.
- **Outcome:** Failed. The event appears to not fire, or the synchronous window operations (`unminimize`, `set_focus`) were ignored by the OS.

### 4. Global `notification_clicked` Listener (Async with Delay)
- **Approach:** 
    - Used `tauri::async_runtime::spawn` inside the listener.
    - Explicitly checked `window.is_minimized()`.
    - Called `window.unminimize()` and `window.show()`.
    - Added `tokio::time::sleep(Duration::from_millis(100))` before `window.set_focus()` to accommodate macOS window animation timing.
- **Outcome:** Failed. The window remains minimized.

## Root Cause Analysis
The primary issue likely lies in one of two areas:
1.  **Event Emission:** The `tauri-plugin-notification` (v2.3.3) might not be emitting the `notification_clicked` event to the Rust backend for standard, non-actionable notifications on macOS. The plugin documentation implies "Actions" support is mobile-only, which might extend to click handling limitations on desktop.
2.  **OS Restrictions:** macOS has strict rules about applications stealing focus or moving to the foreground programmatically without direct user interaction (like a Dock click). If the OS doesn't consider the notification click as a "user activation" for the app, `set_focus` calls will be ignored.

## Next Steps for Resolution
- **Verify Event:** Use extreme debug logging to confirm if `notification_clicked` *ever* fires on macOS. If not, the plugin needs patching or we need a custom native implementation.
- **Native Delegate:** Implement a custom `NSUserNotificationCenterDelegate` in Rust (via `objc2`) to intercept the `userNotificationCenter:didActivateNotification:` selector directly, bypassing the plugin's limitations.
- **Plugin Upgrade/Replacement:** Check if newer versions of Tauri or the notification plugin offer better macOS desktop support.

## Proposed Native Delegate Solution
1. **Install objc2 + cocoa bindings:** Expose `NSUserNotificationCenter` and `NSApplication` types to Tauri's Rust side without dragging in Objective-C runtime code manually.
2. **Register a custom delegate during setup:** Inside `plugin::Builder::setup`, obtain the default notification center and set a delegate struct that implements `userNotificationCenter:didActivateNotification:`. Keep the delegate in a `OnceCell<Arc<_>>` so it lives for the entire app run.
3. **Bridge to the Tauri app handle:** When the delegate callback fires, capture the underlying notification payload (identifier / JSON data) and emit a Tauri event (e.g., `native_notification_clicked`) carrying that metadata so the UI can correlate which session finished.
4. **Restore the window on the main thread:** Within the callback, dispatch to the main thread, call `NSApp.activateIgnoringOtherApps(true)` to satisfy macOS' user-activation requirement, then locate the main Tauri window via `app_handle.get_window("main")` and call `unminimize()`, `show()`, and `set_focus()`.
5. **Fallback logic:** If the window no longer exists (closed) or the OS rejects activation, log explicitly and optionally re-show the Dock icon badge as a secondary cue.

This delegate path effectively bypasses `tauri-plugin-notification` limitations—macOS treats the delegate callback as a trusted activation, so calling `activateIgnoringOtherApps(true)` grants the focus needed for the subsequent window restoration calls to succeed.
