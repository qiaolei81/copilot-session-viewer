# AGENTS.md

## Project overview
Web UI for viewing and analyzing GitHub Copilot CLI session logs. Built with Express.js, EJS templates, and vanilla JavaScript (Vue 3 for session detail view).

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
server.js                    # Main Express app
src/
  config.js                  # Configuration constants
  session.js                 # Session data model
  sessionRepository.js       # Session loading/caching
  insightService.js          # Copilot-based analysis
  processManager.js          # Background process tracking
  fileUtils.js              # File operations
  helpers.js                # Utility functions
views/
  index.ejs                 # Session list (main page)
  session-vue.ejs           # Session detail (Vue 3)
  time-analyze.ejs          # Timeline analysis
__tests__/                  # Jest unit tests
__tests__/e2e/              # Playwright e2e tests
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
1. Add route handler in `server.js`
2. Create corresponding view in `views/`
3. Add E2E test in `__tests__/e2e/`
4. Update README if user-facing

### Modifying session parsing
1. Edit `src/session.js` or `src/fileUtils.js`
2. Run unit tests: `npm test`
3. Test with real sessions from `~/.copilot/session-state/`

### UI changes
- Main page: edit `views/index.ejs` (vanilla JS)
- Session detail: edit `views/session-vue.ejs` (Vue 3 CDN)
- Time analysis: edit `views/time-analyze.ejs` (vanilla JS)
- Restart server to see changes: `npm run dev` (auto-reload)

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
- Session files: `~/.copilot/session-state/` (configurable via SESSION_DIR env)

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
- EJS escaping: use `<%- %>` for trusted HTML, `<%= %>` for user input

## PR instructions
- Title format: `<type>: <description>` (e.g., `feat: add brand colors for model badges`)
- Link related issues if any
- Include screenshots for UI changes
- Verify all tests pass locally before pushing
