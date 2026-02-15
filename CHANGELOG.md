# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.3]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.3
[0.1.2]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.2
[0.1.1]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.1
[0.1.0]: https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v0.1.0
