# Progressive Tool Header Display

## Overview

Replace the current "all tools appear at once" model with a progressive header display that shows one tool header at a time, evolving into a summary when all tools complete.

## Current Behavior

- All tools hidden during execution
- All completed tools appear simultaneously when finished
- Each tool individually expandable/collapsible
- Multiple tool headers visible at once

## Proposed Behavior

### Execution Phase
- **No display**: Tools remain hidden during execution (unchanged)
- **No live updates**: Still only show completed tools (unchanged)

### Progressive Display Phase
When tools complete, show only the most recently completed tool:

**First tool completes:**
```
▶ bash: npm install          1.2s
```

**Second tool completes:**
```
▶ edit: package.json         +5/-2  0.8s
```

**Third tool completes:**
```
▶ read: src/config.ts        0.3s
```

### Summary Phase
When all tools are complete and assistant response begins:

**Collapsed summary:**
```
▶ 3 tools completed • 2.3s
```

**Expanded summary:**
```
▼ 3 tools completed • 2.3s
✅ bash: npm install          1.2s
✅ edit: package.json         +5/-2  0.8s  
✅ read: src/config.ts        0.3s
```

## UI/UX Requirements

### Header Styling
- **Consistent appearance**: Summary header must look identical to individual tool headers
- **Same typography**: Use existing `typography-meta` and spacing
- **Same icons**: Chevron right/down for collapsed/expanded states
- **Same hover behavior**: Identical cursor and hover transitions

### Header Content Evolution
1. **Individual tool**: `[icon] tool: description          duration`
2. **Summary**: `[icon] N tools completed • total_duration`

### Expansion Behavior
- **Always collapsed**: Headers never auto-expand
- **Manual control**: Only user clicks expand content
- **Summary only**: Only the final summary is expandable
- **Individual tools**: Remain collapsed during progressive phase

### Visual Layout
- **No indentation**: Expanded summary items use same layout as regular tools
- **No tabs/spacing**: Don't add extra visual hierarchy in expanded state
- **Consistent spacing**: Use existing `my-1` margins between items

## Interaction Model

### Progressive Phase
- **Single header**: Only one tool header visible at any time
- **Content replacement**: Header content updates when new tool completes
- **No expansion**: Individual tool headers are not expandable during this phase

### Summary Phase
- **Summary header**: Replaces individual tool header
- **Expandable**: User can click to see all completed tools
- **Complete list**: Shows all tools with completion status and durations

## State Management

### Header States
1. **Hidden**: No tools completed yet
2. **Individual**: Showing most recent completed tool
3. **Summary**: Showing completed tools count and total duration

### Expansion States
- **Collapsed**: Default state for all phases
- **Expanded**: Only available for summary phase

## Visual Examples

### Mobile vs Desktop
- **Same behavior**: Progressive display works identically on mobile
- **Text truncation**: Use existing mobile truncation logic for long descriptions
- **Touch targets**: Maintain existing touch-friendly header heights

### Error Handling
- **Error tools**: Display in summary with error styling (red theme colors)
- **Mixed success/failure**: Summary shows total count regardless of status
- **Individual errors**: Error tools appear in progressive phase like normal tools

## Success Criteria

- [ ] Only one tool header visible during progressive phase
- [ ] Header content updates smoothly when new tools complete
- [ ] Summary header visually identical to tool headers
- [ ] Expanded summary uses same layout as individual tools
- [ ] No auto-expansion at any phase
- [ ] Smooth transition from progressive to summary phase
- [ ] Consistent behavior across mobile/desktop

## Edge Cases

### Single Tool
- Progressive phase shows the single tool
- Summary phase shows "1 tool completed • X.Xs"

### No Tools
- No header display (unchanged behavior)

### Rapid Tool Completion
- Header updates should handle quick succession gracefully
- No visual glitches during fast transitions

### Long-Running Tools
- Progressive display works regardless of completion timing
- No assumptions about tool execution order