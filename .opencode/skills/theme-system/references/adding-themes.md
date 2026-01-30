---
title: Adding New Themes
---

# Adding New Themes

## 1. Create JSON Files

Create two files in `packages/ui/src/lib/theme/themes/`:
- `<id>-light.json`
- `<id>-dark.json`

## 2. Follow Theme Structure

```json
{
  "metadata": {
    "id": "mytheme-light",
    "name": "My Theme Light",
    "variant": "light",
    "tags": ["warm", "retro"]
  },
  "colors": {
    "primary": { "base": "#...", "hover": "#...", ... },
    "surface": { "background": "#...", "elevated": "#...", ... },
    "interactive": { "border": "#...", "hover": "#...", ... },
    "status": { "error": "#...", "warning": "#...", ... },
    "syntax": { "base": { "background": "#...", ... } }
  }
}
```

See `packages/ui/src/types/theme.ts` for full interface.

## 3. Register in presets.ts

```typescript
import mytheme_light_Raw from './mytheme-light.json';
import mytheme_dark_Raw from './mytheme-dark.json';

export const presetThemes: Theme[] = [
  // ... existing themes
  mytheme_light_Raw as Theme,
  mytheme_dark_Raw as Theme,
];
```

## 4. Validate

```bash
bun run type-check && bun run lint && bun run build
```

## Resources

- Theme types: `packages/ui/src/types/theme.ts`
- Presets: `packages/ui/src/lib/theme/themes/presets.ts`
- Example: `packages/ui/src/lib/theme/themes/flexoki-light.json`
