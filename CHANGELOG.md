# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.7] - 2026-03-31

### Added
- **Token Usage Display** - Session detail sidebar now shows token usage data from `session.shutdown` events. Compact summary line (requests, total tokens, API duration) with click-to-expand details: per-model breakdown (request count, premium cost, input/output/cache tokens, cache hit ratio), context window distribution (system/conversation/tools tokens), and code changes (+/- lines, files modified).

### Fixed
- **Premium Cost Display** - Token usage cost shown as premium request count (e.g. "3 premium") instead of dollar amounts, matching GitHub Copilot's actual billing model.

## [0.3.6] - 2026-03-20

### Added
- **Tool Timing Display** - Tool start/complete timestamps shown as `HH:mm:ss.mmm` format for precise comparison. Timing precomputed in `getToolGroups` to avoid repeated calls per render cycle.
- **Search: Reasoning Text** - `data.reasoningText` now included in session search fields.
- **Homepage: Persistent Source Filter** - Selected source filter pill restored from `localStorage` across page reloads. Validates restored value against actual pills; falls back gracefully in privacy mode.

### Fixed
- **Tool Timing Accuracy** - Tool execution events now use actual `_startTime`/`_endTime` from execution events instead of parent message timestamp.
- **VS Code Cross-Platform Detection** - Session storage directory now resolved correctly on Windows, Linux, and macOS using `os.platform()`. Falls back to VS Code Insiders path when stable install is not found. Supports `VSCODE_WORKSPACE_STORAGE_DIR` env var for custom setups.
- **Windows Display Path** - Session path display fixed for Windows separators.
- **`.gitignore`** - Updated to correctly exclude `dist/server.min.js` and other generated files.

### Changed
- **Docs** - README and `docs/INSTALLATION.md` updated with per-OS session source paths and all env var overrides (`COPILOT_SESSION_DIR`, `CLAUDE_SESSION_DIR`, `PI_MONO_SESSION_DIR`, `VSCODE_WORKSPACE_STORAGE_DIR`).

## [0.3.5] - 2026-03-13

### Added
- **Backend Bundle** - Server-side code (`server.js` + `src/` + `lib/`) bundled into single minified `dist/server.min.js` via esbuild. npm package no longer ships readable source code.
- **Telemetry: App Version** - Every telemetry event now includes `appVersion` from package.json via Application Insights context tag and telemetry processor.
- **Telemetry: Anonymous User ID** - Persistent UUID v4 stored in `~/.copilot-session-viewer/analytics-id` for anonymous user identification across sessions.
- **Vendor Libraries** - Frontend dependencies (Vue 3.5.30, marked 17.0.4, DOMPurify 3.3.3, vue-virtual-scroller 2.0.0-beta.8) served locally from `public/vendor/` instead of CDN. Fully offline-capable.

### Changed
- **npm Package** - Reduced from 44 to 18 files (168 kB). No `src/` or `lib/` source files in package; only minified bundles, views, and vendor libs shipped.
- **Build Pipeline** - `npm run build` now builds both frontend and backend bundles.
- **ESLint** - Added `public/vendor/**` and `dist/*.map` to ignore patterns.

### Fixed
- **Source Map Leak** - `dist/*.map` files excluded from git and npm package.

## [0.3.4] - 2026-03-13

### Fixed
- **npm Package Size** - Switched from `.npmignore` to `package.json` `files` whitelist; package reduced from 113 files to 36 files (101 kB). Removed coverage reports, test files, dev configs, and source frontend files from published package.

## [0.3.3] - 2026-03-13

### Added
- **Frontend Build Pipeline** - esbuild-based build system (`scripts/build.mjs`) extracts inline JS from EJS templates into standalone minified bundles
- **Application Insights Telemetry** - Backend telemetry via `applicationinsights@2.9.8` (11 custom events, 3 metrics); frontend telemetry via CDN SDK (13 interaction events)
- **Browser Telemetry Snippet** - `views/telemetry-snippet.ejs` partial for consistent frontend telemetry injection
- **Tarball Verification in CI** - E2E tests now run against `npx`-installed tgz package, verifying the published artifact works end-to-end
- **npm Publish Smoke Test** - Pre-publish step installs tgz, starts server, and verifies HTTP 200

### Changed
- **Frontend Architecture** - 4642 lines of inline JS extracted from 3 EJS templates into 4 standalone bundles (net -3370 lines)
  - `src/frontend/homepage.js` → `public/js/homepage.min.js` (9.7K)
  - `src/frontend/session-detail.js` → `public/js/session-detail.min.js` (45.5K)
  - `src/frontend/time-analyze.js` → `public/js/time-analyze.min.js` (54.6K)
  - `src/frontend/telemetry-browser.js` → `public/js/telemetry-browser.min.js` (1.5K)
- **Server Data Bridge** - EJS templates pass server data to external bundles via `window.__PAGE_DATA`
- **CI Pipeline** - E2E tests run against packed tgz via `npx` (not source); telemetry disabled in all CI steps
- **npm Package** - Source files (`src/frontend/`) excluded via `.npmignore`; only `.min.js` bundles shipped

### Fixed
- **Missing Runtime Dependency** - `adm-zip` moved from devDependencies to dependencies (was causing `MODULE_NOT_FOUND` when installed from npm)
- **ESLint Config** - Added frontend globals (Vue, marked, DOMPurify), excluded `public/js/*.min.js` from linting, fixed unused vars and eqeqeq warnings

## [0.3.2] - 2026-03-08

### Fixed
- **VSCode Session Duration** - Duration now uses the last `terminalCommandState.timestamp` (when the agent actually executed a command) instead of a `toolCount × 3500ms` heuristic. Long-running agentic sessions that span multiple hours are now measured correctly
- **VSCode Multi-Workspace Dedup** - `_findVsCodeSession` now collects candidates from all matching workspace hashes and returns the one with the latest effective end time (most complete data), instead of returning the first match found
- **Session `createdAt` in CI** - `Session.fromDirectory` now reads `startTime`/`endTime` from `workspace.yaml` (in addition to `created_at`/`updated_at`), fixing `createdAt` being undefined in environments where `stats.birthtime` is unavailable

### Refactored
- **`_buildVsCodeSession()`** - Extracted shared VSCode session construction logic into a single method used by both the main scan loop and `_findVsCodeSession`, eliminating duplicate `effectiveEnd2`/`toolCount2` variables

## [0.3.1] - 2026-03-07

### Fixed
- **Session Deduplication** - VSCode sessions with the same ID across multiple workspaces are now deduplicated (keeps most recently updated)
- **WIP Status Accuracy** - VSCode agentic sessions now also check file mtime for WIP detection; threshold increased from 5 to 15 minutes
- **Timeline Bar Positioning** - UserReq rows with 0 tools no longer render at the start of the timeline
- **Tag Isolation** - Tags now use filePath-based storage to prevent shared directory collisions (Claude, Pi-Mono, Copilot CLI)
- **Per-Session Insight Files** - Agent review files use `{sessionId}.agent-review.md` naming to avoid collisions
- **Export All Sources** - Session export works for all sources including VSCode; file-based exports include `.tags.json`
- **Inline References in Markdown** - VSCode `inlineReference` items (file/folder links) now rendered as code references instead of being silently dropped, fixing broken markdown tables

### Performance
- **60s Cache + Request Dedup** - `SessionRepository.findAll()` results cached for 60 seconds with concurrent request deduplication, reducing TTFB from ~11s to <100ms on cache hit

## [0.3.0] - 2026-03-07

### Added
- **VSCode Copilot Chat Support** - Full support for VSCode Copilot Chat sessions as a new source (`vscode`)
  - Session cards show model badge + repo basename
  - Copilot Chat extension version badge
  - WIP badge for active sessions
  - SubAgent name badges on assistant messages (replaces generic ASSISTANT badge)
  - UserReq rows in Gantt timeline
  - Turn divider shows start time + duration
- **Dynamic Source Path Hints** - Clicking filter pills shows the source directory path (cross-platform)
- **Multi-Tool Branding** - Homepage wording updated to reflect multi-tool support (Copilot CLI, Claude Code, Pi-Mono, Copilot Chat)

### Changed
- **Source Display Names** - `copilot` → "Copilot CLI", `vscode` → "Copilot Chat"
- **Session Info Layout** - Shows Model + Repo basename instead of CWD hash path
- **Tool Input Display** - URI objects simplified to filename only; edits collapsed to count
- **Tool Call Width** - Truncation increased to 200 chars with flex-wrap
- **SubAgent Badge** - Shows name only (no emoji prefix)
- **System Messages** - System-sourced `user.message` converted to `system.notification` type with SYSTEM badge

### Fixed
- Claude `tool_result` user messages filtered from display
- VSCode parser: `resultDetails` iteration crash, request timestamps for subagent events
- VSCode subagent dedup by `subAgentId` instead of name
- VSCode `findById` uses `selectedModel` + `resolveWorkspacePath`
- VSCode duration estimation fix
- Session detail repo dedup, skill table width
- SESSION INFO duplicate Model/label
- SubAgent badge uses `agentName` from `toolSpecificData`
- Source path hints from server (cross-platform Windows/macOS/Linux)

## [0.2.7] - 2026-03-05

### Added
- **Session Tagging** - Add, remove, and filter sessions by custom tags from the session list and detail pages
- **Unit Tests for Tagging** - 70 new tests covering `tagService` and `tagController` (608 total)
- **E2E Tests for Tagging** - Playwright tests covering tagging API and UI flows

## [0.2.6] - 2026-03-05

### Fixed
- **304 Caching on Live Sessions** - Disabled ETag on events API (`Cache-Control: no-store`) so active/WIP sessions always return fresh data on page refresh
- **Updated Time Inaccuracy** - Session detail page now shows last event timestamp as "Updated" time instead of file mtime
- **E2E CI Stability** - `#loading-indicator` is always in DOM regardless of session count; removed conditional session count check that caused false negatives

## [0.2.5] - 2026-03-04

### Fixed
- **Flaky Unit Tests** - Upload directory now isolated per test via `UPLOAD_DIR` env var to prevent cross-test pollution
- **Timing Variance in Tests** - `ageMs` threshold relaxed from `>= 0` to `>= -100` to tolerate clock precision on fast CI runners

## [0.2.4] - 2026-03-04

### Fixed
- **E2E Skip on Empty Environment** - Tests now skip gracefully when no sessions exist in CI (no `~/.copilot/session-state/` data)
- **VSCode Filter Pill** - Temporarily hidden in UI (feature in progress)

## [0.2.3] - 2026-03-04

### Fixed
- **Lint Errors** - Fixed unused variable warnings in `vscode-parser.js` (`canParse`, `agentName`, `itemIdx`) and `sessionRepository.js` (unused `VsCodeParser` import)
- **Stale Unit Tests** - Updated test expectations to match current API signatures (`getPaginatedSessions(1, 20, "copilot")`)

## [0.2.2] - 2026-02-27

### Fixed
- **ETag Cache Bug** - `session.updated`/`session.created` field name typo (should be `updatedAt`/`createdAt`) caused ETag to always be `md5("sessionId-undefined")`, resulting in permanent 304 Not Modified responses — frontend never saw new events for WIP sessions

## [0.2.1] - 2026-02-25

### Changed
- `.nyc_output/` and `coverage/` directories now properly ignored in `.gitignore`

### Removed
- NYC coverage intermediate files (`.nyc_output/`, 1.6 MB) from repository
- Removed 28 coverage data files that should not be committed

### Docs
- Translated `lib/parsers/README.md` from Chinese to English for international contributors

## [0.2.0] - 2026-02-25

### Added
- **Multi-Tool Support** - Full support for **Pi-Mono** sessions (now supports 3 tools: Copilot CLI, Claude Code, Pi-Mono)
- **Agent Review for All Tools** - AI-powered session analysis now works for all 3 supported tools
- **Pi-Mono Parser** - New `PiMonoSessionParser` with full strategy pattern implementation
- **Unified Event Format** - All 3 tools now use consistent event schema across backend and frontend
- **Backend-Generated Display Metadata** - Badge labels, source names, and display data generated in backend for consistency

### Changed
- **Default Filter to Copilot** - Homepage now defaults to Copilot filter instead of "All" (matches user behavior)
- **Removed "All" Filter** - Simplified UI by removing the "All" filter option
- **Type Transformation Strategy** - Backend now transforms event types for unified schema (Pi-Mono `message` → `assistant.message`)
- **Tool Result Merging** - Pi-Mono tool results now properly merged into parent assistant messages
- **Badge Logic Moved to Backend** - Frontend no longer generates badge labels (single source of truth)

### Fixed
- **Pi-Mono Agent Review Accuracy** - Fixed incorrect session data by explicitly specifying target file in prompt
- **Timeline Rendering for Old Copilot Sessions** - Old CLI format now properly expands to `assistant.message` events for timeline
- **Architecture Consistency** - Unified type transformation across all sources (no more "按了葫芦起了瓢")
- **CI Upload Directory Race Condition** - Tests now create directories defensively before file operations
- **Event Expansion Test Coverage** - Tests now verify `assistant.message` generation (frontend dependency)

### Docs
- **README Multi-Tool Emphasis** - Updated subtitle and descriptions to highlight multi-tool support
- **lib/parsers Documentation** - Translated Chinese README to English for international contributors
- **Project Cleanup** - Removed backup files (`time-analyze-v2.ejs`, `*.bak`) and 30 failed E2E test screenshot directories

### Performance
- **Agent Review Session Isolation** - Simplified from temporary directory approach to prompt-based file specification (6 lines vs 58 lines)

### Architecture
- **Strategy Pattern Complete** - All 3 parsers follow unified `BaseSessionParser` interface
- **Backend Normalization** - `eventNormalizer.js` handles all format differences, frontend renders uniformly
- **No Frontend Source Checks** - Frontend doesn't check `source` field, only renders normalized data

## [0.1.7] - 2026-02-16

### Changed
- WIP status badge moved from sidebar info table to inline with the page title on session detail page, matching the time analysis page's pattern for better visibility and consistency

### Fixed
- npm provenance signing now explicitly checks out the release tag so the `SourceRepositoryRef` is available during `npm publish --provenance`

### Docs
- Added screenshots to README (homepage, session detail, time analysis)
- Sensitive info (session IDs, workspace paths, repo names) masked in screenshots
- Switched screenshot references to absolute GitHub raw URLs for npmjs.org compatibility
- Removed broken placeholder image and hardcoded version from README

## [0.1.6] - 2026-02-16

### Added
- "Copy as Mermaid Gantt" button on analysis timeline for easy sharing
- Sub-Agents summary card with status breakdown (completed/failed/incomplete), wall-clock time, and tool counts
- WIP session status indicator — sessions without `session.end` and recent activity show a 🔄 WIP badge
- WIP session cards highlighted with amber border on homepage

### Fixed
- Subagent Gantt chart links now navigate to the correct occurrence when the same subagent runs multiple times
- Total subagent duration no longer exceeds session duration (overlapping intervals are now merged)
- Subagent tool counts no longer double-count tools from nested subagents
- Mermaid sanitize function hardened against backtick/newline injection
- ESLint errors in `insightService.js` (emoji regex `u` flag, regex double-spaces)
- ESLint error in `sessionRepository.js` (strict equality check)
- Unit test `session.test.js` updated for `sessionStatus` field
- E2E API response time thresholds relaxed for CI environments

### Performance
- Created shared `sortedEvents` computed property — eliminated 7 redundant O(n log n) array sorts
- Optimized subagent tool counting with merged intervals and binary search (O(n log k) down from O(m×n))

## [0.1.5] - 2026-02-16

### Fixed
- EPIPE crash when copilot process exits before events file is fully piped to stdin
- Server no longer crashes with uncaught exception during concurrent insight generation

## [0.1.4] - 2026-02-16

### Fixed
- Rate limiting configuration for insight operations - resolved 429 "Too Many Requests" errors
- Removed rate limiting from insight status checks (GET requests) - status checks are now unlimited
- Improved rate limiting differentiation: strict for generation (POST), lenient for access (DELETE)
- Fixed "Age: NaNs" timestamp display issue in insight generation progress
- Added missing `ageMs` calculation to backend insight service responses
- ESLint configuration migration from deprecated `.eslintignore` to modern flat config
- Minimal `.npmignore` configuration for optimized package publishing (82% size reduction)

### Changed
- Insight output file renamed from `insight-report.md` to `copilot-insight.md`
- Insight prompt rewritten to enforce ≤500 character output (down from ~2000 words)
- Insight now focuses on three essentials: health score, top issue, key recommendation
- Insight generation rate limiting: 3 requests per 5 minutes (more user-friendly window)
- Insight access operations: 50 requests per minute (very lenient for status checks)
- Package size optimized from 298kB to 52kB for npm publishing

### Removed
- Deprecated `.eslintignore` file in favor of `eslint.config.mjs` ignores property
- Verbose `.npmignore` entries - simplified to essential exclusions only

## [0.1.3] - 2026-02-16

### Added
- Infinite scroll functionality for homepage session list
- "Load More Sessions" button for manual session loading
- Seamless scroll-triggered loading when approaching bottom of page
- API endpoint `/api/sessions/load-more` for paginated session loading
- Comprehensive e2e test suite expansion (45 total tests, up from 17)
- New test files: `api-pagination.spec.js`, `infinite-scroll.spec.js`, `core-functionality.spec.js`

### Changed
- Replaced traditional pagination with infinite scroll on homepage
- Homepage now loads initial 20 sessions instead of all sessions
- Session count display removed from homepage for cleaner UI
- Updated JavaScript to handle dynamic session loading and rendering

### Removed
- Session count display "(showing X of Y)" from homepage header
- Unused logger utility (`src/utils/logger.js`) - dead code cleanup
- Pagination parameters from homepage (legacy support maintained in API)

### Fixed
- Updated unit tests to reflect infinite scroll functionality
- Improved performance for sites with large numbers of sessions
- Memory usage optimization by loading sessions progressively
- E2E test reliability improvements - achieved 100% pass rate (45/45 tests)
- Fixed selector issues in session detail page tests
- Improved test resilience with better error handling and fallback selectors

## [0.1.2] - 2026-02-15

### Fixed
- Content Security Policy configuration (removed unsafe-inline and unsafe-eval)
- Missing repository URL in README installation instructions
- Version inconsistencies across documentation files

### Added
- Session pagination support for better performance with large session counts
- API endpoint pagination with backward compatibility

## [0.1.1] - 2026-02-15

### Internal
- Project improvements and bug fixes

## [0.1.0] - 2026-02-15

### Added
- Initial release of Copilot Session Viewer
- Web UI for viewing GitHub Copilot CLI session logs
- Session list with search, filtering, and sorting
- Detailed session view with Vue 3 and virtual scrolling
- Time analysis view with sub-agents, turns, and tool breakdown
- Copilot Insight feature (AI-generated analysis)
- Model badge colors (Claude, GPT, Gemini)
- E2E and unit test coverage (17 Playwright + 20 Jest tests)
- AGENTS.md for AI coding agents
- Security headers (Helmet.js)
- Rate limiting for uploads
- Compression middleware

### Security
- Input validation for session IDs
- XSS prevention with proper escaping
- CORS restricted to localhost
- File upload size limits (50MB)

[0.2.6]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.2.6
[0.2.5]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.2.5
[0.2.4]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.2.4
[0.2.3]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.2.3
[0.1.7]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.7
[0.1.6]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.6
[0.1.3]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.3
[0.1.2]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.2
[0.1.1]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.1
[0.1.0]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.0
