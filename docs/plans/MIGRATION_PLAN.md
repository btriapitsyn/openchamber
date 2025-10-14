# Tauri Migration Plan

## 1. Snapshot

- Frontend: React 19/Vite UI served by Express in production or Vite dev server during development.
- Server: Express gateway on port 3000 (configurable) managing static assets, config/git endpoints, and OpenCode process lifecycle.
- Backend: OpenCode core CLI launched as child process, dynamic port with auto-detection and SDK-managed SSE streaming (AsyncGenerator via `@opencode-ai/sdk` 0.15.0).
- Desktop target: Future Tauri shell embedding the same UI, reusing RPC inventory for native bridges.

```ascii
React 19 Web UI (Vite dev :5173 / Prod dist)
                   │
                   │ (HTTP/S)
                   ▼
        +-------------------------------+
        | Express Gateway (port 3000)  |
        |  • Serves static dist        |
        |  • Config & git endpoints    |
        |  • Manages OpenCode process  |
        +---------------+---------------+
                        │ proxy /api (dynamic port)
                        ▼
            +-----------------------------+
            | OpenCode Core Process       |
            |  • REST + SSE API           |
            |  • Child process (spawned)  |
            +-----------------------------+
```

## 2. Collaboration Model & Phase 0

### Collaboration Model
- **Bohdan (Senior DevOps TL)** – boots the OpenCode API, executes manual verification, and runs the production-grade commands (`openchamber stop; mise exec -- ...`) after each wave.
- **Assistant (developer)** – owns technical decisions, ships implementations, maintains code quality, and keeps documentation up to date.
- Sessions are isolated; every wave reintroduces the prerequisites needed to resume work from scratch, aside from respecting order.
- Automated testing is currently out of scope; Bohdan’s acceptance runs are the validation authority.

### Phase 0 – Minimal Intervention

**Readiness Steps**
1. Verify dependencies: `npm install`.
2. Produce a production bundle to confirm baseline health: `npm run build`.
3. Document expected REST behaviour (health, config, git) using the endpoint inventory and latest responses gathered from Bohdan’s environment.
4. Prepare a concise verification guide for Bohdan (expected responses, command list) so he can run his remote checks.

**Acceptance Criteria**
- `npm run build` completes without errors.
- Expected REST responses are documented (based on the live environment Bohdan will run) and shared with him for verification.
- Collaboration loop confirmed: Bohdan can run his tests independently and report the outcome.

## 3. Endpoint Inventory

Top 10 sample (full list in [endpoint-inventory.json](../../endpoint-inventory.json)):

| Method | Path | Category | Priority | RPC Mapping | Notes |
|---|---|---|---|---|---|
| `GET` | `/health` | system | high | `system.getHealth` | Health probe for Tauri wrapper and external monitors. |
| `GET` | `/api/openchamber/models-metadata` | misc | medium | `openchamber.getModelsMetadata` | Fetches remote metadata with 5m cache and 8s timeout. |
| `GET` | `/api/config/agents/:name` | agents | high | `config.getAgent` | Reads metadata from agent markdown and opencode.json. |
| `POST` | `/api/config/agents/:name` | agents | high | `config.createAgent` | Creates markdown + updates opencode config, then restarts OpenCode. |
| `PATCH` | `/api/config/agents/:name` | agents | high | `config.updateAgent` | Field-aware merge with markdown/opencode.json plus OpenCode restart. |
| `DELETE` | `/api/config/agents/:name` | agents | high | `config.deleteAgent` | Removes agent files/config and restarts OpenCode. |
| `GET` | `/api/config/commands/:name` | config | high | `config.getCommand` | Inspects command markdown/opencode.json presence. |
| `POST` | `/api/config/commands/:name` | config | high | `config.createCommand` | Creates command resources then triggers OpenCode restart. |
| `PATCH` | `/api/config/commands/:name` | config | high | `config.updateCommand` | Updates markdown/opencode.json per field and restarts OpenCode. |
| `DELETE` | `/api/config/commands/:name` | config | high | `config.deleteCommand` | Removes command resources and restarts OpenCode. |

## 4. RPC Spec

All planned Tauri invoke endpoints (full JSON in [tauri-rpc-spec.json](../../tauri-rpc-spec.json)):

| Method | Params | Returns | HTTP Source | Streaming |
|---|---|---|---|---|
| `system.getHealth` | – | HealthStatus | `GET /health` | No |
| `openchamber.getModelsMetadata` | – | ModelsMetadata | `GET /api/openchamber/models-metadata` | No |
| `config.getAgent` | path: name: string | AgentSourceSummary | `GET /api/config/agents/:name` | No |
| `config.createAgent` | path: name: string; body: AgentWritePayload | ReloadResponse | `POST /api/config/agents/:name` | No |
| `config.updateAgent` | path: name: string; body: AgentWritePayload | ReloadResponse | `PATCH /api/config/agents/:name` | No |
| `config.deleteAgent` | path: name: string | ReloadResponse | `DELETE /api/config/agents/:name` | No |
| `config.getCommand` | path: name: string | CommandSourceSummary | `GET /api/config/commands/:name` | No |
| `config.createCommand` | path: name: string; body: CommandWritePayload | ReloadResponse | `POST /api/config/commands/:name` | No |
| `config.updateCommand` | path: name: string; body: CommandWritePayload | ReloadResponse | `PATCH /api/config/commands/:name` | No |
| `config.deleteCommand` | path: name: string | ReloadResponse | `DELETE /api/config/commands/:name` | No |
| `config.reloadOpenCode` | – | ReloadResponse | `POST /api/config/reload` | No |
| `gitIdentities.list` | – | GitIdentity[] | `GET /api/git/identities` | No |
| `gitIdentities.create` | body: GitIdentityWritePayload | GitIdentity | `POST /api/git/identities` | No |
| `gitIdentities.update` | path: id: string; body: GitIdentityUpdatePayload | GitIdentity | `PUT /api/git/identities/:id` | No |
| `gitIdentities.delete` | path: id: string | GenericSuccess | `DELETE /api/git/identities/:id` | No |
| `git.getGlobalIdentity` | – | Record<string, string \| null> | `GET /api/git/global-identity` | No |
| `git.checkRepository` | query: directory: string | { isGitRepository: boolean } | `GET /api/git/check` | No |
| `git.getCurrentIdentity` | query: directory: string | Record<string, string \| null> | `GET /api/git/current-identity` | No |
| `git.setIdentity` | query: directory: string; body: GitIdentityApplyPayload | { success: true; profile: GitIdentity } | `POST /api/git/set-identity` | No |
| `git.getStatus` | query: directory: string | GitStatus | `GET /api/git/status` | No |
| `git.pull` | query: directory: string; body: GitRemoteOptions | Record<string, unknown> | `POST /api/git/pull` | No |
| `git.push` | query: directory: string; body: GitRemoteOptions | Record<string, unknown> | `POST /api/git/push` | No |
| `git.fetch` | query: directory: string; body: GitRemoteOptions | Record<string, unknown> | `POST /api/git/fetch` | No |
| `git.commit` | query: directory: string; body: GitCommitPayload | Record<string, unknown> | `POST /api/git/commit` | No |
| `git.listBranches` | query: directory: string | Record<string, unknown> | `GET /api/git/branches` | No |
| `git.createBranch` | query: directory: string; body: GitBranchCreatePayload | Record<string, unknown> | `POST /api/git/branches` | No |
| `git.checkoutBranch` | query: directory: string; body: GitCheckoutPayload | Record<string, unknown> | `POST /api/git/checkout` | No |
| `git.listWorktrees` | query: directory: string | GitWorktreeEntry[] | `GET /api/git/worktrees` | No |
| `git.addWorktree` | query: directory: string; body: GitWorktreeCreatePayload | Record<string, unknown> | `POST /api/git/worktrees` | No |
| `git.removeWorktree` | query: directory: string; body: GitWorktreeRemovePayload | GenericSuccess | `DELETE /api/git/worktrees` | No |
| `git.getLog` | query: directory: string, maxCount: number?, from: string?, to: string?, file: string? | GitLogResponse | `GET /api/git/log` | No |
| `fs.mkdir` | body: MkdirPayload | GenericSuccess | `POST /api/fs/mkdir` | No |

## 5. Self-Contained Migration Waves

| Wave | Goal | Key Changes | Success Criteria | Risks |
|---|---|---|---|---|
| W1 | Bootstrap the Tauri shell with the current UI | Create `src-tauri/`, point the WebView at the local `dist`, add an invoke handler for `system.getHealth`, document Bohdan’s verification flow | `npm run tauri:dev` launches a functional desktop shell; Bohdan runs his pipeline successfully | macOS signing prerequisites; desktop vs browser behaviour drift |
| W2 | Move agent/command configuration to RPC | Implement invoke handlers for `config.*`, refactor zustand hooks to use `invoke`, update Bohdan’s checklist | Agent/command CRUD flows run inside Tauri without HTTP fetches; Bohdan confirms via remote testing | Concurrent edits from multiple clients; coordinating OpenCode restarts |
| W3 | Port git tooling to RPC | Add invoke handlers for `git.*` and `fs.mkdir`, adjust UI to surface progress/errors, prepare a repo test guide for Bohdan | Git operations (status/pull/push/commit/log) run from Tauri; Bohdan validates the workflow | Long-running git commands blocking the main thread; credential prompts in sandbox |
| W4 | Remove Express proxy usage in the desktop build | Call OpenCode SDK/CLI directly from Tauri, surface the SDK AsyncGenerator stream through a native bridge, provide Bohdan with a new validation script | Desktop client streams chat without the HTTP proxy; Bohdan signs off on stability | Recreating streaming semantics; maintaining acceptable resource usage |
| W5 | Finalize release packaging | Integrate auto-updates and crash reporting, produce signed/notarized artifacts, deliver Bohdan a release checklist | Signed and notarized DMG ready for distribution; Bohdan executes the final pipeline and approves release | Apple notarization lead time; certificate and export-compliance hurdles |

## 6. Dev→Build→Release & Acceptance Flow

### Development
- Install prerequisites: Rust toolchain (`rustup toolchain install stable`), Tauri CLI (`cargo install tauri-cli`), Node 20+.
- Add script once scaffolded: `npm run tauri:dev` → proxies Vite dev server into Tauri (`tauri dev -- --port 1420`).
- Use environment parity by setting `OPENCODE_PORT` or allow auto-discovery; tail logs via `npm run start -- --verbose`.

### Build
- Produce production assets: `npm run build`.
- Bundle desktop app: `npm run tauri build -- --target universal-apple-darwin`.
- Verify embedded dist served by Tauri via `./src-tauri/target/universal-apple-darwin/release/openchamber.app`.

### Release & Notarization
- Set signing env vars: `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `TAURI_PRIVATE_KEY`.
- Sign binary: `codesign --deep --force --options runtime --sign "Developer ID Application: <Team>" <app_path>`.
- Notarize: `xcrun notarytool submit <dmg> --apple-id $APPLE_ID --team-id <TEAM> --password $APPLE_PASSWORD --wait`.
- Staple ticket: `xcrun stapler staple <app_or_dmg>`.
- Publish via internal channel (e.g., GitHub Releases) and update auto-updater feed.

### Acceptance Flow
- After each wave I provide Bohdan with a succinct status update plus any run instructions.
- Bohdan executes the remote acceptance pipeline `openchamber stop; mise exec -- npm uninstall -g openchamber && npm run build:package && npm pack && mise exec -- npm install -g ./openchamber-1.0.0.tgz && openchamber --port 3001 --daemon`.
- Results are recorded in the active session; if fixes are needed I deliver them and restart the loop.
