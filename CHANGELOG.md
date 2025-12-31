# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- VS Code extension: reorganized extension location. It is now on the right sidebar for VSCode and on the left for Cursor/Windsurf.
- VS Code extension: Move Navigation Info into the title bar.
- Worktrees now do not create a remote branch by default; only the push action publishes the branch to remote.


## [1.3.9] - 2025-12-30

 - Added skills management to settings with the ability to create, edit, and delete skills (make sure you have the latest OpenCode version for skills support).
- Added Skills catalog functionality for discovering and installing skills from external sources.
- VS Code extension: added right-click context menu with "Add to Context," "Explain," and "Improve Code" actions (thanks to @wienans).


## [1.3.8] - 2025-12-29

- Added Intel Mac (x86_64) support for the desktop application (thanks to @rothnic).
- Build workflow now generates separate builds for Apple Silicon (arm64) and Intel (x86_64) Macs (thanks to @rothnic).
- Improved dev server HMR by reusing a healthy OpenCode process to avoid zombie instances.
- Added queued message mode with chips, batching, and idle auto‑send (including attachments).
- Added queue mode toggle to OpenChamber settings (chat section) with persistence across runtimes.
- Fixed scroll position persistence for active conversation turns across session switches.
- Refactored Agents/Commands management with ability to configure project/user scopes.


## [1.3.7] - 2025-12-28

- Redesigned Settings as a full-screen view with tabbed navigation.
- Added mobile-friendly drill-down navigation for settings.
- ESC key now closes settings; double-ESC abort only works on chat tab without overlays.
- Added responsive tab labels in settings header (icons only at narrow widths).
- Improved session activity status handling and message step completion logic.
- Introduced enchanced VSCode extension settings with dynamic layout based on width.


## [1.3.6] - 2025-12-27

- Added the ability to manage (connect/disconnect) providers in settings.
- Adjusted auto-summarization visuals in chat.


## [1.3.5] - 2025-12-26

- Added Nushell support for operations with Opencode CLI.
- Improved file search with fuzzy matching capabilities.
- Enhanced mobile responsiveness in chat controls.
- Fixed workspace switching performance and API health checks.
- Improved provider loading reliability during workspace switching.
- Fixed session handling for non-existent worktree directories.
- Added Discord links in the about section.
- Added settings for choosing the default model/agent to start with in a new session.


## [1.3.4] - 2025-12-25

- Diff view now loads reliably even with large files and slow networks.
- Fixed getting diffs for worktree files.
- VS Code extension: improved type checking and editor integration.


## [1.3.3] - 2025-12-25

- Updated OpenCode SDK to 1.0.185 across all app versions.
- VS Code extension: fixed startup, more reliable OpenCode CLI/API management, and stabilized API proxying/streaming.
- VS Code extension: added an animated loading screen and introduced command for status/debug output.
- Fixed session activity tracking so it correctly handles transitions through states (including worktree sessions).
- Fixed directory path handling (including `~` expansion) to prevent invalid paths and related Git/worktree errors.
- Chat UI: improved turn grouping/activity rendering and fixed message metadata/agent selection propagation.
- Chat UI: improved agent activity status behavior and reduced image thumbnail sizes for better readability.


## [1.3.2] - 2025-12-22

- Fixed new bug session when switching directories
- Updated Opencode SDK to the latest version


## [1.3.1] - 2025-12-22

- New chats no longer create a session until you send your first message.
- The app opens to a new chat by default.
- Fixed mobile and VSCode sessions handling
- Updated app identity with new logo and icons across all platforms.


## [1.3.0] - 2025-12-21

- Added revert functionality in chat for user messages.
- Polished mobile controls in chat view.
- Updated user message layout/styling.
- Improved header tab responsiveness.
- Fixed bugs with new session creation when the VSCode extension initialized for the first time.
- Adjusted VSCode extension theme mapping and model selection view.
- Polished file autocomplete experience.


## [1.2.9] - 2025-12-20

- Session auto‑cleanup feature with configurable retention for each app version including VSCode extension.
- Ability to update web package from mobile/PWA view in setting.
- A lot of different optimization for a long sessions.


## [1.2.8] - 2025-12-19

- Introduced update mechanism for web version that doesn't need any cli interaction.
- Added installation script for web version with package managed detection.
- Update and restart of web server now support automatic pick-up of previously set parameters like port or password.


## [1.2.7] - 2025-12-19

- Comprehensive macOS native menu bar entries.
- Redesigned directory selection view for web/mobile with improved layout.
- Improved theme consistency across dropdown menus, selects, and command palette.
- Introduced keyboard shortcuts help menu and quick actions menu.


## [1.2.6] - 2025-12-19

- Added write/create tool preview in permission cards with syntax highlighting.
- More descriptive assistant status messages with tool-specific and varied idle phrases.
- Polished Git view layout


## [1.2.5] - 2025-12-19

- Polished chat expirience for longer session.
- Fixed file link from git view to diff.
- Enhancements to the inactive state management of the desktop app.
- Redesigned Git tab layout with improved organization.
- Fixed untracked files in new directories not showing individually.
- Smoother session rename experience.


## [1.2.4] - 2025-12-18

- MacOS app menu entries for Check for update and for creating bug/request in Help section.
- For Mobile added settings, improved terminal scrolling, fixed app layout positioning.


## [1.2.3] - 2025-12-17

- Added image preview support in Diff tab (shows original/modified images instead of base64 code).
- Improved diff view visuals and alligned style among different widgets.
- Optimized git polling and background diff+syntax pre-warm for instant Diff tab open.
- Optomized reloading unaffected diffs.


## [1.2.2] - 2025-12-17

- Agent Task tool now renders progressively with live duration and completed sub-tools summary.
- Unified markdown rendering between assistant messages and tool outputs.
- Reduced markdown header sizes for better visual balance.


## [1.2.1] - 2025-12-16

- Todo task tracking: collapsible status row showing AI's current task and progress.
- Switched "Detailed" tool output mode to only open the 'task', 'edit', 'multiedit', 'write', 'bash' tools for better performance.


## [1.2.0] - 2025-12-15

- Favorite & recent models for quick access in model selection.
- Tool call expansion settings: collapsed, activity, or detailed modes.
- Font size & spacing controls (50-200% scaling) in Appearance Settings.
- Settings page access within VSCode extension.
Thanks to @theblazehen for contributing these features!


## [1.1.6] - 2025-12-15

- Optimized diff view layout with smaller fonts and compact hunk separators.
- Improved mobile experience: simplified header, better diff file selector.
- Redesigned password-protected session unlock screen.


## [1.1.5] - 2025-12-15

- Enhanced file attachment features performance.
- Added fuzzy search feature for file mentioning with @ in chat.
- Optimized input area layout.


## [1.1.4] - 2025-12-15

- Flexoki themes for Shiki syntax highlighting for consistency with the app color schema.
- Enchanced VSCode extension theming with editor themes.
- Fixed mobile view model/agent selection.


## [1.1.3] - 2025-12-14

- Replaced Monaco diff editor with Pierre/diffs for better performance.
- Added line wrap toggle in diff view with dynamic layout switching (auto-inline when narrow).


## [1.1.2] - 2025-12-13

- Moved VS Code extension to activity bar (left sidebar).
- Added feedback messages for "Restart API Connection" command.
- Removed redundant VS Code commands.
- Enhanced UserTextPart styling.


## [1.1.1] - 2025-12-13

- Adjusted model/agent selection alignment.
- Fixed user message rendering issues.


## [1.1.0] - 2025-12-13

- Added assistant answer fork flow so users can start a new session from an assistant plan/response with inherited context.
- Added OpenChamber VS Code extension with editor integration: file picker, click-to-open in tool parts.
- Improved scroll performance with force flag and RAF placeholder.
- Added git polling backoff optimization.


## [1.0.9] - 2025-12-08

- Added directory picker on first launch to reduce macOS permission prompts.
- Show changelog in update dialog from current to new version.
- Improved update dialog UI with inline version display.
- Added macOS folder access usage descriptions.


## [1.0.8] - 2025-12-08

- Added fallback detection for OpenCode CLI in ~/.opencode/bin.
- Added window focus after app restart/update.
- Adapted traffic lights position and corner radius for older macOS versions.


## [1.0.7] - 2025-12-08

- Optimized Opencode binary detection.
- Adjusted app update experience.


## [1.0.6] - 2025-12-08

- Enhance shell environment detection.


## [1.0.5] - 2025-12-07

- Fixed "Load older messages" incorrectly scrolling to bottom.
- Fixed page refresh getting stuck on splash screen.
- Disabled devtools and page refresh in production builds.


## [1.0.4] - 2025-12-07

- Optimized desktop app start time


## [1.0.3] - 2025-12-07

- Updated onboarding UI.
- Updated sidebar styles.


## [1.0.2] - 2025-12-07

- Updated MacOS window design to the latest one.


## [1.0.1] - 2025-12-07

- Initial public release of OpenChamber web and desktop packages in a unified monorepo.
- Added GitHub Actions release pipeline with macOS signing/notarization, npm publish, and release asset uploads.
- Introduced OpenCode agent chat experience with section-based navigation, theming, and session persistence.
