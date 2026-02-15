# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-15

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

[1.0.0]: https://github.com/yourusername/copilot-session-viewer/releases/tag/v1.0.0
