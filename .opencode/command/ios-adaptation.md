---
description: Quick context guide for iOS PWA adaptation work
---

## Context Setup for iOS PWA Adaptation

### Required Reading:
1. **AGENTS.md** - Project overview and architecture
2. **IOS_ADAPTATION_GUIDE.md** - Complete implementation guide and research findings

### Current Task:
Working on iOS Safari 26+ PWA adaptations for OpenCode WebUI including:
- Custom PWA icons with iOS adaptive backgrounds
- Safe area handling for notch devices
- Dynamic browser chrome theming
- Home indicator blur gradient fixes

### Development Flow:
- You: analyze code, implement features, check syntax - do NOT run dev server
- Me: test changes on actual iOS devices using build:package workflow and provide feedback

### Key Implementation Areas:
- `/index.html` - PWA meta tags and icon links
- `/src/index.css` - iOS-specific CSS at end of file + global device detection variables
- `/src/lib/device.ts` - Global device detection system with TypeScript utilities
- `/src/stores/useUIStore.ts` - UI state including isMobile flag
- `/src/contexts/ThemeSystemContext.tsx` - Dynamic theme integration
- `/public/apple-touch-icon-*.png` - Custom icon assets
- Nginx config - Authentication bypass for public assets

### Testing Environment:
- Remote dev server with nginx auth
- iPad iOS 26 stable (working)
- iPhone iOS 26.1 beta (has known issues)

### Important Context:
- Safari iOS 26+ prioritizes CSS background-color over meta theme-color
- PWA icons must be publicly accessible (no auth barriers)
- iOS beta versions often have PWA bugs
- Use Ukrainian for communication, English for code

### Global Device Detection System (Available for all mobile/desktop features):

#### CSS Variables (automatically set):
```css
:root {
  --is-mobile: 0;        /* 1 on mobile ≤1024px, 0 on desktop */
  --device-type: 'desktop';  /* 'mobile' on mobile devices */
}
```

#### CSS Utility Classes:
- `.desktop-only` - shows only on desktop
- `.mobile-only` - shows only on mobile
- Media query breakpoint: 1024px (lg)

#### TypeScript/React Usage:
```typescript
// React components
import { useDeviceInfo } from '@/lib/device';
import { useUIStore } from '@/stores/useUIStore';

const { isMobile, deviceType, breakpoint } = useDeviceInfo(); // full info
const { isMobile } = useUIStore(); // simple boolean

// Utility functions
import { getDeviceInfo, isMobileDeviceViaCSS } from '@/lib/device';
```

#### For CSS-in-JS/Conditional Styling:
```css
.my-component {
  /* Use CSS variables for conditional styling */
  padding: calc(var(--is-mobile) * 8px + 16px); /* 24px mobile, 16px desktop */
}
```

Start by fully reading IOS_ADAPTATION_GUIDE.md for complete context, then ask what specific area needs work.

Remeber after each implementation of user request ask user if they are ready to redeploy. When User confirms run next command for use to be able to test: `opencode-webui stop; mise exec -- npm uninstall -g opencode-webui && npm run build:package && npm pack && mise exec -- npm install -g ./opencode-webui-1.0.0.tgz && opencode-webui --port 3001 --daemon`
