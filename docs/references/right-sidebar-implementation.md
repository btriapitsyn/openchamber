# Right Sidebar - Technical Reference

## Architecture

```
src/components/
  ├── layout/RightSidebar.tsx          # Tab container (400px, desktop-only)
  └── right-sidebar/
      ├── GitTab.tsx                   # Git operations (status, commit, push/pull)
      ├── DiffTab.tsx                  # Changed files list
      └── TerminalTab.tsx              # Terminal UI (placeholder)
src/lib/gitApi.ts                      # Git API client
src/stores/useUIStore.ts               # isRightSidebarOpen, rightSidebarActiveTab (persisted)
```

## Critical: Directory Binding

**Always use session directory, not global:**

```typescript
// ✅ CORRECT
const { currentSessionId, sessions } = useSessionStore();
const currentSession = sessions.find(s => s.id === currentSessionId);
const currentDirectory = (currentSession as any)?.directory;

// ❌ WRONG
const { currentDirectory } = useDirectoryStore();
```

## Tab Component Pattern

```typescript
export const YourTab: React.FC = () => {
  const { currentSessionId, sessions } = useSessionStore();
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const currentDirectory = (currentSession as any)?.directory;

  return (
    <div className="flex h-full flex-col">
      {/* Header - always rendered (no flicker) */}
      <div className="flex h-8 items-center gap-1 bg-background/95 px-1.5">
        <YourIcon size={14} />
        <span className="flex-1 text-xs">Title</span>
        <button disabled={!currentDirectory}>Action</button>
      </div>

      {/* Content - conditional inside */}
      <div className="flex-1 overflow-y-auto p-3">
        {!currentDirectory ? <EmptyState /> : <Content />}
      </div>
    </div>
  );
};
```

## Adding New Tab

1. Add type: `export type RightSidebarTab = 'git' | 'diff' | 'terminal' | 'newtab';`
2. Create `src/components/right-sidebar/NewTab.tsx` (follow pattern above)
3. Register in `RightSidebar.tsx`: `TAB_CONFIGS = [..., { id: 'newtab', label: 'New', icon: Icon }]`
4. Add switch case in `MainLayout.tsx`: `case 'newtab': return <NewTab />;`

## Git API

**Client**: `src/lib/gitApi.ts` - TypeScript wrappers for `/api/git/*` endpoints
**Server**: `server/index.js` (lines 1368-1725), uses `simple-git` library

Key functions (all take `directory: string`):
- `checkIsGitRepository()`
- `getGitStatus()` → `{ files, branch, ahead, behind, isClean }`
- `createGitCommit(directory, message, addAll)`
- `gitPush/gitPull/gitFetch(directory, options)`

## Terminal Implementation (TODO)

1. Server: `POST /api/terminal/execute` with `{ directory, command }`
2. Client: `src/lib/terminalApi.ts` wrapper
3. Update `TerminalTab.tsx` to call API, display output
4. Security: whitelist commands, timeout, output limit

## Common Mistakes

❌ Early return changes layout (causes flicker) → ✅ Conditional inside stable structure
❌ Forget `await loadGitData()` after operations → ✅ Always refresh UI
❌ Use global directory → ✅ Use session directory

## UI Guidelines

- Icons: `size={14}`
- Headers: `h-8`, `bg-background/95`, `text-xs`
- Active tab: `text-primary` with `weight="fill"` icon
- No border between tabs and header
- Mobile: completely hidden (`isMobile` check)

## Keyboard Shortcut

`Cmd+Shift+R` / `Ctrl+Shift+R` toggles sidebar (in `useKeyboardShortcuts.ts`)
