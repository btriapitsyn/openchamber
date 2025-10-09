# Configuration Reuse Guide for OpenCode WebUI

This guide explains how to reuse the existing configuration management system for new types of settings (like slash commands, custom tools, etc.) in OpenCode WebUI.

## Overview

The current agent management system provides a **reusable pattern** for any configuration that requires:
- File-based storage
- OpenCode restart for changes to take effect
- Loading states and user feedback
- Automatic UI refresh after changes

## Architecture Pattern

### Backend Pattern (server/index.js)

All configuration endpoints follow this exact pattern:

```typescript
app.method('/api/config/[type]/:name', async (req, res) => {
  try {
    const itemName = req.params.name;
    const config = req.body;
    
    // 1. Save configuration to file
    save[Type](itemName, config);
    
    // 2. Restart OpenCode (universal for all config types)
    await refreshOpenCodeAfterConfigChange('[type] [operation]', {
      // Optional: specific item name for verification
    });
    
    // 3. Return standardized response
    res.json({
      success: true,
      requiresReload: true,  // Always true for config changes
      message: `[Type] ${itemName} [operation] successfully. Reloading interface…`,
      reloadDelayMs: CLIENT_RELOAD_DELAY_MS,  // 800ms default
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message || `Failed to [operation] [type]` 
    });
  }
});
```

### Frontend Pattern (stores)

All configuration stores follow this pattern:

```typescript
// In your [type]Store.ts
async create[Type](config: [Type]Config) {
  startConfigUpdate("Creating [type] configuration…");
  let requiresReload = false;
  
  try {
    const response = await fetch(`/api/config/[type]s/${encodeURIComponent(config.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to create [type]');
    }
    
    // Handle reload if required
    if (payload?.requiresReload) {
      requiresReload = true;
      void performFullConfigRefresh({
        message: payload.message,
        delayMs: payload.reloadDelayMs,
      });
      return true;
    }
    
    // Normal load if no reload needed
    const loaded = await get().load[Type]s();
    if (loaded) {
      emitConfigChange("[types]", { source: CONFIG_EVENT_SOURCE });
    }
    return loaded;
    
  } catch (error) {
    console.error("[Type] creation failed:", error);
    return false;
  } finally {
    if (!requiresReload) {
      finishConfigUpdate();
    }
  }
}
```

## Step-by-Step Implementation

### Step 1: Create Backend Functions

Add your configuration functions to `server/lib/opencode-config.js`:

```typescript
// Add to server/lib/opencode-config.js

const [TYPE]_DIR = path.join(OPENCODE_CONFIG_DIR, '[type]s');

function ensure[Type]Dirs() {
  if (!fs.existsSync([TYPE]_DIR)) {
    fs.mkdirSync([TYPE]_DIR, { recursive: true });
  }
}

export function get[Type]Sources(name) {
  ensure[Type]Dirs();
  const jsonFile = path.join([TYPE]_DIR, `${name}.json`);
  
  return {
    json: {
      exists: fs.existsSync(jsonFile),
      path: jsonFile
    }
  };
}

export function create[Type](name, config) {
  ensure[Type]Dirs();
  const sources = get[Type]Sources(name);
  
  // Write JSON configuration
  fs.writeFileSync(sources.json.path, JSON.stringify(config, null, 2), 'utf8');
  console.log(`Created [type]: ${name}`);
}

export function update[Type](name, updates) {
  ensure[Type]Dirs();
  const sources = get[Type]Sources(name);
  
  if (!sources.json.exists) {
    throw new Error(`[Type] "${name}" not found`);
  }
  
  // Read existing config
  const existing = JSON.parse(fs.readFileSync(sources.json.path, 'utf8'));
  const updated = { ...existing, ...updates };
  
  // Write updated config
  fs.writeFileSync(sources.json.path, JSON.stringify(updated, null, 2), 'utf8');
  console.log(`Updated [type]: ${name}`);
}

export function delete[Type](name) {
  ensure[Type]Dirs();
  const sources = get[Type]Sources(name);
  
  if (!sources.json.exists) {
    throw new Error(`[Type] "${name}" not found`);
  }
  
  fs.unlinkSync(sources.json.path);
  console.log(`Deleted [type]: ${name}`);
}
```

### Step 2: Add Backend Endpoints

Add to `server/index.js` after the agent endpoints:

```typescript
// Add these imports at the top of server/index.js
import { 
  get[Type]Sources, 
  create[Type], 
  update[Type], 
  delete[Type] 
} from './lib/opencode-config.js';

// Add these endpoints after agent endpoints

// GET /api/config/[type]s/:name - Get [type] configuration metadata
app.get('/api/config/[type]s/:name', (req, res) => {
  try {
    const itemName = req.params.name;
    const sources = get[Type]Sources(itemName);
    
    res.json({
      name: itemName,
      sources: sources,
      isBuiltIn: !sources.json.exists
    });
  } catch (error) {
    console.error('Failed to get [type] sources:', error);
    res.status(500).json({ error: 'Failed to get [type] configuration metadata' });
  }
});

// POST /api/config/[type]s/:name - Create new [type]
app.post('/api/config/[type]s/:name', async (req, res) => {
  try {
    const itemName = req.params.name;
    const config = req.body;
    
    create[Type](itemName, config);
    await refreshOpenCodeAfterConfigChange('[type] creation', {});
    
    res.json({
      success: true,
      requiresReload: true,
      message: `[Type] ${itemName} created successfully. Reloading interface…`,
      reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
    });
  } catch (error) {
    console.error('Failed to create [type]:', error);
    res.status(500).json({ error: error.message || 'Failed to create [type]' });
  }
});

// PATCH /api/config/[type]s/:name - Update existing [type]
app.patch('/api/config/[type]s/:name', async (req, res) => {
  try {
    const itemName = req.params.name;
    const updates = req.body;
    
    update[Type](itemName, updates);
    await refreshOpenCodeAfterConfigChange('[type] update', {});
    
    res.json({
      success: true,
      requiresReload: true,
      message: `[Type] ${itemName} updated successfully. Reloading interface…`,
      reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
    });
  } catch (error) {
    console.error('Failed to update [type]:', error);
    res.status(500).json({ error: error.message || 'Failed to update [type]' });
  }
});

// DELETE /api/config/[type]s/:name - Delete [type]
app.delete('/api/config/[type]s/:name', async (req, res) => {
  try {
    const itemName = req.params.name;
    
    delete[Type](itemName);
    await refreshOpenCodeAfterConfigChange('[type] deletion', {});
    
    res.json({
      success: true,
      requiresReload: true,
      message: `[Type] ${itemName} deleted successfully. Reloading interface…`,
      reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
    });
  } catch (error) {
    console.error('Failed to delete [type]:', error);
    res.status(500).json({ error: error.message || 'Failed to delete [type]' });
  }
});
```

### Step 3: Create Frontend Store

Create `src/stores/use[Type]sStore.ts`:

```typescript
import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import { opencodeClient } from "@/lib/opencode/client";
import { 
  startConfigUpdate,
  finishConfigUpdate,
  updateConfigUpdateMessage 
} from "@/lib/configUpdate";
import { emitConfigChange, subscribeToConfigChanges } from "@/lib/configSync";
import { getSafeStorage } from "./utils/safeStorage";

export interface [Type]Config {
  name: string;
  // Add your specific fields here
  description?: string;
  // ... other fields
}

const CONFIG_EVENT_SOURCE = "use[Type]sStore";

interface [Type]sStore {
  // State
  selected[Type]Name: string | null;
  [type]s: [Type]Config[];
  isLoading: boolean;

  // Actions
  setSelected[Type]: (name: string | null) => void;
  load[Type]s: () => Promise<boolean>;
  create[Type]: (config: [Type]Config) => Promise<boolean>;
  update[Type]: (name: string, config: Partial<[Type]Config>) => Promise<boolean>;
  delete[Type]: (name: string) => Promise<boolean>;
  get[Type]ByName: (name: string) => [Type]Config | undefined;
}

export const use[Type]sStore = create<[Type]sStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial State
        selected[Type]Name: null,
        [type]s: [],
        isLoading: false,

        // Set selected item
        setSelected[Type]: (name: string | null) => {
          set({ selected[Type]Name: name });
        },

        // Load items from API
        load[Type]s: async () => {
          set({ isLoading: true });
          const previous[type]s = get().[type]s;
          let lastError: unknown = null;

          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              // You'll need to add list[Type]s method to opencodeClient
              const [type]s = await opencodeClient.list[Type]s();
              set({ [type]s, isLoading: false });
              return true;
            } catch (error) {
              lastError = error;
              const waitMs = 200 * (attempt + 1);
              await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
          }

          console.error("Failed to load [type]s:", lastError);
          set({ [type]s: previous[type]s, isLoading: false });
          return false;
        },

        // Create new item
        create[Type]: async (config: [Type]Config) => {
          startConfigUpdate("Creating [type] configuration…");
          let requiresReload = false;
          
          try {
            const response = await fetch(`/api/config/[type]s/${encodeURIComponent(config.name)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(config)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to create [type]';
              throw new Error(message);
            }

            if (payload?.requiresReload) {
              requiresReload = true;
              void performFullConfigRefresh({
                message: payload.message,
                delayMs: payload.reloadDelayMs,
              });
              return true;
            }

            const loaded = await get().load[Type]s();
            if (loaded) {
              emitConfigChange("[type]s", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
            
          } catch (error) {
            console.error("[Type] creation failed:", error);
            return false;
          } finally {
            if (!requiresReload) {
              finishConfigUpdate();
            }
          }
        },

        // Update existing item
        update[Type]: async (name: string, config: Partial<[Type]Config>) => {
          startConfigUpdate("Updating [type] configuration…");
          let requiresReload = false;
          
          try {
            const [type]Config: any = {};
            
            // Map your config fields
            if (config.description !== undefined) [type]Config.description = config.description;
            // ... map other fields
            
            const response = await fetch(`/api/config/[type]s/${encodeURIComponent(name)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify([type]Config)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to update [type]';
              throw new Error(message);
            }

            if (payload?.requiresReload) {
              requiresReload = true;
              void performFullConfigRefresh({
                message: payload.message,
                delayMs: payload.reloadDelayMs,
              });
              return true;
            }

            const loaded = await get().load[Type]s();
            if (loaded) {
              emitConfigChange("[type]s", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
            
          } catch (error) {
            console.error("[Type] update failed:", error);
            return false;
          } finally {
            if (!requiresReload) {
              finishConfigUpdate();
            }
          }
        },

        // Delete item
        delete[Type]: async (name: string) => {
          startConfigUpdate("Deleting [type] configuration…");
          let requiresReload = false;
          
          try {
            const response = await fetch(`/api/config/[type]s/${encodeURIComponent(name)}`, {
              method: 'DELETE'
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to delete [type]';
              throw new Error(message);
            }

            if (payload?.requiresReload) {
              requiresReload = true;
              void performFullConfigRefresh({
                message: payload.message,
                delayMs: payload.reloadDelayMs,
              });
              return true;
            }

            const loaded = await get().load[Type]s();
            if (loaded) {
              emitConfigChange("[type]s", { source: CONFIG_EVENT_SOURCE });
            }

            if (get().selected[Type]Name === name) {
              set({ selected[Type]Name: null });
            }

            return loaded;
            
          } catch (error) {
            console.error("[Type] deletion failed:", error);
            return false;
          } finally {
            if (!requiresReload) {
              finishConfigUpdate();
            }
          }
        },

        // Get item by name
        get[Type]ByName: (name: string) => {
          const { [type]s } = get();
          return [type]s.find((t) => t.name === name);
        },
      }),
      {
        name: "[type]s-store",
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({
          selected[Type]Name: state.selected[Type]Name,
        }),
      },
    ),
    {
      name: "[type]s-store",
    },
  ),
);

if (typeof window !== "undefined") {
  (window as any).__zustand_[type]s_store__ = use[Type]sStore;
}

// Add client method if needed
// Add to src/lib/opencode/client.ts:
// async list[Type]s(): Promise<[Type]Config[]> {
//   const response = await fetch('/api/config/[type]s');
//   if (!response.ok) throw new Error('Failed to fetch [type]s');
//   return response.json();
// }
```

## Key Principles

1. **Always use the same response format** - `success`, `requiresReload`, `message`, `reloadDelayMs`
2. **Always call `refreshOpenCodeAfterConfigChange`** - This ensures OpenCode picks up changes
3. **Always handle `requiresReload` in frontend** - Use `performFullConfigRefresh` for consistency
4. **Always use the config update system** - `startConfigUpdate`, `finishConfigUpdate` for loading states
5. **Always emit config change events** - `emitConfigChange` for cross-component updates

## Testing Your Implementation

1. **Backend test**: Use curl to test your endpoints
```bash
curl -X POST http://localhost:3001/api/config/[type]s/test-name \
  -H "Content-Type: application/json" \
  -d '{"name": "test-name", "description": "Test description"}'
```

2. **Frontend test**: Check browser console for:
- Loading overlay appears
- Success message shows
- OpenCode restarts (check `/health` endpoint)
- UI refreshes automatically

## Common Pitfalls to Avoid

1. **Don't forget `requiresReload: true`** - All config changes need OpenCode restart
2. **Don't skip error handling** - Always catch and return proper error messages
3. **Don't forget to emit config changes** - Other components need to know about updates
4. **Don't use different response formats** - Stick to the established pattern
5. **Don't forget loading states** - Always use `startConfigUpdate`/`finishConfigUpdate`

## Next Steps

1. Choose your configuration type (commands, tools, settings, etc.)
2. Follow the step-by-step implementation above
3. Test thoroughly with the provided test commands
4. Add UI components using the established patterns
5. Document any type-specific considerations

The system is designed to be **extensible** - you can add any number of configuration types following this same pattern!