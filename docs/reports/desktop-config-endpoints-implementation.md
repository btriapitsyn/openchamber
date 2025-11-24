# Desktop Config Endpoints Implementation Report

## Problem Statement

Agent permission changes in desktop app showed no error but values weren't updated in `~/.config/opencode/opencode.json`. UI appeared to save successfully but config remained unchanged.

## Root Cause

Desktop app proxies all `/api/*` requests to OpenCode backend. Web app has custom Express server with `/api/config/*` endpoints for agent/command CRUD operations. OpenCode doesn't have these endpoints - requests fail silently with 404.

Desktop lacked config save capability entirely.

## Implementation Details

### Files Created

#### `packages/desktop/src-tauri/src/opencode_config.rs` (980 lines)
Full Rust port of JavaScript config management logic from `packages/web/server/lib/`.

**Key Functions:**
- `read_config()` / `write_config()` - JSON file operations with comment stripping and backup
- `parse_md_file()` / `write_md_file()` - YAML frontmatter parsing
- `create_agent()`, `update_agent()`, `delete_agent()` - Agent CRUD
- `create_command()`, `update_command()`, `delete_command()` - Command CRUD
- `is_prompt_file_reference()` - Detects `{file:...}` references

**Field-Level Update Logic:**
```rust
// Check where field is currently defined
let in_md = md_data?.frontmatter?.[field] !== undefined;
let in_json = jsonSection?.[field] !== undefined;

if in_md {
    // Update in .md frontmatter
    mdData.frontmatter[field] = value;
} else if in_json {
    // Update in opencode.json
    config.agent[agentName][field] = value;
} else {
    // Apply priority rules based on field type
}
```

#### Handler Functions (removed)
Added to `packages/desktop/src-tauri/src/main.rs` (280 lines, lines 424-703):
- `refresh_opencode_after_config_change()` - Restarts OpenCode and waits for ready
- `create_agent_handler()`, `update_agent_handler()`, `delete_agent_handler()`
- `create_command_handler()`, `update_command_handler()`, `delete_command_handler()`
- `reload_config_handler()`
- Request/response types: `AgentConfig`, `ConfigSuccessResponse`, `ConfigErrorResponse`

#### Route Definitions (removed)
Attempted integration in `main.rs` router (lines 442-453):
```rust
.route(
    "/api/config/agents/:name",
    post(create_agent_handler)
        .patch(update_agent_handler)
        .delete(delete_agent_handler),
)
.route(
    "/api/config/commands/:name",
    post(create_command_handler)
        .patch(update_command_handler)
        .delete(delete_command_handler),
)
.route("/api/config/reload", post(reload_config_handler))
```

#### Dependency Changes
`packages/desktop/src-tauri/Cargo.toml`:
```toml
serde_yaml = "0.9"  # For YAML frontmatter parsing
```

## What We Fixed (Web App)

Before investigating desktop, fixed web app fire-and-forget reload issue:

**Files Changed:**
- `packages/ui/src/stores/useAgentsStore.ts` (3 locations)
- `packages/ui/src/stores/useCommandsStore.ts` (3 locations)
- `packages/web/server/index.js` (4 locations)
- `packages/ui/src/components/chat/message/parts/ToolPart.tsx`

**Changes:**
```typescript
// BEFORE (broken - fire-and-forget)
void performFullConfigRefresh({ message, delayMs });

// AFTER (fixed - awaited)
await performFullConfigRefresh({ message, delayMs });
```

Removed `agentName` parameter from UPDATE operations - `waitForAgentPresence(agentName)` passes immediately since agent already exists with old config.

## Integration Challenges

Multiple route integration attempts all broke proxy functionality. After adding config routes, app showed no messages/agents/models.

**Attempts:**
1. Multiple `.route()` calls with same path - overwrites previous routes
2. Method chaining - syntax correct but broke proxy
3. `.nest()` for isolated routing - broke proxy
4. Restored exact `/api` route - broke proxy

**Root Cause:** Unknown. Likely route ordering, precedence, or state sharing issue with Axum router. Not definitively identified.

**Resolution:** Removed all route additions to restore working app.

## Current State

- Config implementation code exists in `opencode_config.rs` (complete, tested for compilation)
- Handler functions removed from `main.rs`
- Route definitions removed from `main.rs`
- Module declaration removed from `main.rs`
- App restored to working state
- Dependency `serde_yaml` still in Cargo.toml (harmless if unused)

## Technical Architecture

### Dual-File Config System
OpenCode uses two config sources:
1. **Markdown files** (`~/.config/opencode/agents/*.md`, `~/.config/opencode/commands/*.md`)
   - YAML frontmatter for metadata
   - Body content for prompts
2. **JSON file** (`~/.config/opencode/opencode.json`)
   - Structured config with sections: `agent`, `command`, `provider`, etc.

### Field Priority Rules
When updating:
- Check if field exists in .md frontmatter → update there
- Else check if exists in .json section → update there
- Else apply defaults:
  - `prompt`/`body` → .md file body
  - Everything else → .json section

### Prompt File References
Values like `{file:path/to/prompt.md}` reference external files. Detected by `is_prompt_file_reference()` and stored in .json, not .md body.

## Next Steps

1. Debug Axum routing conflict
   - Add detailed logging to route matching
   - Test route ordering variations
   - Check if catch-all proxy consumes config routes
   - Investigate middleware/state sharing issues

2. Alternative integration approaches:
   - Move config routes before proxy routes
   - Use different route prefix (e.g., `/api/desktop/config/*`)
   - Implement as Tauri commands instead of HTTP endpoints
   - Create separate Axum router instance for config operations

3. Consider Tauri commands approach:
   ```rust
   #[tauri::command]
   async fn desktop_update_agent(name: String, updates: AgentConfig) -> Result<ConfigSuccessResponse, String> {
       opencode_config::update_agent(&name, updates)
           .map_err(|e| e.to_string())
   }
   ```
   - Bypasses HTTP routing entirely
   - Direct Rust ↔ JS communication
   - May need UI changes to use Tauri invoke instead of fetch

4. Test coverage:
   - Unit tests for opencode_config.rs functions
   - Integration tests for config update flow
   - E2E tests for agent permission changes

## Files for Reference

- Implementation: `packages/desktop/src-tauri/src/opencode_config.rs`
- Original JS logic: `packages/web/server/lib/configHelpers.js`
- UI stores: `packages/ui/src/stores/useAgentsStore.ts`, `useCommandsStore.ts`
- Web endpoints: `packages/web/server/index.js` (lines 1720-1890)

## Lessons Learned

- Axum route order matters - catch-all routes can interfere with specific routes
- Silent 404 failures in proxy setup hide missing backend endpoints
- Fire-and-forget async operations (`void`) in UI can mask backend failures
- Desktop and web apps need parity for config operations to work cross-platform
