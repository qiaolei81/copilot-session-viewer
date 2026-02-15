# 🤖 Copilot Session Viewer

[![npm version](https://img.shields.io/npm/v/@qiaolei81/copilot-session-viewer.svg)](https://www.npmjs.com/package/@qiaolei81/copilot-session-viewer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

**AI-Powered Session Log Analysis Tool for GitHub Copilot CLI**

A modern web-based viewer for analyzing GitHub Copilot CLI session logs with virtual scrolling, infinite loading, time analysis, and AI-powered insights.

![Session Viewer Demo](https://via.placeholder.com/800x400/0d1117/58a6ff?text=Session+Viewer+Demo)

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
- GitHub Copilot CLI (for generating session data)

---

## ✨ Features

### 🎯 **Core Capabilities**
- **📊 Session Management** - View, export, and import session archives
- **🔍 Event Analysis** - Real-time log parsing with filtering and search
- **⏱️ Time Analysis** - Execution timelines and performance metrics
- **🚀 Virtual Scrolling** - Handle 1000+ events smoothly
- **♾️ Infinite Scroll** - Progressive session loading for better performance
- **🤖 AI Insights** - LLM-powered session analysis

### 🎨 **User Experience**
- **🌙 Dark Theme** - GitHub-inspired interface
- **📱 Responsive** - Works on desktop, tablet, and mobile
- **⚡ Fast** - Optimized virtual rendering and lazy loading
- **🔐 Secure** - Local-first with no data sharing

### 🛠️ **Technical Features**
- **Vue 3** - Reactive virtual scrolling
- **Express.js** - Robust backend API
- **ZIP Import/Export** - Session sharing capabilities
- **Multi-format Support** - Directory and JSONL sessions

---

## 🚀 How It Works

1. **Generate Sessions** - Use GitHub Copilot CLI to create session logs
2. **Auto-Discovery** - Sessions are automatically detected in `~/.copilot/session-state/`
3. **Browse & Analyze** - View sessions with infinite scroll and detailed event streams
4. **Time Analysis** - Analyze turn durations, tool usage, and sub-agent performance
5. **AI Insights** - Generate comprehensive session analysis with Copilot

```bash
# Example: Generate a session with Copilot CLI
copilot --model claude-sonnet-4.5 -p "Help me refactor this code"

# Start the viewer
npx @qiaolei81/copilot-session-viewer

# Browse sessions at http://localhost:3838
```

---

## 📚 Documentation

- **[Installation Guide](docs/INSTALLATION.md)** - Detailed setup instructions
- **[API Documentation](docs/API.md)** - REST endpoints and responses
- **[Development Guide](docs/DEVELOPMENT.md)** - Contributing and local development
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Changelog](CHANGELOG.md)** - Release history

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend (Vue 3 + EJS Templates)               │
│  • Virtual Scroller (vue-virtual-scroller)      │
│  • Infinite Scroll (JavaScript)                 │
│  • GitHub-inspired Dark Theme                   │
└─────────────────────────────────────────────────┘
                      ↕ HTTP/API
┌─────────────────────────────────────────────────┐
│  Backend (Node.js + Express)                    │
│  • Session Repository & File Watcher            │
│  • JSONL Streaming Parser                       │
│  • Paginated API Endpoints                      │
└─────────────────────────────────────────────────┘
                      ↕ File System
┌─────────────────────────────────────────────────┐
│  Data Layer (~/.copilot/session-state/)         │
│  • events.jsonl (event streams)                 │
│  • workspace.yaml (metadata)                    │
│  • copilot-insight.md (AI analysis)              │
└─────────────────────────────────────────────────┘
```

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

---

**Status:** ✅ Active Development | **Version:** 0.1.3 | **Last Updated:** 2026-02-16

---

<div align="center">

**[🏠 Homepage](https://github.com/qiaolei81/copilot-session-viewer)** •
**[📖 Docs](docs/)** •
**[🐛 Issues](https://github.com/qiaolei81/copilot-session-viewer/issues)** •
**[💬 Discussions](https://github.com/qiaolei81/copilot-session-viewer/discussions)**

Made with ❤️ for the GitHub Copilot CLI community

</div>