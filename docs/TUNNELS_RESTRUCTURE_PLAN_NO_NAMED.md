# OpenChamber Tunnel Restructure Plan (No `named` Terminology)

## Status / Decision Lock

- This plan supersedes any compatibility with `named` tunnel terminology.
- Keep CLI compatibility for `--try-cf-tunnel` (deprecated alias), per decision.
- Remove `named` mode and `named*` field naming from API/UI/settings/types/docs.
- Canonical modes are:
  - `quick`
  - `managed-remote`
  - `managed-local`

---

## 1) Objectives

1. Introduce provider-capability architecture suitable for future providers.
2. Enforce canonical tunnel terminology across backend/UI/docs.
3. Keep existing tunnel functionality operational for Cloudflare modes.
4. Add provider discovery API for UI/CLI introspection.
5. Keep test suite deterministic and CI-safe (real integration opt-in only).

---

## 2) Non-Goals

- No broad UI redesign beyond tunnel naming/model migration.
- No addition of a second provider in this phase.
- No force-removal of `--try-cf-tunnel` in this phase.

---

## 3) Canonical Domain Contract

### 3.1 Tunnel intents

```ts
type TunnelIntent =
  | 'ephemeral-public'
  | 'persistent-public'
  | 'private-network';
```

### 3.2 Mode contract

```ts
type TunnelMode = 'quick' | 'managed-remote' | 'managed-local';
```

### 3.3 Start request

```ts
interface TunnelStartRequest {
  provider: string; // default "cloudflare"
  mode: TunnelMode;
  intent?: TunnelIntent; // optional validation hint
  configPath?: string | null;
  token?: string | null;
  hostname?: string | null;
  options?: Record<string, unknown>;
}
```

### 3.4 Provider capability descriptor

```ts
interface ProviderModeDescriptor {
  key: string;
  label: string;
  intent: TunnelIntent;
  requires: Array<'token' | 'hostname' | 'configPath' | 'auth'>;
  supports: Array<'customDomain' | 'configFile' | 'sessionTTL' | 'http2' | 'tcp'>;
  stability: 'experimental' | 'beta' | 'ga';
}

interface TunnelProviderCapabilities {
  provider: string;
  modes: ProviderModeDescriptor[];
  defaults?: {
    mode?: string;
    optionDefaults?: Record<string, unknown>;
  };
}
```

---

## 4) Breaking/Compatibility Policy

- Hard remove `named` mode from accepted mode enums.
- Any `mode: "named"` input must return `422` with `code: "mode_unsupported"`.
- Keep `--try-cf-tunnel` CLI alias, map to canonical:
  - `provider=cloudflare`
  - `mode=quick`
- Do not expose `legacyMode` in API responses.
- Do not keep `named*` field aliases in API contract.

---

## 5) Architecture (Target)

```text
packages/web/server/lib/tunnels/
  types.js
  registry.js
  index.js                  // TunnelService
  providers/
    cloudflare.js
```

- `TunnelService` handles normalization, validation, state transitions, provider routing.
- Provider adapters handle implementation specifics.
- `cloudflare-tunnel.js` remains low-level process/runtime adapter called by provider adapter.

---

## 6) API Contract (Target)

### 6.1 Existing endpoints kept

- `GET /api/openchamber/tunnel/check`
- `GET /api/openchamber/tunnel/status`
- `POST /api/openchamber/tunnel/start`
- `POST /api/openchamber/tunnel/stop`

### 6.2 New endpoint

- `GET /api/openchamber/tunnel/providers`
  - Returns provider capability descriptors.

### 6.3 Endpoint rename

- Replace:
  - `PUT /api/openchamber/tunnel/named-token`
- With:
  - `PUT /api/openchamber/tunnel/managed-remote-token`

### 6.4 Canonical status/start fields

- `mode` uses canonical modes only.
- `provider` is always present.
- `providerMetadata` is additive (e.g., config path, resolved host).
- Use `managedRemote*` naming for remote-managed tunnel fields.

---

## 7) Data/Key Rename Plan

Rename all persisted keys and runtime fields:

- `namedTunnelHostname` -> `managedRemoteHostname`
- `namedTunnelToken` -> `managedRemoteToken`
- `namedTunnelPresets` -> `managedRemotePresets`
- `namedTunnelPresetTokens` -> `managedRemotePresetTokens`
- `namedTunnelSelectedPresetId` -> `managedRemoteSelectedPresetId`
- `namedTunnelTokenPresetIds` -> `managedRemoteTokenPresetIds`

Storage file rename:

- `cloudflare-named-tunnels.json` -> `cloudflare-managed-remote-tunnels.json`

(Per decision: no `named` compatibility retention for naming fields.)

---

## 8) UI Migration Plan

Target files:

- `packages/ui/src/components/sections/openchamber/TunnelSettings.tsx`
- `packages/ui/src/lib/desktop.ts`

Required changes:

1. Replace UI mode union from `'quick' | 'named'` to canonical mode union.
2. Rename all `named*` state vars/payload fields to `managedRemote*`.
3. Rename copy:
   - "Named Tunnel" -> "Managed Remote Tunnel".
4. Update request payloads for `/start` and token save endpoint.
5. Ensure active-mode checks compare canonical modes only.

---

## 9) CLI Plan

Keep canonical CLI:

- `--tunnel-provider <provider>`
- `--tunnel-mode <quick|managed-remote|managed-local>`
- `--tunnel-config [path]`
- `--tunnel-token <token>`
- `--tunnel-hostname <hostname>`
- `--tunnel [config.yml]` shorthand (cloudflare + managed-local)

Keep alias:

- `--try-cf-tunnel` (deprecated, still functional)

Update help text:

- Remove all `named` references.

---

## 10) Provider Discovery Response Example

```json
{
  "providers": [
    {
      "provider": "cloudflare",
      "defaults": { "mode": "quick" },
      "modes": [
        {
          "key": "quick",
          "label": "Quick Tunnel",
          "intent": "ephemeral-public",
          "requires": [],
          "supports": ["sessionTTL"],
          "stability": "ga"
        },
        {
          "key": "managed-remote",
          "label": "Managed Remote Tunnel",
          "intent": "persistent-public",
          "requires": ["token", "hostname"],
          "supports": ["customDomain", "sessionTTL"],
          "stability": "ga"
        },
        {
          "key": "managed-local",
          "label": "Managed Local Tunnel",
          "intent": "persistent-public",
          "requires": [],
          "supports": ["configFile", "customDomain", "sessionTTL"],
          "stability": "ga"
        }
      ]
    }
  ]
}
```

---

## 11) Validation/Error Policy

Validation order:

1. Request shape (`provider`, `mode`)
2. Provider exists
3. Mode exists in provider descriptor
4. `intent` (if passed) matches mode intent
5. Required fields for selected mode
6. Runtime dependencies (e.g., cloudflared availability)

Error codes:

- `validation_error`
- `provider_unsupported`
- `mode_unsupported`
- `missing_dependency`
- `startup_failed`

`mode: "named"` MUST return `422 mode_unsupported`.

---

## 12) Tests (Required)

### 12.1 Unit tests

- `types.test.js`
  - canonical mode parsing only
  - no `named` mapping
  - mode/intent validation
- `index.test.js`
  - provider capability routing
  - required option validation per mode
  - mode switch lifecycle behavior

### 12.2 API tests

- `tunnel-api.test.js`
  - `/providers` response shape
  - `/status` canonical fields (`mode`, `provider`)
  - `/start` rejects `mode=named` with `422 mode_unsupported`
  - `/stop` contract
  - keep opt-in real integration test under env gate:
    - `OPENCHAMBER_RUN_CF_INTEGRATION=1`

### 12.3 CLI tests

- parser covers canonical flags + `--try-cf-tunnel` alias mapping.
- precedence rules deterministic.

---

## 13) Documentation Updates

Update:

- `docs/TUNNELS_RESTRUCTURE_PLAN.md`
- `README.md`
- `packages/web/README.md`
- CLI help output in `packages/web/bin/cli.js`

Rules:

- No "named tunnel" phrase anywhere.
- Use "managed-remote" / "managed-local" consistently.
- Mention `--try-cf-tunnel` as deprecated alias only.

---

## 14) Implementation Order (Execution)

1. Types/capabilities contract finalization.
2. Cloudflare provider descriptor upgrade to `modes[]`.
3. Service validation update (mode/intent/required fields).
4. API `/providers` endpoint.
5. Endpoint + field renames from `named*` to `managedRemote*`.
6. UI migration to canonical modes/fields/labels.
7. Test updates + new tests.
8. Docs updates.
9. Full validation:
   - `bun test` (or targeted + full as needed)
   - `bun run type-check`
   - `bun run lint`
   - `bun run build`

---

## 15) Done Criteria

- No `named` mode or `named*` naming remains in codepaths/docs exposed to users.
- Canonical modes only in API/UI/state.
- `/api/openchamber/tunnel/providers` returns Cloudflare capability descriptors.
- `--try-cf-tunnel` still works as deprecated quick alias.
- Tests pass and baseline checks are green.
