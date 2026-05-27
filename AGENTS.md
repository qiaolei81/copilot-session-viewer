# AGENTS.md

## Project overview
Web UI for viewing and analyzing AI coding-agent session logs (GitHub Copilot CLI, Claude Code, Pi-Mono, VSCode, Modernize). Built with Express.js backend and a Vue 3 SPA frontend (Vite + Pinia + Vue Router).

## Setup commands
- Install deps: `npm install`
- Start server: `npm start`
- Dev mode (auto-reload): `npm run dev`
- Run all tests: `npm run test:all`
- Lint code: `npm run lint`
- Fix lint issues: `npm run lint:fix`

## Code style
- JavaScript (Node.js 22+)
- Single quotes for strings
- No unused variables (prefix with `_` if intentionally unused in catch blocks)
- Error handling: always include `{ cause }` when re-throwing errors
- ESLint enforced (no errors, warnings acceptable)

## File structure
```
server.js                          # Entry: telemetry init + app.listen
src/
  server/
    app.js                         # Express app factory (middleware, routes)
    config.js                      # Configuration constants
    telemetry.js                   # App Insights init (must load first)
    controllers/                   # Route handlers (session, dir, tag, insight, upload, ...)
    middleware/                    # Express middleware (rate limit, validation, ...)
    services/                      # sessionService, sessionRepository, insightService,
                                   #   eventNormalizer, dirRegistryService, tagService, ...
    adapters/                      # Per-source session adapters (Copilot, Claude, Pi-Mono,
                                   #   VSCode, Modernize) — extend BaseSourceAdapter
    models/                        # Session domain model
    schemas/                       # Zod schemas (unified event schema)
    utils/                         # fileUtils, helpers, processManager, sourceMapping
  client/                          # Vue 3 SPA (built by Vite, served from dist/client)
    main.js, App.vue
    router/                        # Vue Router (hash mode)
    stores/                        # Pinia stores
    api/                           # fetch wrappers
    views/                         # Route-level views (HomeView, SessionView, TimeAnalyzeView)
    components/                    # Reusable components (home/, session/, time-analyze/)
    utils/, styles/
lib/parsers/                       # Legacy parser stack used by ClaudeAdapter via ParserFactory
__tests__/                         # Jest unit tests
__tests__/e2e/                     # Playwright e2e tests
__tests__/fixtures/sessions/       # Synthetic CLI-generated session fixtures (E2E_USE_FIXTURES=1)
public/                            # Static assets served by Express
dist/                              # Vite build output (client/) + bundled server.min.js
index.html                         # Vite entry HTML
vite.config.js                     # Vite config (Vue plugin, build targets)
```

## Testing instructions
- **Unit tests**: `npm test` (Jest)
- **E2E tests**: `npm run test:e2e` (Playwright)
- **Coverage**: `npm run test:coverage`
- Always run `npm run lint` before committing
- E2E tests expect server running on port 3838
- Tests use `~/.copilot/session-state/` by default

## Common tasks

### Adding a new route
1. Add route handler in `src/server/controllers/<area>Controller.js` (create if new area)
2. Wire it up in `src/server/app.js`
3. If user-facing, add a Vue view in `src/client/views/` and route in `src/client/router/`
4. Add E2E test in `__tests__/e2e/`
5. Update README if user-facing

### Modifying session parsing
1. Edit the relevant adapter in `src/server/adapters/` or shared logic in `src/server/services/sessionService.js` / `eventNormalizer.js`
2. Run unit tests: `npm test`
3. Test with real sessions from `~/.copilot/session-state/` (or set `COPILOT_SESSION_DIR`)

### UI changes
- Vue components live under `src/client/components/` (home/, session/, time-analyze/)
- Route-level views: `src/client/views/`
- State: Pinia stores in `src/client/stores/`
- Dev mode: `npm run dev` (Vite HMR + Express auto-reload)

## Important constraints

### Security
- No authentication (local-only tool)
- Helmet.js for basic security headers
- Rate limiting on upload endpoint
- Input validation on file paths
- CORS restricted to localhost origins

### Dependencies
- **copilot CLI** must be in PATH (used by insightService)
- Node.js 22+ (uses native fetch, improved performance)
- Session files: auto-detected per source and OS (see docs/INSTALLATION.md); override via `COPILOT_SESSION_DIR`, `CLAUDE_SESSION_DIR`, `PI_MONO_SESSION_DIR`, `VSCODE_WORKSPACE_STORAGE_DIR`, `MODERNIZE_SESSION_DIR` env vars (`SESSION_DIR` is a legacy alias for Copilot CLI)

### Performance
- Session list caches for 30 seconds
- Virtual scrolling for large event lists (vue-recycle-scroller)
- Compression enabled (gzip)
- Static assets served via Express

## Debugging tips
- Check server logs: `tail -f /tmp/copilot-session-viewer.log` (if running via nohup)
- Inspect session files: `cat ~/.copilot/session-state/<session-id>/events.jsonl`
- Browser DevTools console for client-side issues
- Use `DEBUG=*` env var for verbose logging (if implemented)

## Commit guidelines
- Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Run `npm run lint:fix` before committing
- All tests must pass: `npm run test:all`
- Keep commits atomic and focused

## Known gotchas
- Vue 3 templates auto-unwrap refs - don't use `.value` in templates
- `filteredEvents` vs `flatEvents` - use correct one for virtual scroller indices
- Platform-specific paths: always rely on system PATH, never hardcode `/opt/homebrew` etc.
- Hash router: navigation is client-side `#/...`; E2E tests must wait on actual API responses (`waitForResponse('/sessions'|'/events')`), not `waitForLoadState('networkidle')`
- E2E fixtures: `npm run test:e2e` sets `E2E_USE_FIXTURES=1`, forcing all source adapters to read from `__tests__/fixtures/sessions/` — never touches the developer's real session dirs

## PR instructions
- Title format: `<type>: <description>` (e.g., `feat: add brand colors for model badges`)
- Link related issues if any
- Include screenshots for UI changes
- Verify all tests pass locally before pushing
