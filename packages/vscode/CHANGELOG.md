## [1.6.0] - 2026-01-29

- Added message stall detection with automatic soft resync for more reliable message delivery.
- Fixed "Load older" button in long sessions with proper progressive pagination.
- Session activity status now updates reliably even when the extension panel is hidden or collapsed.


## [1.5.9] - 2026-01-28

- Agent Manager: migrated to Opencode SDK worktree implementation; sessions in worktrees are now completely isolated.
- Agent Manager: worktree setup commands are now persistant per project and automatically saved/restored.


## [1.5.8] - 2026-01-26

- Plans: added new Plan/Build mode switching support.
- Chat: linkable mentions, better wrapping, and markdown/scroll polish in messages.
- Skills: ClawdHub catalog now pages results and retries transient failures.
- Diff: fixed Chrome scrolling in All Files layout.
- Activity: added a text-justification setting for activity summaries (thanks to @iyangdianfeng).
- Performance: faster chat rendering for busy sessions.
- Reliability: file lists and message sends handle missing directories and transient errors more gracefully.


## [1.5.7] - 2026-01-24

- No notable changes


## [1.5.6] - 2026-01-24

- GitHub: added backend support for PRs/issues workflows; UI comes later.


## [1.5.5] - 2026-01-23

- Settings: agent and command overrides now prefer plural directories while still honoring legacy singular folders.
- Skills: installs now target plural directories while still recognizing legacy singular folders.


## [1.5.4] - 2026-01-22

- Apply Patch tool now shows a diff preview for applying patch edits.
- Settings: manage provider configuration files directly from the extension.


## [1.5.3] - 2026-01-20

- Chat: Smoother session switching with more stable scroll anchoring.
- Chat: new Activity view in collapsed state, now shows latest 6 tools by default.
- Chat: Updated accent color derivation to better match editor themes.
- Performance: Faster filesystem/search operations and general stability improvements (thanks to @TheRealAshik).
- Files: adjusted default visibility for hidden/dotfiles to be visible and gitignored entries to be hidden.


## [1.5.2] - 2026-01-17

- Chat: optimized message loading for opening sessions.
- Layout: tuned responsive breakpoint and server readiness timeout for steadier startup.
- Reliability: improved OpenCode process cleanup to reduce orphaned servers.


## [1.5.1] - 2026-01-16

- No notable changes


## [1.5.0] - 2026-01-16

- Improved OpenCode server management to ensure it initializes within the workspace directory.
- Enhanced extension startup with context-aware readiness checks for the current workspace.
- Fixed orphaned OpenCode processes not being cleaned up on restart or exit.
- Session tabs: fixed opening new session in editor tab; title bar button now opens new session tab, sidebar button opens current or new session.
- Layout: added responsive expanded layout showing sessions sidebar + chat side-by-side when extension is wide enough (≥700px).
- Layout: extension now opens to sessions list instead of new session draft.
- Layout: compact header with reduced padding for better space efficiency.
- Settings: hidden Git Identities tab, Git section, and Diff view settings (not applicable to VS Code).
- Settings: hidden project switcher dropdown (VS Code uses workspace).
- Shortcuts: disabled worktree session creation with shortcuts (Ctrl+Shift+N now opens standard session).


## [1.4.9] - 2026-01-14

- Added session editor panel to view sessions alongside files.
- Improved server connection reliability with multiple URL candidate support.
- Upload: increased attachment size limit to 50MB with automatic image compression to 2048px for large files.


## [1.4.8] - 2026-01-14

- Chat: sidebar sessions are now automatically sorted by last updated date (thanks to @vio1ator).
- Chat: fixed edit tool output and added turn duration.
- UI: todo lists and status indicators now hide automatically when all tasks are completed (thanks to @vio1ator).
- Reliability: improved project state preservation on validation failures (thanks to @vio1ator) and refined server health monitoring.
- Stability: added graceful shutdown handling for the server process (thanks to @vio1ator).


## [1.4.7] - 2026-01-10

- Skills: added ClawdHub integration as built-in market for skills.


## [1.4.6] - 2026-01-09

- Switch opencode cli management to SDK.
- Input: removed auto-complete and auto-correction.
- Shortcuts: switched agent cycling shortcut from Shift + TAB to TAB again.
- Chat: added question tool support with a rich UI for interaction.


## [1.4.5] - 2026-01-08

- Chat: added support for model variants (thinking effort).
- Shortcuts: Switched agent cycling shortcut from TAB to Shift + TAB.
- Skills: added autocomplete for skills on "/" when it is not the first character in input.
- Autocomplete: added scope badges for commands/agents/skills.
- Compact: changed /summarize command to be /compact and use sdk for compaction.
- MCP: added ability to dynamically enabled/disabled configured MCP.


## [1.4.4] - 2026-01-08

- Agent Manager / Multi Run: select agent per worktree session (thanks to @wienans).
- Agent Manager / Multi Run: worktree actions to delete group or individual worktrees, or keep only selected one (thanks to @wienans).
- Agent Manager: added "Copy Worktree Path" action in the more menu (thanks to @wienans).
- Worktrees: added session creation flow with loading screen, auto-create worktree setting, and setup commands management.
- Session sidebar: refactoring with unified view for sessions in worktrees.
- Settings: added ability to create new session in worktree by default.
- Chat: fixed IME composition for CJK input to prevent accidental send (thanks to @madebyjun).
- Projects: added multi-project support with per-project settings for agents/commands/skills.
- Event stream: improved SSE with heartbeat management, permission bootstrap on connect, and reconnection logic.
- Model selector: fixed dropdowns not responding to viewport size.


## [1.4.3] - 2026-01-04

- Added Agent Manager panel to run the same prompt across up to 5 models in parallel (thanks to @wienans).
- Added permission prompt UI for tools configured with "ask" in opencode.json, showing requested patterns and "Always Allow" options (thanks to @aptdnfapt).
- Added "Open subAgent session" button on task tool outputs to quickly navigate to child sessions (thanks to @aptdnfapt).
- Improved activation reliability and error handling.


## [1.4.2] - 2026-01-02

- Added timeline dialog (`/timeline` command or Cmd/Ctrl+T) for navigating, reverting, and forking from any point in the conversation (thanks to @aptdnfapt).
- Added `/undo` and `/redo` commands for reverting and restoring messages in a session (thanks to @aptdnfapt).
- Added fork button on user messages to create a new session from any point (thanks to @aptdnfapt).
- Migrated to OpenCode SDK v2 with improved API types and streaming.


## [1.4.1] - 2026-01-02

- Added the ability to select the same model multiple times in multi-agent runs for response comparison.
- Model selector now includes search and keyboard navigation for faster model selection.
- Added revert button to all user messages (including first one).
- Added HEIC image support for file attachments with automatic MIME type normalization for text format files.
- Only show the main Worktree in the Chat Sidebar (thanks to @wienans).
- Terminal: improved terminal performance and stability by switching to the Ghostty-based terminal renderer.


## [1.4.0] - 2026-01-01

- Added the ability to run multiple agents from a single prompt, with each agent working in an isolated worktree.
- Worktrees: new branch creation can start from a chosen base; remote branches are only created when you push.
- Default location is now the right secondary sidebar in VS Code, and the left activity bar in Cursor/Windsurf; navigation moved into the title bar (thanks to @wienans).
- Chat: now shows clearer error messages when agent messages fail.
- Sidebar: improved readability for sticky headers with a dynamic background.


## [1.3.9] - 2025-12-30

- Added skills management to settings with the ability to create, edit, and delete skills.
- Added Skills catalog functionality for discovering and installing skills from external sources.
- Added right-click context menu with "Add to Context," "Explain," and "Improve Code" actions (thanks to @wienans).


## [1.3.8] - 2025-12-29

- Added queued message mode with chips, batching, and idle auto‑send (including attachments).
- Added queue mode toggle to settings (chat section).
- Fixed scroll position persistence for active conversation turns across session switches.
- Refactored Agents/Commands management with ability to configure project/user scopes.


## [1.3.7] - 2025-12-28

- Redesigned Settings as a full-screen view with tabbed navigation.
- ESC key now closes settings.
- Added responsive tab labels in settings header (icons only at narrow widths).
- Improved session activity status handling and message step completion logic.
- Introduced enhanced extension settings with dynamic layout based on width.


## [1.3.6] - 2025-12-27

- Added the ability to manage (connect/disconnect) providers in settings.
- Adjusted auto-summarization visuals in chat.


## [1.3.5] - 2025-12-26

- Improved file search with fuzzy matching capabilities.
- Fixed workspace switching performance and API health checks.
- Improved provider loading reliability during workspace switching.
- Fixed session handling for non-existent worktree directories.
- Added settings for choosing the default model/agent to start with in a new session.


## [1.3.4] - 2025-12-25

- Improved type checking and editor integration.


## [1.3.3] - 2025-12-25

- Fixed startup, more reliable OpenCode CLI/API management, and stabilized API proxying/streaming.
- Added an animated loading screen and introduced command for status/debug output.
- Fixed session activity tracking so it correctly handles transitions through states.
- Fixed directory path handling (including `~` expansion) to prevent invalid paths and related Git/worktree errors.
- Chat UI: improved turn grouping/activity rendering and fixed message metadata/agent selection propagation.
- Chat UI: improved agent activity status behavior and reduced image thumbnail sizes for better readability.


## [1.3.0] - 2025-12-21

- Added revert functionality in chat for user messages.
- Updated user message layout/styling.
- Improved header tab responsiveness.
- Fixed bugs with new session creation when the extension initialized for the first time.
- Adjusted extension theme mapping and model selection view.
- Polished file autocomplete experience.


## [1.2.9] - 2025-12-20

- Session auto‑cleanup feature with configurable retention.
- Optimization for long sessions.


## [1.2.6] - 2025-12-19

- Added write/create tool preview in permission cards with syntax highlighting.
- More descriptive assistant status messages with tool-specific and varied idle phrases.


## [1.2.5] - 2025-12-19

- Polished chat experience for longer sessions.
- Smoother session rename experience.


## [1.2.2] - 2025-12-17

- Agent Task tool now renders progressively with live duration and completed sub-tools summary.
- Unified markdown rendering between assistant messages and tool outputs.
- Reduced markdown header sizes for better visual balance.


## [1.2.1] - 2025-12-16

- Todo task tracking: collapsible status row showing AI's current task and progress.
- Switched "Detailed" tool output mode to only open critical tools (task, edit, write, etc.) for better performance.


## [1.2.0] - 2025-12-15

- Favorite & recent models for quick access in model selection.
- Tool call expansion settings: collapsed, activity, or detailed modes.
- Font size & spacing controls (50-200% scaling) in Appearance Settings.
- Settings page access within extension.


## [1.1.6] - 2025-12-15

- Redesigned password-protected session unlock screen.


## [1.1.5] - 2025-12-15

- Enhanced file attachment features performance.
- Added fuzzy search feature for file mentioning with @ in chat.
- Optimized input area layout.


## [1.1.4] - 2025-12-15

- Flexoki themes for Shiki syntax highlighting for consistency with the app color schema.
- Enhanced extension theming with editor themes.


## [1.1.2] - 2025-12-13

- Moved extension to activity bar (left sidebar).
- Added feedback messages for "Restart API Connection" command.
- Removed redundant commands.
- Enhanced UserTextPart styling.


## [1.1.0] - 2025-12-13

- Added assistant answer fork flow to start new sessions with inherited context.
- Initial VS Code extension release with editor integration: file picker, click-to-open in tool parts.
- Improved scroll performance.
