# Multi-Section Navigation Architecture

## Overview

OpenChamber implements a modular multi-section navigation system where each section (sessions, agents, commands, providers, settings) has its own isolated sidebar and page content.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      MainLayout                          │
├──────────┬────────────────────┬─────────────────────────┤
│          │                    │                          │
│   Nav    │     Sidebar        │      Main Content        │
│   Bar    │    (264px)         │      (flex-1)            │
│  (56px)  │                    │                          │
│          │  ┌──────────────┐  │  ┌──────────────────┐   │
│  [📱]    │  │ SessionList  │  │  │  ChatContainer   │   │
│  [🤖] ✓  │  │              │  │  │                  │   │
│  [⌘]     │  │ - Session 1  │  │  │  [User message]  │   │
│  [🌐]    │  │ - Session 2  │  │  │  [AI response]   │   │
│  [⚙️]    │  │ - Session 3  │  │  │                  │   │
│          │  └──────────────┘  │  └──────────────────┘   │
└──────────┴────────────────────┴─────────────────────────┘
```

## Directory Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── MainLayout.tsx           # Main router & composition (146 lines)
│   │   ├── NavigationBar.tsx        # Left icon navigation (78 lines)
│   │   ├── Sidebar.tsx              # Collapsible sidebar wrapper (36 lines)
│   │   └── Header.tsx               # Top header with context info
│   │
│   └── sections/                    # ← All section modules here
│       ├── SectionPlaceholder.tsx   # Shared placeholder component
│       │
│       ├── sessions/
│       │   ├── SessionsSidebar.tsx  # Wraps SessionList
│       │   └── SessionsPage.tsx     # Wraps ChatContainer
│       │
│       ├── agents/
│       │   ├── AgentsSidebar.tsx    # Agent list/search
│       │   └── AgentsPage.tsx       # Agent config/prompts
│       │
│       ├── commands/
│       │   ├── CommandsSidebar.tsx  # Command list
│       │   └── CommandsPage.tsx     # Command editor
│       │
│       ├── providers/
│       │   ├── ProvidersSidebar.tsx # Provider list
│       │   └── ProvidersPage.tsx    # Provider config
│       │
│       └── settings/
│           ├── SettingsSidebar.tsx  # Settings navigation
│           └── SettingsPage.tsx     # Settings panels
│
├── constants/
│   └── sidebar.ts                   # Section definitions & icons
│
└── stores/
    └── useUIStore.ts                # sidebarSection state
```

## Component Responsibilities

### MainLayout (src/components/layout/MainLayout.tsx)

**Purpose:** Composition & routing only - NO UI implementation details.

**Responsibilities:**
- Device detection (mobile/desktop)
- Render NavigationBar (desktop always visible, mobile in overlay)
- Render Sidebar wrapper with current section content
- Route main content based on active section
- Handle mobile overlay & backdrop

**Key Code:**
```typescript
const sidebarContent = React.useMemo(() => {
    switch (sidebarSection) {
        case 'sessions': return <SessionsSidebar />;
        case 'agents': return <AgentsSidebar />;
        // ...
    }
}, [sidebarSection]);

const mainContent = React.useMemo(() => {
    switch (sidebarSection) {
        case 'sessions': return <SessionsPage />;
        case 'agents': return <AgentsPage />;
        // ...
    }
}, [sidebarSection]);
```

### NavigationBar (src/components/layout/NavigationBar.tsx)

**Purpose:** Vertical icon navigation for switching sections.

**Props:**
- `activeSection` - current active section ID
- `onSectionChange` - callback when user clicks section
- `isMobile` - mobile styling variant
- `showCloseButton` - show X button (mobile only)
- `onClose` - close callback (mobile only)

**Constants:**
```typescript
export const NAV_BAR_WIDTH = 56; // Fixed width in pixels
```

### Sidebar (src/components/layout/Sidebar.tsx)

**Purpose:** Animated wrapper for sidebar content - handles collapse/expand.

**Props:**
- `isOpen` - sidebar visibility state
- `isMobile` - mobile variant (returns null, handled in MainLayout)
- `children` - section sidebar content

**Constants:**
```typescript
export const SIDEBAR_CONTENT_WIDTH = 264; // Fixed width in pixels
```

**Animation:**
- Width animates from 264px → 0px
- Uses CSS transitions (300ms ease-in-out)
- Fixed width container prevents content overflow

### Section Components (src/components/sections/*)

Each section has two components:

#### `<Section>Sidebar.tsx`

**Purpose:** Left panel content for the section (264px width).

**Examples:**
- `SessionsSidebar` - list of chat sessions + directory picker
- `AgentsSidebar` - list of available agents + search/filter
- `CommandsSidebar` - list of slash commands + categories
- `ProvidersSidebar` - list of providers/models + status
- `SettingsSidebar` - settings navigation menu

**Guidelines:**
- Must fit within 264px width
- Should have scrollable area for long lists
- Can be completely custom or use placeholder

#### `<Section>Page.tsx`

**Purpose:** Main content area for the section (flex-1, takes remaining space).

**Examples:**
- `SessionsPage` - chat interface (ChatContainer)
- `AgentsPage` - agent configuration panel
- `CommandsPage` - command editor
- `ProvidersPage` - provider credentials & model selection
- `SettingsPage` - settings forms/panels

**Guidelines:**
- Fills remaining horizontal space
- Should handle responsive sizing
- Can be completely custom or use placeholder

## State Management

### UIStore (src/stores/useUIStore.ts)

```typescript
interface UIStore {
    sidebarSection: SidebarSection;        // Current active section
    setSidebarSection: (section) => void;  // Switch section
    isSidebarOpen: boolean;                // Sidebar visibility
    setSidebarOpen: (open) => void;        // Toggle sidebar
    isMobile: boolean;                     // Device type
    // ...
}
```

**Persistence:**
- `sidebarSection` persists to localStorage
- `isSidebarOpen` persists to localStorage
- Restored on app reload

### Section Definitions (src/constants/sidebar.ts)

```typescript
export type SidebarSection = 'sessions' | 'agents' | 'commands' | 'providers' | 'settings';

export const SIDEBAR_SECTIONS: SidebarSectionConfig[] = [
    {
        id: 'sessions',
        label: 'Sessions',
        description: 'Browse and manage chat sessions scoped to the current directory.',
        icon: MessagesSquare,
    },
    // ... other sections
];
```

## Desktop vs Mobile Behavior

### Desktop (≥1024px)

```
┌──────┬──────────┬────────────────────┐
│ Nav  │ Sidebar  │   Main Content     │
│ Bar  │ (toggle) │                    │
│      │          │                    │
│ [📱] │ Content  │   Page Content     │
│ [🤖] │          │                    │
│ [⌘]  │          │                    │
│ [🌐] │          │                    │
│ [⚙️] │          │                    │
└──────┴──────────┴────────────────────┘
  56px    264px         flex-1
```

**Behavior:**
- Navigation bar always visible (56px)
- Sidebar collapses to 0px when closed
- Sidebar toggle button in Header
- Clicking section icon switches both sidebar + page content

### Mobile (<1024px)

**Sidebar Closed:**
```
┌────────────────────────────────────┐
│           Header                   │
├────────────────────────────────────┤
│                                    │
│       Main Content                 │
│       (Full Width)                 │
│                                    │
└────────────────────────────────────┘
```

**Sidebar Open:**
```
┌──────┬─────────────────┐
│      │                 │
│ Nav  │   Sidebar       │  ← Fullscreen Overlay
│ Bar  │   Content       │
│      │                 │
│ [X]  │ - Item 1        │
│ [📱] │ - Item 2        │
│ [🤖] │ - Item 3        │
│ [⌘]  │                 │
└──────┴─────────────────┘
```

**Behavior:**
- Hamburger menu in Header opens fullscreen overlay
- Nav bar + Sidebar rendered together in overlay
- Backdrop click closes overlay
- Selecting item (e.g., session) auto-closes overlay
- Switching sections updates sidebar content in overlay

## Adding New Section Content

### Example: Adding Agent Management to AgentsSidebar

**File:** `src/components/sections/agents/AgentsSidebar.tsx`

**Before (placeholder):**
```typescript
import React from 'react';
import { SectionPlaceholder } from '../SectionPlaceholder';

export const AgentsSidebar: React.FC = () => {
    return <SectionPlaceholder sectionId="agents" variant="sidebar" />;
};
```

**After (with agent list):**
```typescript
import React from 'react';
import { useConfigStore } from '@/stores/useConfigStore';
import { Button } from '@/components/ui/button';
import { Plus } from '@phosphor-icons/react';

export const AgentsSidebar: React.FC = () => {
    const { agents } = useConfigStore();
    const [selectedAgent, setSelectedAgent] = React.useState<string | null>(null);

    return (
        <div className="flex h-full flex-col bg-sidebar">
            {/* Header */}
            <div className="border-b border-border/40 px-3 py-3">
                <div className="flex items-center justify-between">
                    <h2 className="typography-ui-label font-semibold text-foreground">
                        Agents
                    </h2>
                    <span className="typography-meta text-muted-foreground">
                        {agents.length} total
                    </span>
                </div>
                <Button className="mt-2 w-full" variant="ghost">
                    <Plus className="h-4 w-4" weight="bold" />
                    <span className="typography-ui-label">New Agent</span>
                </Button>
            </div>

            {/* Agent List */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
                {agents.map((agent) => (
                    <button
                        key={agent.id}
                        onClick={() => setSelectedAgent(agent.id)}
                        className={cn(
                            'w-full rounded-lg px-2 py-1.5 text-left transition-colors',
                            selectedAgent === agent.id
                                ? 'bg-sidebar-accent'
                                : 'hover:bg-sidebar-accent/50'
                        )}
                    >
                        <div className="typography-ui-header font-medium">
                            {agent.name}
                        </div>
                        <div className="typography-meta text-muted-foreground">
                            {agent.provider} · {agent.model}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};
```

### Example: Adding Agent Config to AgentsPage

**File:** `src/components/sections/agents/AgentsPage.tsx`

**Before (placeholder):**
```typescript
import React from 'react';
import { SectionPlaceholder } from '../SectionPlaceholder';

export const AgentsPage: React.FC = () => {
    return <SectionPlaceholder sectionId="agents" variant="page" />;
};
```

**After (with agent configuration):**
```typescript
import React from 'react';
import { useConfigStore } from '@/stores/useConfigStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const AgentsPage: React.FC = () => {
    const { agents, updateAgent } = useConfigStore();
    const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);

    const selectedAgent = agents.find((a) => a.id === selectedAgentId);

    if (!selectedAgent) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="typography-body text-muted-foreground">
                    Select an agent from the sidebar
                </p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="mx-auto max-w-2xl space-y-6">
                <div>
                    <h1 className="typography-h1 font-semibold">
                        {selectedAgent.name}
                    </h1>
                    <p className="typography-body text-muted-foreground">
                        Configure agent behavior and prompts
                    </p>
                </div>

                <div className="space-y-4">
                    <div>
                        <Label htmlFor="agent-name">Agent Name</Label>
                        <Input
                            id="agent-name"
                            value={selectedAgent.name}
                            onChange={(e) => updateAgent(selectedAgent.id, { name: e.target.value })}
                        />
                    </div>

                    <div>
                        <Label htmlFor="system-prompt">System Prompt</Label>
                        <Textarea
                            id="system-prompt"
                            rows={8}
                            value={selectedAgent.systemPrompt || ''}
                            onChange={(e) => updateAgent(selectedAgent.id, { systemPrompt: e.target.value })}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
```

## Adding a Completely New Section

### Step 1: Define Section in Constants

**File:** `src/constants/sidebar.ts`

```typescript
import { FileText } from '@phosphor-icons/react';

export type SidebarSection =
    | 'sessions'
    | 'agents'
    | 'commands'
    | 'providers'
    | 'settings'
    | 'documents'; // ← Add new section type

export const SIDEBAR_SECTIONS: SidebarSectionConfig[] = [
    // ... existing sections
    {
        id: 'documents',
        label: 'Documents',
        description: 'Browse and manage project documentation.',
        icon: FileText,
    },
];
```

### Step 2: Create Section Components

**Create directory:**
```bash
mkdir -p src/components/sections/documents
```

**File:** `src/components/sections/documents/DocumentsSidebar.tsx`
```typescript
import React from 'react';
import { SectionPlaceholder } from '../SectionPlaceholder';

export const DocumentsSidebar: React.FC = () => {
    return <SectionPlaceholder sectionId="documents" variant="sidebar" />;
};
```

**File:** `src/components/sections/documents/DocumentsPage.tsx`
```typescript
import React from 'react';
import { SectionPlaceholder } from '../SectionPlaceholder';

export const DocumentsPage: React.FC = () => {
    return <SectionPlaceholder sectionId="documents" variant="page" />;
};
```

### Step 3: Add Routes to MainLayout

**File:** `src/components/layout/MainLayout.tsx`

```typescript
// Add imports
import { DocumentsSidebar } from '../sections/documents/DocumentsSidebar';
import { DocumentsPage } from '../sections/documents/DocumentsPage';

// Update sidebarContent switch
const sidebarContent = React.useMemo(() => {
    switch (sidebarSection) {
        case 'sessions': return <SessionsSidebar />;
        case 'agents': return <AgentsSidebar />;
        case 'commands': return <CommandsSidebar />;
        case 'providers': return <ProvidersSidebar />;
        case 'settings': return <SettingsSidebar />;
        case 'documents': return <DocumentsSidebar />; // ← Add
        default: return <SessionsSidebar />;
    }
}, [sidebarSection]);

// Update mainContent switch
const mainContent = React.useMemo(() => {
    switch (sidebarSection) {
        case 'sessions': return <SessionsPage />;
        case 'agents': return <AgentsPage />;
        case 'commands': return <CommandsPage />;
        case 'providers': return <ProvidersPage />;
        case 'settings': return <SettingsPage />;
        case 'documents': return <DocumentsPage />; // ← Add
        default: return <SessionsPage />;
    }
}, [sidebarSection]);
```

**That's it!** Section is now accessible via navigation bar.

## Styling Guidelines

### Sidebar Content (264px width)

**Layout:**
```typescript
<div className="flex h-full flex-col bg-sidebar">
    {/* Fixed header */}
    <div className="border-b border-border/40 px-3 py-3">
        <h2 className="typography-ui-label font-semibold">Section Name</h2>
    </div>

    {/* Scrollable content */}
    <div className="flex-1 overflow-y-auto px-3 py-2">
        {/* List items, cards, etc. */}
    </div>

    {/* Optional fixed footer */}
    <div className="border-t border-border/40 px-3 py-2">
        {/* Actions, status, etc. */}
    </div>
</div>
```

**Typography classes:**
- `typography-ui-label` - Section headers, list item titles
- `typography-meta` - Counts, metadata, secondary info
- `typography-micro` - Tertiary info, timestamps

**Colors:**
- Background: `bg-sidebar`
- Borders: `border-border/40`
- Accents: `bg-sidebar-accent` (selected items)
- Text: `text-foreground`, `text-muted-foreground`

### Page Content (flex-1 width)

**Layout:**
```typescript
<div className="h-full overflow-y-auto p-6">
    <div className="mx-auto max-w-4xl space-y-6">
        {/* Page header */}
        <div>
            <h1 className="typography-h1 font-semibold">Page Title</h1>
            <p className="typography-body text-muted-foreground">Description</p>
        </div>

        {/* Page content */}
        <div className="space-y-4">
            {/* Forms, cards, content blocks */}
        </div>
    </div>
</div>
```

**Max-width guidelines:**
- Forms/settings: `max-w-2xl` (672px)
- Reading content: `max-w-3xl` (768px)
- Wide layouts: `max-w-4xl` (896px)
- Full width: `max-w-full`

## Header Context Display

**File:** `src/components/layout/Header.tsx`

Header conditionally shows session-specific information only when `sidebarSection === 'sessions'`:

**Desktop:**
- Session title + directory - shown only for sessions
- Context usage display - shown only for sessions
- OpenCode connection indicator - always shown
- Refresh config button - always shown
- Theme switcher - always shown

**Mobile:**
- Session title - shown only for sessions
- Dropdown: directory & context usage - shown only for sessions
- Refresh config & theme switcher - always shown

**Implementation:**
```typescript
const isSessionsSection = sidebarSection === 'sessions';

// In render:
{isSessionsSection && (
    <div className="flex min-w-0 flex-col leading-tight">
        <span>{activeSessionTitle}</span>
        <span>{directoryDisplay}</span>
    </div>
)}
```

## Testing Checklist

When adding/modifying section content:

### Desktop
- [ ] Section appears in navigation bar
- [ ] Clicking section icon switches sidebar content
- [ ] Clicking section icon switches main content
- [ ] Sidebar toggle (Cmd+B) works correctly
- [ ] Sidebar width fixed at 264px
- [ ] Content doesn't overflow sidebar
- [ ] Smooth collapse/expand animation
- [ ] Active section highlighted in nav bar

### Mobile
- [ ] Hamburger menu opens sidebar overlay
- [ ] Nav bar + sidebar shown in fullscreen
- [ ] Section switching works in overlay
- [ ] Selecting item auto-closes sidebar (if applicable)
- [ ] Backdrop click closes overlay
- [ ] X button closes overlay
- [ ] No content overflow or horizontal scroll

### Both
- [ ] Section state persists on reload
- [ ] No console errors or warnings
- [ ] TypeScript compiles without errors
- [ ] Responsive behavior smooth
- [ ] Theme switching works correctly

## Common Patterns

### Communication Between Sidebar and Page

Use shared state (Zustand store or React Context):

```typescript
// Create store
interface AgentsStore {
    selectedAgentId: string | null;
    setSelectedAgent: (id: string | null) => void;
}

export const useAgentsStore = create<AgentsStore>((set) => ({
    selectedAgentId: null,
    setSelectedAgent: (id) => set({ selectedAgentId: id }),
}));
```

**In sidebar:**
```typescript
const { setSelectedAgent } = useAgentsStore();
<button onClick={() => setSelectedAgent(agent.id)}>
    {agent.name}
</button>
```

**In page:**
```typescript
const { selectedAgentId } = useAgentsStore();
const agent = agents.find((a) => a.id === selectedAgentId);
```

### Mobile Auto-Close After Selection

```typescript
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';

const { setSidebarOpen } = useUIStore();
const { isMobile } = useDeviceInfo();

const handleItemClick = (item) => {
    selectItem(item);

    // Auto-close on mobile
    if (isMobile) {
        setSidebarOpen(false);
    }
};
```

### Loading States

```typescript
const { data, isLoading, error } = useFetchData();

if (isLoading) {
    return (
        <div className="flex h-full items-center justify-center">
            <Spinner />
        </div>
    );
}

if (error) {
    return (
        <div className="flex h-full items-center justify-center">
            <ErrorMessage error={error} />
        </div>
    );
}

return <Content data={data} />;
```

## File Size Reference

**Before Refactoring:**
- MainLayout.tsx: 247 lines (all logic + UI)

**After Refactoring:**
- MainLayout.tsx: 146 lines (-41%, routing only)
- NavigationBar.tsx: 78 lines
- Sidebar.tsx: 36 lines
- SectionPlaceholder.tsx: 43 lines
- 10 section component files: ~10 lines each

**Total:** Same functionality, better organization, easier to maintain.

## Summary

This architecture provides:
- ✅ Clean separation of concerns (routing vs UI)
- ✅ Easy section addition (3 files: sidebar + page + route)
- ✅ Isolated development (work on agents without touching sessions)
- ✅ Reusable components (NavigationBar, Sidebar, placeholders)
- ✅ Consistent patterns across all sections
- ✅ Mobile-first responsive design
- ✅ Type-safe routing with TypeScript

For questions or suggestions, refer to this guide and existing section implementations in `src/components/sections/`.
