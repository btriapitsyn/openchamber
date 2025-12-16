# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]


## [1.2.1] - 2025-12-16

- Todo task tracking: collapsible status row showing AI's current task and progress
- Switched "Detailed" tool output mode to only open the 'task', 'edit', 'multiedit', 'write', 'bash' tools for better performance


## [1.2.0] - 2025-12-15

- Favorite & recent models for quick access in model selection
- Tool call expansion settings: collapsed, activity, or detailed modes
- Font size & spacing controls (50-200% scaling) in Appearance Settings
- Settings page access within VSCode extension
Thanks to @theblazehen for contributing these features!


## [1.1.6] - 2025-12-15

- Optimized diff view layout with smaller fonts and compact hunk separators
- Improved mobile experience: simplified header, better diff file selector
- Redesigned password-protected session unlock screen


## [1.1.5] - 2025-12-15

- Enhanced file attachment features performance
- Added fuzzy search feature for file mentioning with @ in chat
- Optimized input area layout


## [1.1.4] - 2025-12-15

- Flexoki themes for Shiki syntax highlighting for consistency with the app color schema.
- Enchanced VSCode extension theming with editor themes
- Fixed mobile view model/agent selection


## [1.1.3] - 2025-12-14

- Replaced Monaco diff editor with Pierre/diffs for better performance
- Added line wrap toggle in diff view with dynamic layout switching (auto-inline when narrow)


## [1.1.2] - 2025-12-13

- Moved VS Code extension to activity bar (left sidebar)
- Added feedback messages for "Restart API Connection" command
- Removed redundant VS Code commands
- Enhanced UserTextPart styling


## [1.1.1] - 2025-12-13

- Adjusted model/agent selection alignment
- Fixed user message rendering issues


## [1.1.0] - 2025-12-13

- Added assistant answer fork flow so users can start a new session from an assistant plan/response with inherited context.
- Added OpenChamber VS Code extension with editor integration: file picker, click-to-open in tool parts
- Improved scroll performance with force flag and RAF placeholder
- Added git polling backoff optimization


## [1.0.9] - 2025-12-08

- Added directory picker on first launch to reduce macOS permission prompts
- Show changelog in update dialog from current to new version
- Improved update dialog UI with inline version display
- Added macOS folder access usage descriptions


## [1.0.8] - 2025-12-08

- Added fallback detection for OpenCode CLI in ~/.opencode/bin
- Added window focus after app restart/update
- Adapted traffic lights position and corner radius for older macOS versions


## [1.0.7] - 2025-12-08

- Optimized Opencode binary detection
- Adjusted app update experience


## [1.0.6] - 2025-12-08

- Enhance shell environment detection


## [1.0.5] - 2025-12-07

- Fixed "Load older messages" incorrectly scrolling to bottom
- Fixed page refresh getting stuck on splash screen
- Disabled devtools and page refresh in production builds


## [1.0.4] - 2025-12-07

- Optimized desktop app start time


## [1.0.3] - 2025-12-07

- Updated onboarding UI
- Updated sidebar styles


## [1.0.2] - 2025-12-07

- Updated MacOS window design to the latest one


## [1.0.1] - 2025-12-07

- Initial public release of OpenChamber web and desktop packages in a unified monorepo.
- Added GitHub Actions release pipeline with macOS signing/notarization, npm publish, and release asset uploads.
- Introduced OpenCode agent chat experience with section-based navigation, theming, and session persistence.
