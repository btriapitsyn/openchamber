# Sidebar Vibrancy Blur on Restore – Investigation Log

**Status (2025-11-14):** *ABANDONED – macOS vibrancy feature removed from project. Not worth complexity vs. benefit.*

## Observed Behavior

1. On cold boot or when bringing the app to the foreground after minimizing, the left sidebar (Electron vibrancy surface) appears transparent for ~100–200 ms before the blur overlay renders.
2. Once React hydrates the sidebar, the blur works correctly (both dark/light themes).
3. The issue only affects the Electron build; the browser version doesn’t use native vibrancy and doesn’t exhibit the flash.

## Attempted Fixes

1. **Splash HTML overlay (FALLBACK_SPLASH_HTML)**  
   - Added blurred pseudo-element to `electron/main.ts` fallback.  
   - *Result:* Covers initial boot, but does not affect restore-from-minimize because the splash isn’t shown in that path.

2. **Delayed `BrowserWindow.show()` until renderer ready**  
   - Added `markRendererReady` IPC via preload and renderer.  
   - Window stays hidden until React mounts.  
   - *Result:* Cold boot flash resolved, but restoring from minimize still flashes once. Hiding the window during restore caused unacceptable UX (window appeared “gone”), so change reverted.

3. **Body-level fallback blur in renderer CSS**  
   - Added `body.sidebar-fallback-active::before` overlay and toggled the class on visibility changes.  
   - *Result:* No visible improvement; Electron still shows the old transparent frame briefly before the overlay attaches.

## Current Insight

Electron reuses the last compositor frame while restoring the window. Because the renderer hasn’t yet re-applied the vibrancy overlay (and CSS is momentarily suspended), the user sees the transparent window for a single frame before responsive layout kicks in. Pure renderer CSS/JS changes are apparently too slow to prevent that initial frame.

## Next Steps / Ideas

1. Investigate a hybrid approach:
   - On `BrowserWindow` `restore`, briefly hide the window, display a mini-splash (with blur), then show + focus once the renderer marks ready. Need to avoid the “window disappeared” UX by keeping the splash duration under ~120 ms and possibly including visual feedback.
2. Explore keeping a persistent `BrowserWindow` overlay (e.g., `BrowserView` or `childWindow`) that always renders the blur, and is only hidden after the main window is ready. This would avoid altering the main window visibility but still cover the restore path.
3. Consider lowering `backgroundColor` alpha (i.e., not fully transparent) so the OS draws a tinted sidebar even before React does. Might sacrifice exact vibrancy but could hide the flash.

## Attempted Solution (2025-11-14) - Pending Testing

### Approach: Pre-persistent Full-Window Blur Overlay with Inline Styles

**Problem identified:** Initial implementation failed because CSS depended on `.desktop-runtime` class added by JavaScript AFTER first compositor paint.

**Fix:** Inline styles in index.html that apply BEFORE any JavaScript execution.

**Key components:**

1. **index.html (lines 96-102):** Immediate Electron detection script
   - Sets `data-electron-runtime="true"` on `<html>` synchronously in head
   - Runs before any rendering, no timing dependency

2. **index.html (lines 153-178):** Inline overlay styles
   - Selector: `html[data-electron-runtime="true"] #vibrancy-restore-overlay`
   - Uses `--splash-background` variables (already defined inline)
   - `backdrop-filter: saturate(140%) blur(20px)` – full-window blur
   - `z-index: 10000` – above all content
   - `pointer-events: none` – doesn't block interaction
   - Theme-aware: light variant uses 85% opacity + saturate(135%)

3. **index.html (line 202):** Overlay div element
   - `<div id="vibrancy-restore-overlay">` before #root
   - Styled immediately via inline CSS (no class dependencies)

4. **src/main.tsx (lines 112-151):** Overlay lifecycle management
   - `hideRestoreOverlay()`: Adds `.hidden` class → fades out → removes from DOM
   - `showRestoreOverlay()`: Removes `.hidden` class → makes visible
   - visibilitychange handler manages show/hide on restore paths

5. **src/index.css (lines 341-366):** Fallback styles (kept for desktop-runtime class support)

**Why this should work:**
- Inline script + inline CSS = zero timing gaps
- No dependency on JavaScript-added classes
- Overlay visible immediately when Electron loads HTML
- Same blur values as existing vibrancy implementation

**Requires testing:**
- Cold boot flash elimination
- Minimize/restore flash elimination
- Workspace switch behavior
- Theme toggle behavior

## References

- **Implementation guide:** `docs/reports/electron-vibrancy-playbook.md` – contains the current renderer ↔ main handshake and styling instructions for vibrancy surfaces. Use this as the authoritative blueprint when revisiting the fix.
