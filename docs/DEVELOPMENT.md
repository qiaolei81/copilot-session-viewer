# 🛠️ Development Guide

Contributing to Copilot Session Viewer development.

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18.0.0 (LTS recommended)
- **npm** ≥ 9.0.0 or **yarn** ≥ 1.22.0
- **Git** for version control
- **GitHub Copilot CLI** for testing

### Fork & Clone

```bash
# Fork on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/copilot-session-viewer.git
cd copilot-session-viewer

# Add upstream remote
git remote add upstream https://github.com/qiaolei81/copilot-session-viewer.git
```

### Local Setup

```bash
# Install dependencies
npm install

# Copy environment template (optional)
cp .env.example .env

# Start development server with hot reload
npm run dev
```

The development server will start at `http://localhost:3838` with:
- **Auto-reload** - Server restarts on file changes
- **Vite HMR** - Vue components hot-reload without page refresh
- **Verbose logging** - Detailed debug information

---

## Project Structure

```
copilot-session-viewer/
├── 📁 src/                      # Source code
│   ├── 📁 controllers/          # Express route controllers
│   │   ├── sessionController.js # Session management
│   │   └── insightController.js # AI insight generation
│   ├── 📁 middleware/          # Express middleware
│   │   ├── common.js           # Common middleware (CORS, timeout, etc.)
│   │   └── rateLimiting.js     # Rate limiting configuration
│   ├── 📁 models/              # Data models
│   │   └── Session.js          # Session data model
│   ├── 📁 services/            # Business logic
│   │   ├── sessionRepository.js # Session data access
│   │   ├── sessionService.js   # Session business logic
│   │   └── insightService.js   # AI insight generation
│   ├── 📁 utils/               # Utility functions
│   │   ├── fileUtils.js        # File system utilities
│   │   ├── helpers.js          # General helpers
│   │   └── processManager.js   # Process management
│   ├── app.js                  # Express app configuration
│   └── config.js               # Configuration management
├── 📁 client/                  # Vue 3 SPA (built by Vite)
│   ├── 📁 components/         # Reusable components (home/, session/, time-analyze/)
│   ├── 📁 views/              # Route-level views (HomeView, SessionView, TimeAnalyzeView)
│   ├── 📁 router/             # Vue Router (hash mode)
│   ├── 📁 stores/             # Pinia stores
│   ├── 📁 api/                # Fetch wrappers
│   ├── 📁 utils/              # Client utilities
│   ├── 📁 styles/             # Global styles
│   ├── App.vue                # Root component
│   └── main.js                # Entry point
├── 📁 __tests__/              # Test suite
│   ├── 📁 e2e/                # End-to-end tests (Playwright)
│   ├── server.test.js         # API endpoint tests
│   ├── sessionRepository.test.js # Data layer tests
│   └── ...                    # Unit tests
├── 📁 docs/                   # Documentation
├── server.js                  # Application entry point
├── package.json               # Dependencies and scripts
├── CHANGELOG.md               # Version history
└── README.md                  # Main documentation
```

---

## Development Workflow

### Daily Development

1. **Sync with upstream:**
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make changes & test:**
   ```bash
   # Start development server
   npm run dev

   # In another terminal, run tests
   npm test
   npm run test:e2e
   ```

4. **Commit & push:**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   git push origin feature/your-feature-name
   ```

5. **Create pull request** on GitHub

### Code Style Guidelines

**General Principles:**
- **Consistency** - Follow existing patterns
- **Readability** - Clear variable and function names
- **Documentation** - Comment complex logic

**JavaScript Style:**
```javascript
// ✅ Good
const sessionService = require('./services/sessionService');

async function getSessionList(req, res) {
  try {
    const sessions = await sessionService.getAllSessions();
    res.json(sessions);
  } catch (error) {
    console.error('Error loading sessions:', error);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
}

// ❌ Avoid
const ss=require('./services/sessionService');
function getSessionList(req,res){
  sessionService.getAllSessions().then(s=>res.json(s)).catch(e=>res.status(500).json({error:e}));
}
```

**Formatting Rules:**
- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Single quotes for JavaScript, double quotes for HTML/Vue templates
- **Semicolons**: Always required
- **Line length**: 100 characters max
- **Async/Await**: Preferred over Promises

**Linting:**
```bash
# Check code style
npm run lint

# Auto-fix style issues
npm run lint -- --fix
```

---

## Testing

### Test Structure

```
__tests__/
├── 📁 e2e/                    # End-to-end tests
│   ├── homepage.spec.js       # Homepage functionality
│   ├── session-detail.spec.js # Session viewer
│   └── api.spec.js           # API endpoints
├── server.test.js            # Express app integration tests
├── sessionRepository.test.js # Data layer unit tests
├── fileUtils.test.js        # Utility function tests
└── helpers.test.js          # Helper function tests
```

### Running Tests

```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- sessionRepository.test.js

# Run end-to-end tests
npm run test:e2e

# Run e2e tests in headed mode (visible browser)
npm run test:e2e -- --headed

# Generate test coverage
npm run test:coverage
```

### Writing Tests

**Unit Test Example:**
```javascript
// __tests__/helpers.test.js
const { isValidSessionId } = require('../src/utils/helpers');

describe('helpers', () => {
  describe('isValidSessionId', () => {
    it('should accept valid UUIDs', () => {
      expect(isValidSessionId('f9db650c-1f87-491f-8e4f-52d45538d677')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidSessionId('invalid-id')).toBe(false);
      expect(isValidSessionId('')).toBe(false);
      expect(isValidSessionId(null)).toBe(false);
    });
  });
});
```

**E2E Test Example:**
```javascript
// __tests__/e2e/homepage.spec.js
const { test, expect } = require('@playwright/test');

test('should load homepage successfully', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Copilot Session Viewer');
  await expect(page.locator('h1')).toContainText('Session Viewer');

  // Check for session input
  const sessionInput = page.locator('input[placeholder*="Session ID"]');
  await expect(sessionInput).toBeVisible();
});
```

### Test Data

For testing, you can create mock session data:

```bash
# Create test session directory
mkdir -p ~/.copilot/session-state/test-session-id

# Create mock events file
cat > ~/.copilot/session-state/test-session-id/events.jsonl << 'EOF'
{"type":"session.start","timestamp":"2026-02-15T12:00:00.000Z"}
{"type":"user.message","timestamp":"2026-02-15T12:00:01.000Z","message":"Hello"}
{"type":"assistant.message","timestamp":"2026-02-15T12:00:05.000Z","message":"Hi there!"}
EOF

# Create mock workspace file
cat > ~/.copilot/session-state/test-session-id/workspace.yaml << 'EOF'
cwd: /tmp/test
copilot_version: 0.0.410
model: claude-sonnet-4.5
EOF
```

---

## Debugging

### Development Debugging

**Enable debug logging:**
```bash
DEBUG=copilot-viewer:* npm run dev
```

**Node.js debugging with VS Code:**
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/server.js",
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "copilot-viewer:*"
      }
    }
  ]
}
```

**Browser debugging:**
```javascript
// Add breakpoints in Vue components or use Vue DevTools
<script>
  console.log('Session data:', sessions);
  debugger; // Browser will pause here when DevTools is open
</script>
```

### Session Parsing Debug

```bash
# Debug specific session parsing
node -e "
  const Session = require('./src/models/Session');
  Session.fromDirectory('~/.copilot/session-state/YOUR_SESSION_ID')
    .then(console.log)
    .catch(console.error);
"
```

### Log Levels

```javascript
// In code, use appropriate log levels
console.error('Critical error:', error);     // Always shown
console.warn('Warning:', warning);           // Production + development
console.log('Info:', info);                 // Development only
console.debug('Debug details:', details);   // Debug mode only
```

---

## Contributing Guidelines

### Before You Start

1. **Check existing issues** - Avoid duplicate work
2. **Discuss major changes** - Open an issue first for big features
3. **Follow conventions** - Match existing code style and patterns

### Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

**Examples:**
```bash
feat: add infinite scroll to session list
fix: resolve session parsing error for empty files
docs: update installation instructions
test: add e2e tests for session export
```

### Pull Request Process

1. **Update documentation** - If you change functionality
2. **Add tests** - For new features or bug fixes
3. **Ensure tests pass** - Both unit and e2e tests
4. **Update changelog** - Add entry to `CHANGELOG.md`
5. **Request review** - Tag maintainers for review

### Code Review Checklist

**For Authors:**
- [ ] Tests pass locally
- [ ] Code follows style guidelines
- [ ] Documentation is updated
- [ ] Changelog is updated
- [ ] No console errors in browser
- [ ] No linting errors

**For Reviewers:**
- [ ] Code is readable and maintainable
- [ ] Tests cover the changes
- [ ] No security issues
- [ ] Performance is acceptable
- [ ] UI/UX is consistent
- [ ] Documentation is accurate

---

## Release Process

### Version Management

This project uses [Semantic Versioning](https://semver.org/):

- **MAJOR** version when you make incompatible API changes
- **MINOR** version when you add functionality in a backward compatible manner
- **PATCH** version when you make backward compatible bug fixes

### Creating a Release

1. **Update version:**
   ```bash
   npm version patch  # or minor, major
   ```

2. **Update changelog:**
   ```bash
   # Move [Unreleased] section to new version
   # Update version links at bottom
   ```

3. **Create release:**
   ```bash
   git push origin main --tags
   ```

4. **Publish to npm:**
   ```bash
   npm publish
   ```

5. **Create GitHub release** with changelog notes

---

## Architecture Decisions

### Technology Choices

**Backend: Node.js + Express**
- ✅ JavaScript ecosystem consistency
- ✅ Excellent file system handling
- ✅ Large middleware ecosystem
- ✅ Easy deployment

**Frontend: Vue 3 SPA + Vite**
- ✅ Composition API + Pinia for state management
- ✅ Vue Router (hash mode) for client-side navigation
- ✅ Vite for fast HMR in development and optimized builds for production
- ✅ Virtual scrolling for large session event lists

**Data: File System**
- ✅ No database setup required
- ✅ Direct access to Copilot CLI data
- ✅ Easy backup and sharing
- ✅ Minimal dependencies

### Design Patterns

**Repository Pattern** (`src/services/sessionRepository.js`)
- Abstracts data access
- Enables testing with mock data
- Consistent interface

**Controller Pattern** (`src/controllers/`)
- Separates request handling from business logic
- Clean error handling
- Consistent response formatting

**Service Layer** (`src/services/`)
- Business logic separation
- Reusable components
- Dependency injection

---

## Performance Considerations

### Frontend Optimization

- **Virtual Scrolling** - Handle large event lists
- **Infinite Scroll** - Progressive loading
- **Debounced Search** - Reduce API calls
- **CSS Containment** - Improve rendering performance

### Backend Optimization

- **Streaming JSONL** - Memory-efficient parsing
- **File System Caching** - Reduce disk I/O
- **Rate Limiting** - Prevent abuse
- **Compression** - Reduce bandwidth

### Monitoring

```javascript
// Add performance monitoring
const startTime = Date.now();
// ... operation
const duration = Date.now() - startTime;
console.log(`Operation took ${duration}ms`);
```

---

## Security Guidelines

### Input Validation

```javascript
// Always validate session IDs
const { isValidSessionId } = require('../utils/helpers');

if (!isValidSessionId(sessionId)) {
  return res.status(400).json({ error: 'Invalid session ID' });
}
```

### File Access

```javascript
// Prevent path traversal attacks
const path = require('path');
const sessionPath = path.resolve(SESSION_DIR, sessionId);

// Ensure path is within session directory
if (!sessionPath.startsWith(path.resolve(SESSION_DIR))) {
  return res.status(400).json({ error: 'Invalid path' });
}
```

### Content Security Policy

Currently configured in `src/app.js` - be careful when modifying CSP headers.

---

## Getting Help

### Documentation

- **[API Documentation](API.md)** - REST endpoint details
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues
- **[Installation Guide](INSTALLATION.md)** - Setup instructions

### Community

- **💬 [GitHub Discussions](https://github.com/qiaolei81/copilot-session-viewer/discussions)** - Questions and ideas
- **🐛 [GitHub Issues](https://github.com/qiaolei81/copilot-session-viewer/issues)** - Bug reports and feature requests

### Contact

For sensitive security issues, contact the maintainers directly.

---

**Happy coding!** 🚀 Thank you for contributing to Copilot Session Viewer!