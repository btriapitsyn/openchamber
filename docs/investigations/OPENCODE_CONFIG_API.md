# OpenCode Configuration API Capabilities

## Overview

The OpenCode server exposes a configuration surface through the `/config` endpoints. `GET /config` returns the currently active settings, while `PATCH /config` accepts a JSON payload that matches the configuration schema. Updates can be partial—the server merges incoming fields with the existing document. The changes take effect immediately for the running OpenCode process; clients may need to refresh their cached state to pick up the new values.

This document catalogues every configurable area surfaced by the API, highlights related endpoints, and provides usage guidance for future feature work.

## Core Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/config` | `GET` | Read the full configuration document. |
| `/config` | `PATCH` | Update configuration fields (partial payloads allowed). |
| `/config/providers` | `GET` | Inspect the effective provider catalog after config + backend defaults are merged. |
| `/agent` | `GET` | View the resolved agent list (after config overrides). |
| `/auth/{id}` | `PUT` | Store credentials referenced by provider entries (e.g. API keys). |

`PATCH /config` accepts the same schema as `GET /config`. Fields not included in the payload remain unchanged.

## Configurable Areas

### Baseline Options

* `theme`: switch the UI theme by name.
* `username`: override the display name used in conversations.
* `share`: control auto-sharing behaviour (`"manual"`, `"auto"`, `"disabled"`). Deprecated `autoshare` persists for backward compatibility.
* `autoupdate`: toggle automatic upgrades.
* `snapshot`: enable or disable snapshot generation.
* `disabled_providers`: array of provider IDs to hide even if the backend advertises them.
* `model` / `small_model`: set the default and lightweight fallback model in `provider/model` format.

### Commands Catalogue

The `command` object lets you register or override slash commands. Each key is the command name with a value containing:

* `template` (required): prompt template text.
* Optional metadata: `description`, `agent`, `model`, `subtask` flag.

### File Watcher, Plugins, and Misc Flags

* `watcher.ignore`: array of glob patterns ignored by filesystem monitoring.
* `plugin`: array of plugin identifiers to load at startup.
* `instructions`: additional instruction files or glob patterns to inject.

### Agent Definitions (Custom & Overrides)


The `agent` object is key to shaping OpenCode’s behaviour. Each property name is an agent ID (e.g. `plan`, `build`, `general`, or any custom label). Values follow the `AgentConfig` schema:

* `model`, `temperature`, `top_p`
* `prompt`: agent-specific system prompt override.
* `tools`: per-tool enable/disable map (`"bash": false`, `"read": true`, etc.).
* `permission`: granular overrides for `edit`, `bash` (string or command map), and `webfetch`.
* `mode`: designate as `"primary"`, `"subagent"`, or `"all"`.
* `description`: human-readable purpose text surfaced in UIs.
* `disable`: hard-disable an agent without removing its entry.

Adding a new key creates a new agent; overriding an existing key updates that agent’s behaviour. The `/agent` endpoint reflects the merged result.

### Global Tool & Permission Controls

* `permission`: repository-wide defaults (`edit`, `bash`, `webfetch`). The `bash` field can be a single string (`"ask"`, `"allow"`, `"deny"`) or a map of command patterns to permissions.
* `tools`: global enable/disable flags for tool IDs. This is the top-level kill-switch for capabilities exposed to agents.

### Provider Definitions

The `provider` object allows custom provider registration or overrides for built-in entries. Each property represents a provider ID with options such as:

* Metadata: `name`, `id`, `api`, `npm`, `env` variables, `options` (e.g. `apiKey`, `baseURL`, `timeout`).
* `models`: dictionary of model IDs, each with metadata (`id`, `name`, release information, capability flags like `attachment`, `reasoning`, `tool_call`, cost structure, token limits, experimental flag, provider-specific options).
* Provider-level timeouts (`timeout`) with numeric (ms) or `false` (no timeout) values.

Use this section to:

* Introduce providers absent from the core distribution (e.g. custom Perplexity definitions).
* Override metadata for existing providers/models (names, limits, pricing).
* Configure alternate endpoints or credentials for private deployments.

After updating providers, `/config/providers` shows the consolidated list seen by clients.

### MCP (Model Context Protocol) Servers

The `mcp` object registers additional MCP servers:

* Local (`type: "local"`): provide a `command` array (binary + args), optional `environment` map, and `enabled` toggle.
* Remote (`type: "remote"`): specify `url`, optional `headers`, and `enabled`.

### Formatter & LSP Configuration

* `formatter`: per-language formatting rules (command array, environment variables, extensions list, disable flag).
* `lsp`: enable/disable per-language servers, command invocation, supported file extensions, environment variables, and initialization options.

### Experimental Hooks & Flags

* `experimental.hook.file_edited`: map of glob patterns to command arrays run after edits.
* `experimental.hook.session_completed`: commands run when a session completes.
* `experimental.disable_paste_summary`: boolean toggle for automatic paste summarisation.

### Deprecated or Auxiliary Fields

* `mode`: legacy agent map kept for backward compatibility (mirrors `agent`).

### Credentials Management (`/auth/{id}`)

Provider definitions can require credentials by naming environment keys in `env`. Set them via `PUT /auth/{id}` with payload matching the `Auth` schema (typically storing API keys). The config entry references the credential by ID.

## Working with the API

### Fetch Current Config

```bash
curl http://localhost:55180/config
```

### Apply Partial Update

```bash
curl -X PATCH http://localhost:55180/config \
  -H "Content-Type: application/json" \
  -d '{
    "theme": "dune-arrakis",
    "agent": {
      "research": {
        "model": "perplexity/sonar-pro",
        "mode": "subagent",
        "description": "Perplexity-backed research assistant",
        "tools": {
          "webfetch": true,
          "bash": false
        }
      }
    },
    "provider": {
      "perplexity": {
        "name": "Perplexity",
        "models": {
          "sonar-pro": {
            "id": "sonar-pro",
            "name": "Sonar Pro",
            "attachment": true,
            "reasoning": false,
            "tool_call": false,
            "cost": { "input": 3, "output": 15 },
            "limit": { "context": 200000, "output": 8192 }
          }
        }
      }
    }
  }'
```

### Operational Considerations

* Changes via `/config` apply immediately on the server. Front-ends should refresh their cached provider/agent lists (e.g. triggering `loadProviders()` and `loadAgents()` in the OpenChamber) to reflect updates without restart.
* Credentials referenced in provider definitions must exist via `/auth/{id}` before the provider becomes usable.
* Custom providers and agents defined in config propagate through the standard listing endpoints (`/config/providers`, `/agent`) once the config update succeeds.

## Summary Checklist

When planning features that depend on runtime configuration, consider:

1. Do we need to toggle tools globally or per agent? (`tools`, `agent[...].tools`, `permission`)
2. Are new agents required? (`agent` entries with prompts, permissions, descriptions)
3. Do providers or models need to be registered/overridden? (`provider` with metadata + models)
4. Are additional commands or MCP integrations required? (`command`, `mcp`)
5. What UI refresh or cache invalidation is necessary post-update? (`loadProviders()`, `loadAgents()` in OpenChamber)

Using `PATCH /config` in combination with `/auth/{id}` and the provider/agent inspection endpoints allows deep runtime customisation without restarting OpenCode.
