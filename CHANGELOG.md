# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.7]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.7
[0.1.6]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.6
[0.1.3]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.3
[0.1.2]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.2
[0.1.1]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.1
[0.1.0]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.0
