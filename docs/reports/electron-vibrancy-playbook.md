# Electron Vibrancy Playbook

Step–by–step instructions for adding macOS-style vibrancy to any OpenChamber surface (the left sidebar is the reference implementation). Follow these instructions exactly; they assume no additional context beyond this document.

---

## 1. Prerequisites

1. **Electron window supports vibrancy**  
   `electron/main.ts` already creates a transparent window and calls `mainWindow.setVibrancy("sidebar")`. No changes required unless you want a different global material.

2. **Desktop runtime detection**  
   The renderer exposes `window.opencodeDesktop`. Use it to gate vibrancy-only behavior so the web build stays opaque.

3. **CSS helpers already in place**  
   `src/index.css` contains the shared vibrancy styles. You will extend this file whenever you add a new surface.

---

## 2. Renderer Component Changes

For any component that should become vibrant:

1. **Wrap the area in a container `div` or similar** if it doesn’t already exist (example: `<aside>` in `src/components/layout/Sidebar.tsx`).
2. **Add a `data-vibrancy-surface="<name>"` attribute** to that container. Choose a unique surface name (e.g., `command-palette`, `left-rail`). The attribute is how the CSS hook finds the element.
   ```tsx
   <div
     data-vibrancy-surface="command-palette"
     className={cn('your classes', isDesktop ? 'bg-transparent' : 'bg-sidebar')}
   >
     …
   </div>
   ```
3. **Keep the children wrapped in an inner container** so you can apply padding/background overrides separately if needed.
4. **Switch to transparent backgrounds in desktop mode.** Use the `window.opencodeDesktop` check (or a hook such as `useDeviceInfo`) to conditionally remove `bg-*` classes when running inside Electron. Web builds keep their original background color.
5. **Remove borders that collide with vibrancy.** The macOS blur renders its own edge; keep the standard border only for the web build.

---

## 3. CSS Layer

1. Open `src/index.css`.
2. Locate the existing vibrancy block (`:root.desktop-runtime [data-vibrancy-surface='sidebar']…`).
3. Copy that pattern and create a new block that targets your surface name:
   ```css
   :root.desktop-runtime [data-vibrancy-surface='command-palette'] {
     position: relative;
     background-color: transparent !important;
   }

   :root.desktop-runtime [data-vibrancy-surface='command-palette']::before {
     content: "";
     position: absolute;
     inset: 0;
     pointer-events: none;
     background: color-mix(in srgb, var(--surface-background) 55%, transparent);
     backdrop-filter: saturate(140%) blur(20px);
     -webkit-backdrop-filter: saturate(140%) blur(20px);
     z-index: 0;
   }

   :root.desktop-runtime [data-vibrancy-surface='command-palette'] > * {
     position: relative;
     z-index: 1;
   }
   ```
4. **Theme-specific tweaks:**  
   If you need different light/dark settings, add a `:root.desktop-runtime.light …` variant just like the sidebar block.
5. **Opacity sources:**  
   Prefer `var(--surface-background)` (full app surface) for light vibrancy. For darker panels you can `color-mix` against `transparent` with 40–70% weights.

---

## 4. Interaction With Theme System

No ThemeProvider changes are required as long as you reuse existing CSS variables:

- For a background tint, use `var(--surface-background)` or `var(--sidebar-base)`.
- For text colors, keep existing classes; the inner content stays opaque unless you explicitly change it.
- Remember: the ThemeSystemProvider already keeps `document.body` transparent in desktop mode.

---

## 5. Testing Checklist

1. Run `npm run dev:electron` (or `npm run start:electron` for production) and confirm:
   - The target element is translucent.
   - The web build (`npm run dev`) still renders the original opaque background.
2. Toggle between light/dark themes and verify the tint adjusts correctly.
3. Ensure borders/shadows still look intentional. If you still see a hard divider, verify that the non-desktop border classes are wrapped in `!isDesktop`.

---

## 6. Common Pitfalls

- **Forgetting `data-vibrancy-surface`:** Without it, the CSS overlay never attaches.
- **Leaving `bg-*` classes active:** The blur hides behind an opaque Tailwind background; make the container transparent in desktop mode.
- **Missing `-webkit-backdrop-filter`:** Chromium sometimes ignores `backdrop-filter` without the vendor prefix.
- **Overlapping borders:** Remove `border-r`/`border-l` on vibrant containers in desktop mode; macOS adds its own edge highlight.
- **Event stream bridge not running:** If you create an entirely new desktop-only window, ensure `startEventBridge` in `electron/main.ts` gets called (the current implementation handles this automatically for the main window).

---

Following this checklist will recreate the sidebar behavior for any additional surface with zero guesswork. Document any component-specific variations directly in the file you modify, but keep this playbook as the authoritative reference.***
