# 🤖 Copilot Session Viewer

[![npm version](https://img.shields.io/npm/v/@qiaolei81/copilot-session-viewer.svg)](https://www.npmjs.com/package/@qiaolei81/copilot-session-viewer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

**AI-Powered Session Log Analysis Tool for GitHub Copilot CLI, Claude Code CLI & Pi-Mono**

A modern web-based viewer for analyzing AI coding assistant session logs with virtual scrolling, infinite loading, time analysis, and AI-powered insights. Supports **Copilot**, **Claude Code**, and **Pi-Mono** sessions.

### Session List
![Session List](https://raw.githubusercontent.com/qiaolei81/copilot-session-viewer/main/docs/images/homepage.png)

### Session Detail — Event Stream with Virtual Scrolling
![Session Detail](https://raw.githubusercontent.com/qiaolei81/copilot-session-viewer/main/docs/images/session-detail.png)

### Time Analysis — Gantt Timeline & Sub-Agent Breakdown
![Time Analysis](https://raw.githubusercontent.com/qiaolei81/copilot-session-viewer/main/docs/images/time-analysis.png)

---

## ⚡ Quick Start

### Try without installing (recommended)

```bash
npx -y @qiaolei81/copilot-session-viewer@latest
```

Then open http://localhost:3838

### Install globally

```bash
npm install -g @qiaolei81/copilot-session-viewer
copilot-session-viewer
```

### Requirements

- Node.js ≥ 18.0.0
- At least one AI coding assistant (optional for generating sessions):
  - [GitHub Copilot CLI](https://github.com/cli/cli) (recommended)
  - [Claude Code CLI](https://github.com/anthropics/claude-code)
  - [Pi-Mono](https://github.com/badlogic/pi-mono)

---

## ✨ Features

### 🎯 **Core Capabilities**
- **📊 Session Management** - View, export, and import session archives
- **🔍 Event Analysis** - Real-time log parsing with filtering and search
- **⏱️ Time Analysis** - Execution timelines and performance metrics
- **🚀 Virtual Scrolling** - Handle 1000+ events smoothly
- **♾️ Infinite Scroll** - Progressive session loading for better performance
- **🤖 AI Insights** - LLM-powered session analysis
- **🎭 Multi-Format Support** - Copilot, Claude Code, and Pi-Mono sessions

### 🎨 **User Experience**
- **🌙 Dark Theme** - GitHub-inspired interface
- **📱 Responsive** - Works on desktop, tablet, and mobile
- **⚡ Fast** - Optimized virtual rendering and lazy loading
- **🔐 Secure** - Local-first with no data sharing, XSS protection, ZIP bomb defense

### 🛠️ **Technical Features**
- **Vue 3** - Reactive virtual scrolling
- **Express.js** - Robust backend API
- **ZIP Import/Export** - Session sharing capabilities with security validation
- **Multi-Source Support** - Copilot (`~/.copilot/session-state/`), Claude (`~/.claude/projects/`), Pi-Mono (`~/.pi/agent/sessions/`)
- **Unified Event Format** - Consistent schema across all sources
- **Memory Pagination** - Efficient handling of large sessions
- **XSS Protection** - DOMPurify-based HTML sanitization
- **ZIP Bomb Defense** - 4-layer protection (compressed size, uncompressed size, file count, depth)

---

## 🚀 How It Works

1. **Generate Sessions** - Use GitHub Copilot CLI, Claude Code CLI, or Pi-Mono to create session logs
2. **Auto-Discovery** - Sessions are automatically detected from:
   - Copilot: `~/.copilot/session-state/`
   - Claude: `~/.claude/projects/`
   - Pi-Mono: `~/.pi/agent/sessions/`
3. **Browse & Analyze** - View sessions with infinite scroll and detailed event streams
4. **Time Analysis** - Analyze turn durations, tool usage, and sub-agent performance
5. **AI Insights** - Generate comprehensive session analysis with Copilot

```bash
# Example: Generate sessions with different tools

# GitHub Copilot CLI
copilot --model claude-sonnet-4.5 -p "Help me refactor this code"

# Claude Code CLI
claude -p "Implement user authentication"

# Pi-Mono CLI
pi -p "Create a REST API endpoint"

# Start the viewer
npx @qiaolei81/copilot-session-viewer

# Browse all sessions at http://localhost:3838
```

---

## 📚 Documentation

- **[Installation Guide](docs/INSTALLATION.md)** - Detailed setup instructions
- **[API Documentation](docs/API.md)** - REST endpoints and responses
- **[Development Guide](docs/DEVELOPMENT.md)** - Contributing and local development
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Changelog](CHANGELOG.md)** - Release history

---

## 🧪 Testing & Quality

This project includes comprehensive unit and E2E test coverage with CI/CD integration.

### Test Coverage

- **470+ Tests** (411 unit + 59 E2E)
- **Unified Format Tests** - Mock data validation for all sources (Copilot, Claude, Pi-Mono)
- **Security Tests** - XSS prevention, ZIP bomb defense
- **Integration Tests** - Session import/export, file operations
- **CI-Friendly** - Mock data generation for reproducible tests

### Running Tests

```bash
# Unit tests only
npm test

# Unit tests with coverage
npm run test:coverage

# E2E tests only
npm run test:e2e

# Lint check
npm run lint:check

# Run all tests (unit + E2E)
npm run test:all
```

### CI/CD Pipeline

GitHub Actions workflow includes:
1. **Linting** - ESLint code quality checks
2. **Unit Tests** - 411 Jest tests with coverage
3. **Mock Data Generation** - Reproducible test session fixtures
4. **E2E Tests** - 59 Playwright tests with Chromium
5. **Artifact Upload** - Test results on failure

**Test Data Strategy:**
- ✅ CI uses generated mock data (fast, reliable, no external dependencies)
- ✅ Local development can use real sessions for integration testing
- ✅ Fixtures cover all event formats (Copilot, Claude, Pi-Mono)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend (Vue 3 + EJS Templates)               │
│  • Virtual Scroller (vue-virtual-scroller)      │
│  • Infinite Scroll (JavaScript)                 │
│  • GitHub-inspired Dark Theme                   │
│  • XSS Protection (DOMPurify)                   │
└─────────────────────────────────────────────────┘
                      ↕ HTTP/API
┌─────────────────────────────────────────────────┐
│  Backend (Node.js + Express)                    │
│  • Multi-Source Session Repository              │
│  • Unified Event Format Normalizer              │
│  • JSONL Streaming Parser                       │
│  • Paginated API Endpoints                      │
│  • ZIP Import/Export with Security Validation   │
└─────────────────────────────────────────────────┘
                      ↕ File System
┌─────────────────────────────────────────────────┐
│  Data Layer (Multi-Source)                      │
│  • Copilot: ~/.copilot/session-state/           │
│  • Claude:  ~/.claude/projects/                 │
│  • Pi-Mono: ~/.pi/agent/sessions/               │
└─────────────────────────────────────────────────┘
```

### Unified Event Format

All session sources are normalized to a consistent schema:

```javascript
{
  type: 'assistant.message',
  timestamp: '2026-02-23T00:00:00.000Z',
  data: {
    message: 'Response text',
    tools: [
      {
        id: 'tool-001',
        name: 'read',
        startTime: '2026-02-23T00:00:01.000Z',
        endTime: '2026-02-23T00:00:02.000Z',
        status: 'completed',
        input: { path: 'file.js' },
        result: { content: '...' },
        error: null,
        metadata: {
          source: 'copilot',  // or 'claude', 'pi-mono'
          duration: 1000
        }
      }
    ]
  }
}
```

**Benefits:**
- ✅ Consistent UI rendering across all sources
- ✅ Simplified frontend logic
- ✅ Easy to add new sources

---

## 🔒 Security

### XSS Protection
- **DOMPurify Sanitization** - All user-generated content is sanitized before rendering
- **Whitelist-based** - Only safe HTML tags and attributes are allowed
- **JavaScript URL Protection** - Blocks `javascript:`, `data:`, and `onclick` handlers
- **Tested** - Comprehensive E2E tests for XSS attack vectors

### ZIP Bomb Defense
4-layer protection against malicious archives:
1. **Compressed Size Limit** - 50 MB max upload
2. **Uncompressed Size Limit** - 200 MB max expansion
3. **File Count Limit** - 1000 files max
4. **Directory Depth Limit** - 5 levels max

### Local-First Design
- No external API calls for session data
- All processing happens locally
- Optional AI insights require user action
- No telemetry or tracking

---

## 🎯 Use Cases

### **For Developers**
- Debug GitHub Copilot CLI sessions
- Analyze conversation patterns and tool usage
- Export sessions for team collaboration
- Performance optimization insights

### **For Teams**
- Share interesting Copilot sessions
- Analyze team AI usage patterns
- Document complex problem-solving sessions
- Training and best practice development

### **For Researchers**
- Study human-AI interaction patterns
- Analyze tool usage effectiveness
- Session data mining and analysis
- AI conversation flow research

---

## 🤝 Contributing

This project welcomes contributions! See our [Development Guide](docs/DEVELOPMENT.md) for:

- Setting up the development environment
- Code style guidelines
- Testing procedures
- Contribution workflow

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

**Built with AI assistance** - This project was developed using GitHub Copilot and Claude AI for code generation, documentation, and architectural decisions.

**Key Dependencies:**
- [Vue 3](https://vuejs.org/) - Reactive frontend framework
- [vue-virtual-scroller](https://github.com/Akryum/vue-virtual-scroller) - High-performance virtual scrolling
- [Express.js](https://expressjs.com/) - Web application framework
- [EJS](https://ejs.co/) - Templating engine
- [DOMPurify](https://github.com/cure53/DOMPurify) - XSS protection
- [Playwright](https://playwright.dev/) - E2E testing

**Recent Updates (v0.1.9+):**
- ✨ Multi-source support (Copilot, Claude, Pi-Mono)
- 🔒 XSS protection with DOMPurify
- 🛡️ ZIP bomb defense (4-layer validation)
- 📄 Memory pagination API
- 🧪 470+ tests with CI/CD integration
- 📚 Comprehensive documentation

---

<div align="center">

**[🏠 Homepage](https://github.com/qiaolei81/copilot-session-viewer)** •
**[📖 Docs](docs/)** •
**[🐛 Issues](https://github.com/qiaolei81/copilot-session-viewer/issues)** •
**[💬 Discussions](https://github.com/qiaolei81/copilot-session-viewer/discussions)**

Made with ❤️ for the GitHub Copilot CLI community

</div>