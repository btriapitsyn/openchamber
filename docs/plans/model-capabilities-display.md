# Model Capabilities Display Enhancement

## Overview
Add visual indicators for model capabilities in the model selection dropdown and a detailed tooltip on the selected provider/model button.

## Data Source
- **API**: `https://models.dev/api.json`
- **Structure**: Organized by provider → models array
- **Fetch timing**: During `loadProviders()` in ConfigStore

## Model Capabilities Schema
```json
{
  "id": "model-id",
  "name": "Model Name",
  "tool_call": true,      // Tool calling support
  "reasoning": true,       // Reasoning capabilities
  "temperature": true,     // Temperature control
  "modalities": {
    "input": ["text", "image"],
    "output": ["text"]
  },
  "cost": {
    "input": 0.6,
    "output": 2.2,
    "cache_read": 0.11,
    "cache_write": 0
  },
  "limit": {
    "context": 204800,
    "output": 131072
  },
  "knowledge": "2025-04",
  "release_date": "2025-09-30"
}
```

## UI Changes

### 1. Model Dropdown Icons (Right-aligned)
Display capability icons to the right of each model name in the dropdown:

**Icons**:
- `<Wrench>` - tool_call support
- `<Brain>` - reasoning capabilities
- `<Image>` - image input support (modalities.input includes "image")

**Layout**:
```
GLM-4.5-Flash    🔧🧠
GLM-4.5          🔧
Claude Sonnet    🔧📷
```

### 2. Selected Model Tooltip
On hover (1500ms delay) over the provider/model button, show detailed tooltip with:

**Content**:
- Model name
- Capabilities: tool_call, reasoning, modalities
- Cost: input/output/cache_read/cache_write ($/1M tokens)
- Limits: context/output tokens (formatted: 200K, 1M, etc.)
- Knowledge cutoff (if available)
- Release date (if available)

**Tooltip Pattern** (from Header.tsx):
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    {/* Provider/Model button */}
  </TooltipTrigger>
  <TooltipContent>
    {/* Detailed model info */}
  </TooltipContent>
</Tooltip>
```

## Implementation Tasks

### 1. ConfigStore Enhancement
- Add `modelsMetadata` state: `Map<string, ModelMetadata>` (key: `${providerId}/${modelId}`)
- Fetch `https://models.dev/api.json` in `loadProviders()`
- Parse and store enriched model data alongside SDK models
- Type definition for ModelMetadata

### 2. ModelControls Component
- Import icons: `Wrench`, `Brain`, `Image` from lucide-react
- Add capability icons to dropdown menu items (right-aligned)
- Wrap provider/model button with Tooltip (delayDuration: 1500ms)
- Create detailed tooltip content component
- Use `getModelMetadata()` from ConfigStore

### 3. Utility Functions
- `formatTokens(tokens)` - format large numbers (200K, 1M, etc.)
- `formatCost(cost)` - format cost per 1M tokens
- `getCapabilityIcons(metadata)` - return array of icon components

## File Changes
- `src/stores/useConfigStore.ts` - Add models.dev API fetch and metadata storage
- `src/components/chat/ModelControls.tsx` - Add icons and tooltip
- `src/types/index.ts` - Add ModelMetadata type (if needed)

## Design Notes
- Icons should be small (h-3 w-3) and use muted colors
- Tooltip delay: 1500ms (1.5 seconds)
- Use existing Tooltip component from `@/components/ui/tooltip`
- Tooltip styling: consistent with Header.tsx connection status tooltip
- Handle API fetch errors gracefully (fallback to SDK data only)
