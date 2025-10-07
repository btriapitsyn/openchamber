# Agent Configuration File Management Strategy

## Problem Statement

OpenCode API `/config` PATCH endpoint does not persist changes to configuration files. The API accepts updates and returns modified config, but changes are not written to disk. This requires WebUI to implement direct file manipulation for agent configuration management.

## OpenCode Configuration File Hierarchy

### Configuration Sources (Priority: High → Low)

1. **Custom Config** (Highest Priority)
   - Path: Set via `OPENCODE_CONFIG` environment variable
   - Format: JSON/JSONC
   - Example: `export OPENCODE_CONFIG=/path/to/custom-config.json`

2. **Project-Specific Config** (Medium Priority)
   - Path: `<project-root>/opencode.json`
   - Format: JSON/JSONC
   - Scope: Project-specific settings

3. **Global Config** (Base Priority)
   - Path: `~/.config/opencode/opencode.json`
   - Format: JSON/JSONC
   - Scope: Global settings (themes, providers, keybinds, agent overrides)

### Agent-Specific Configuration Sources

4. **Global Agent Configs**
   - Directory: `~/.config/opencode/agent/`
   - Format: Markdown files with YAML frontmatter (`.md`)
   - Structure: One file per agent (`agent-name.md`)
   - Contains: description, mode, model, temperature, tools, permissions, prompt

5. **Project-Specific Agent Configs**
   - Directory: `.opencode/agent/`
   - Format: Markdown files with YAML frontmatter
   - Override global agent configurations

### Configuration Merging

OpenCode merges configurations in this order:
1. Global config (`~/.config/opencode/opencode.json`)
2. Global agent files (`~/.config/opencode/agent/*.md`)
3. Project config (`opencode.json`)
4. Project agent files (`.opencode/agent/*.md`)
5. Custom config (`OPENCODE_CONFIG` env)

**For WebUI**: We operate on global configuration only (`~/.config/opencode/`).

## Agent Configuration Storage Patterns

### Pattern 1: Agent in .md file only
```
~/.config/opencode/agent/architect.md
---
description: Architecture mode
mode: primary
model: openai/gpt-5-codex
temperature: 0.1
---
System prompt content...
```

### Pattern 2: Agent in opencode.json only
```json
{
  "agent": {
    "custom-agent": {
      "description": "...",
      "mode": "subagent",
      "tools": { "bash": false },
      "prompt": "System prompt..."
    }
  }
}
```

### Pattern 3: Agent split between .md and opencode.json
```
# .md file has base config:
~/.config/opencode/agent/architect.md
---
description: Architecture mode
mode: primary
model: openai/gpt-5-codex
---
Prompt...

# opencode.json has overrides:
{
  "agent": {
    "architect": {
      "tools": { "bash": true, "write": false },
      "permission": { "edit": "allow" }
    }
  }
}
```

**OpenCode merges**: .md frontmatter + opencode.json section (JSON has higher priority).

### Pattern 4: Built-in agent (no user config)
- No .md file
- No section in opencode.json
- OpenCode provides default configuration
- User can override by creating section in opencode.json

## Field-Level Update Strategy

### Core Principle
**Each field is updated where it is currently defined.** New fields are added following priority rules.

### Algorithm for Updating Existing Agent

For **each field** being changed (mode, model, temperature, tools, permissions, etc.):

#### Step 1: Check where THIS SPECIFIC FIELD is currently defined

**a) Field exists in `~/.config/opencode/agent/{name}.md` frontmatter?**
- → Update it THERE (in .md file)

**b) Field exists in `opencode.json` section `agent.{name}`?**
- → Update it THERE (in opencode.json)

**c) Field is NOT defined anywhere (using default value)?**
- → Determine where to add:

  1. **If .md file EXISTS AND section in opencode.json EXISTS**
     - → Add to opencode.json (higher priority for overrides)

  2. **If ONLY .md file exists**
     - → Add to .md frontmatter

  3. **If no .md file, but section in opencode.json EXISTS**
     - → Add to opencode.json

  4. **If neither .md nor section exists (built-in agent)**
     - → Create section in opencode.json

### Rationale

- **Respect existing structure**: Don't reorganize user's configuration
- **Minimal changes**: Update only what's necessary
- **Priority-aware**: opencode.json overrides .md, so new fields go there when both exist
- **Built-in override**: Built-in agents are overridden via opencode.json only

## CRUD Operations

### 1. CREATE New Agent

**Always create new .md file:**

```bash
~/.config/opencode/agent/{agent-name}.md
```

**File structure:**
```markdown
---
description: Agent description
mode: subagent
model: provider/model-id
temperature: 0.5
top_p: 1.0
tools:
  bash: true
  write: true
  edit: false
permission:
  edit: ask
  bash: allow
  webfetch: deny
---
Custom system prompt content here...
```

**Why .md for new agents?**
- Clean separation of concerns
- Easy to read and edit manually
- Follows OpenCode conventions
- Prompt content separated from metadata

### 2. READ Agent Configuration

**Use OpenCode API:**
```
GET /agent
```

Returns merged configuration from all sources. Fields include:
- `name`: Agent name
- `builtIn`: Boolean indicating if this is a built-in agent
- `description`, `mode`, `model`, `temperature`, `top_p`
- `tools`: Object of tool permissions
- `permission`: Object of global permissions
- `prompt`: System prompt content

### 3. UPDATE Existing Agent

**Algorithm:**

```javascript
function updateAgent(agentName, updates) {
  const mdPath = `~/.config/opencode/agent/${agentName}.md`;
  const configPath = `~/.config/opencode/opencode.json`;

  const mdExists = fileExists(mdPath);
  const mdContent = mdExists ? parseMdWithFrontmatter(mdPath) : null;

  const config = readJSON(configPath);
  const jsonSection = config.agent?.[agentName];

  for (const [field, value] of Object.entries(updates)) {
    // Check where field is currently defined
    const inMdFrontmatter = mdContent?.frontmatter?.[field] !== undefined;
    const inJsonSection = jsonSection?.[field] !== undefined;

    if (inMdFrontmatter) {
      // Update in .md frontmatter
      mdContent.frontmatter[field] = value;
      writeMdWithFrontmatter(mdPath, mdContent);

    } else if (inJsonSection) {
      // Update in opencode.json
      config.agent[agentName][field] = value;
      writeJSON(configPath, config);

    } else {
      // Field not defined - determine where to add
      if (mdExists && jsonSection) {
        // Both exist → add to opencode.json (higher priority)
        config.agent[agentName][field] = value;
        writeJSON(configPath, config);

      } else if (mdExists) {
        // Only .md exists → add to frontmatter
        mdContent.frontmatter[field] = value;
        writeMdWithFrontmatter(mdPath, mdContent);

      } else {
        // Only JSON or built-in → add/create section in opencode.json
        if (!config.agent) config.agent = {};
        if (!config.agent[agentName]) config.agent[agentName] = {};
        config.agent[agentName][field] = value;
        writeJSON(configPath, config);
      }
    }
  }
}
```

**Special handling for `prompt` field:**
- If in .md file → update body content (after frontmatter)
- If in opencode.json → update `prompt` field
- If nowhere → add to .md body if .md exists, else add to opencode.json

### 4. DELETE Agent

**Algorithm:**

```javascript
function deleteAgent(agentName) {
  const mdPath = `~/.config/opencode/agent/${agentName}.md`;
  const configPath = `~/.config/opencode/opencode.json`;

  let deleted = false;

  // 1. Delete .md file if exists
  if (fileExists(mdPath)) {
    deleteFile(mdPath);
    deleted = true;
  }

  // 2. Remove section from opencode.json if exists
  const config = readJSON(configPath);
  if (config.agent?.[agentName]) {
    delete config.agent[agentName];
    writeJSON(configPath, config);
    deleted = true;
  }

  // 3. If nothing was deleted (built-in agent), disable it
  if (!deleted) {
    if (!config.agent) config.agent = {};
    config.agent[agentName] = { disable: true };
    writeJSON(configPath, config);
  }
}
```

**Deletion logic:**
- Custom agent with .md → delete .md file
- Agent with JSON section → remove section
- Built-in agent → add `disable: true` to opencode.json

## Backend API Implementation

### Endpoints

```
GET    /api/config/agents          - List all agents (proxy to /agent)
GET    /api/config/agents/:name    - Get agent config metadata (where fields are stored)
POST   /api/config/agents/:name    - Create new agent (.md file)
PATCH  /api/config/agents/:name    - Update existing agent (field-level logic)
DELETE /api/config/agents/:name    - Delete agent
```

### Endpoint Details

#### GET /api/config/agents/:name

Returns metadata about where agent configuration is stored:

```json
{
  "name": "architect",
  "sources": {
    "md": {
      "exists": true,
      "path": "~/.config/opencode/agent/architect.md",
      "fields": ["description", "mode", "model"]
    },
    "json": {
      "exists": true,
      "path": "~/.config/opencode/opencode.json",
      "fields": ["tools", "permission"]
    }
  },
  "isBuiltIn": false
}
```

#### POST /api/config/agents/:name

Create new agent as .md file:

```javascript
// Request body
{
  "description": "My agent",
  "mode": "subagent",
  "model": "anthropic/claude-sonnet-4",
  "temperature": 0.5,
  "tools": { "bash": true },
  "permission": { "edit": "ask" },
  "prompt": "System prompt content..."
}

// Creates: ~/.config/opencode/agent/{name}.md
```

#### PATCH /api/config/agents/:name

Update existing agent using field-level logic:

```javascript
// Request body - only changed fields
{
  "mode": "primary",
  "tools": { "bash": false }
}

// Implementation:
// 1. Determine where each field is currently defined
// 2. Update in appropriate file(s)
// 3. Apply priority rules for new fields
```

#### DELETE /api/config/agents/:name

Delete agent configuration:

```javascript
// 1. Delete .md file if exists
// 2. Remove section from opencode.json if exists
// 3. If built-in, add { disable: true } to opencode.json
```

### File Operations Module

Create `server/lib/opencode-config.js`:

```javascript
import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';

const OPENCODE_CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode');
const AGENT_DIR = path.join(OPENCODE_CONFIG_DIR, 'agent');
const CONFIG_FILE = path.join(OPENCODE_CONFIG_DIR, 'opencode.json');

// Ensure directories exist
function ensureDirs() {
  if (!fs.existsSync(AGENT_DIR)) {
    fs.mkdirSync(AGENT_DIR, { recursive: true });
  }
}

// Read opencode.json
function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

// Write opencode.json
function writeConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// Parse .md file with frontmatter
function parseMdFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter = yaml.load(match[1]) || {};
  const body = match[2].trim();

  return { frontmatter, body };
}

// Write .md file with frontmatter
function writeMdFile(filePath, frontmatter, body) {
  const yamlStr = yaml.dump(frontmatter, { lineWidth: -1 });
  const content = `---\n${yamlStr}---\n\n${body}`;
  fs.writeFileSync(filePath, content, 'utf8');
}

// Get agent sources
function getAgentSources(agentName) {
  const mdPath = path.join(AGENT_DIR, `${agentName}.md`);
  const mdExists = fs.existsSync(mdPath);

  const config = readConfig();
  const jsonSection = config.agent?.[agentName];

  const sources = {
    md: {
      exists: mdExists,
      path: mdExists ? mdPath : null,
      fields: []
    },
    json: {
      exists: !!jsonSection,
      path: CONFIG_FILE,
      fields: []
    }
  };

  if (mdExists) {
    const { frontmatter } = parseMdFile(mdPath);
    sources.md.fields = Object.keys(frontmatter);
  }

  if (jsonSection) {
    sources.json.fields = Object.keys(jsonSection);
  }

  return sources;
}

// Create agent
function createAgent(agentName, config) {
  ensureDirs();

  const mdPath = path.join(AGENT_DIR, `${agentName}.md`);
  const { prompt, ...frontmatter } = config;

  writeMdFile(mdPath, frontmatter, prompt || '');
}

// Update agent (field-level logic)
function updateAgent(agentName, updates) {
  ensureDirs();

  const mdPath = path.join(AGENT_DIR, `${agentName}.md`);
  const mdExists = fs.existsSync(mdPath);

  let mdData = mdExists ? parseMdFile(mdPath) : null;
  let config = readConfig();
  const jsonSection = config.agent?.[agentName];

  let mdModified = false;
  let jsonModified = false;

  for (const [field, value] of Object.entries(updates)) {
    if (field === 'prompt') {
      // Special handling for prompt
      if (mdExists) {
        mdData.body = value;
        mdModified = true;
      } else {
        if (!config.agent) config.agent = {};
        if (!config.agent[agentName]) config.agent[agentName] = {};
        config.agent[agentName].prompt = value;
        jsonModified = true;
      }
      continue;
    }

    const inMd = mdData?.frontmatter?.[field] !== undefined;
    const inJson = jsonSection?.[field] !== undefined;

    if (inMd) {
      mdData.frontmatter[field] = value;
      mdModified = true;
    } else if (inJson) {
      config.agent[agentName][field] = value;
      jsonModified = true;
    } else {
      // Field not defined - apply priority rules
      if (mdExists && jsonSection) {
        if (!config.agent[agentName]) config.agent[agentName] = {};
        config.agent[agentName][field] = value;
        jsonModified = true;
      } else if (mdExists) {
        mdData.frontmatter[field] = value;
        mdModified = true;
      } else {
        if (!config.agent) config.agent = {};
        if (!config.agent[agentName]) config.agent[agentName] = {};
        config.agent[agentName][field] = value;
        jsonModified = true;
      }
    }
  }

  if (mdModified) {
    writeMdFile(mdPath, mdData.frontmatter, mdData.body);
  }

  if (jsonModified) {
    writeConfig(config);
  }
}

// Delete agent
function deleteAgent(agentName) {
  const mdPath = path.join(AGENT_DIR, `${agentName}.md`);
  let deleted = false;

  if (fs.existsSync(mdPath)) {
    fs.unlinkSync(mdPath);
    deleted = true;
  }

  const config = readConfig();
  if (config.agent?.[agentName]) {
    delete config.agent[agentName];
    writeConfig(config);
    deleted = true;
  }

  if (!deleted) {
    // Built-in agent - disable it
    if (!config.agent) config.agent = {};
    config.agent[agentName] = { disable: true };
    writeConfig(config);
  }
}

export {
  getAgentSources,
  createAgent,
  updateAgent,
  deleteAgent,
  readConfig,
  writeConfig
};
```

## Frontend Changes

### Update AgentsStore

Modify `src/stores/useAgentsStore.ts` to use new backend endpoints:

```typescript
// CREATE
createAgent: async (config: AgentConfig) => {
  const response = await fetch('/api/config/agents/' + config.name, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });

  if (!response.ok) throw new Error('Failed to create agent');

  await get().loadAgents();
  return true;
},

// UPDATE
updateAgent: async (name: string, config: Partial<AgentConfig>) => {
  const response = await fetch('/api/config/agents/' + name, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });

  if (!response.ok) throw new Error('Failed to update agent');

  await get().loadAgents();
  return true;
},

// DELETE
deleteAgent: async (name: string) => {
  const response = await fetch('/api/config/agents/' + name, {
    method: 'DELETE'
  });

  if (!response.ok) throw new Error('Failed to delete agent');

  await get().loadAgents();
  return true;
}
```

## Implementation Checklist

- [ ] Create `server/lib/opencode-config.js` module
  - [ ] Implement file reading/writing utilities
  - [ ] Implement markdown frontmatter parsing
  - [ ] Implement field-level update logic
  - [ ] Add tests for edge cases

- [ ] Add backend endpoints to `server/index.js`
  - [ ] GET /api/config/agents/:name
  - [ ] POST /api/config/agents/:name
  - [ ] PATCH /api/config/agents/:name
  - [ ] DELETE /api/config/agents/:name

- [ ] Update frontend
  - [ ] Modify `useAgentsStore.ts` to use new endpoints
  - [ ] Remove old `updateConfigPartial` logic
  - [ ] Test all CRUD operations

- [ ] Testing
  - [ ] Test with .md only configuration
  - [ ] Test with JSON only configuration
  - [ ] Test with split configuration (.md + JSON)
  - [ ] Test with built-in agents
  - [ ] Test field-level updates
  - [ ] Verify file content after operations

## Example Scenarios

### Scenario 1: User has architect.md, edits mode

**Before:**
```
~/.config/opencode/agent/architect.md:
---
mode: primary
model: openai/gpt-5-codex
---
```

**User changes mode to "subagent"**

**After:**
```
~/.config/opencode/agent/architect.md:
---
mode: subagent
model: openai/gpt-5-codex
---
```

### Scenario 2: User has split config, adds new field

**Before:**
```
architect.md:
---
mode: primary
---

opencode.json:
{
  "agent": {
    "architect": {
      "tools": { "bash": true }
    }
  }
}
```

**User adds temperature: 0.5**

**After (added to opencode.json - both exist):**
```
opencode.json:
{
  "agent": {
    "architect": {
      "tools": { "bash": true },
      "temperature": 0.5
    }
  }
}
```

### Scenario 3: User edits built-in agent

**Before:**
- No architect.md
- No section in opencode.json
- OpenCode provides defaults

**User changes mode to "subagent"**

**After:**
```
opencode.json:
{
  "agent": {
    "architect": {
      "mode": "subagent"
    }
  }
}
```

## Notes

- Always backup `opencode.json` before writing
- Validate YAML frontmatter before writing .md files
- Handle file system errors gracefully
- Consider file locking for concurrent access
- Log all file operations for debugging
- Respect existing file formatting (indentation, line endings)
