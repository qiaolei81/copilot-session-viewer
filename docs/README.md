# 📖 Documentation

Complete documentation for Copilot Session Viewer.

---

## 🚀 Getting Started

- **[📦 Installation Guide](INSTALLATION.md)** - Complete setup instructions for all platforms
- **[🔧 Troubleshooting](TROUBLESHOOTING.md)** - Common issues and solutions

---

## 📚 User Guides

- **[🏠 Main README](../README.md)** - Project overview and quick start
- **[📋 Changelog](../CHANGELOG.md)** - Release history and version changes

---

## 🛠️ Developer Resources

- **[🔌 API Documentation](API.md)** - REST endpoints and data formats
- **[👩‍💻 Development Guide](DEVELOPMENT.md)** - Contributing and local development

---

## 📱 Features

### Core Functionality
- **Session Management** - View, export, and import Copilot CLI sessions
- **Event Analysis** - Real-time parsing with filtering and search
- **Time Analysis** - Performance metrics and execution timelines
- **AI Insights** - LLM-powered session analysis

### Technical Features
- **Virtual Scrolling** - Handle 1000+ events smoothly
- **Infinite Scroll** - Progressive loading for better performance
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Dark Theme** - GitHub-inspired interface

---

## 🏗️ Architecture Overview

```
Frontend (Vue 3 + EJS) ↔ Backend (Node.js + Express) ↔ File System
```

**Data Flow:**
1. **Sessions** stored in `~/.copilot/session-state/`
2. **Backend** parses JSONL and YAML files
3. **API** serves paginated session data
4. **Frontend** renders with virtual scrolling

---

## 🎯 Use Cases

### For Developers
- Debug Copilot CLI interactions
- Analyze conversation patterns
- Export sessions for collaboration
- Performance optimization insights

### For Teams
- Share interesting sessions
- Analyze AI usage patterns
- Document problem-solving sessions
- Training and best practices

### For Researchers
- Study human-AI interactions
- Analyze tool effectiveness
- Session data mining
- Conversation flow research

---

## 🔗 Quick Links

| Topic | Link | Description |
|-------|------|-------------|
| **Installation** | [INSTALLATION.md](INSTALLATION.md) | Setup for all platforms |
| **API Reference** | [API.md](API.md) | REST endpoints and examples |
| **Development** | [DEVELOPMENT.md](DEVELOPMENT.md) | Contributing guidelines |
| **Troubleshooting** | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues and fixes |
| **Changelog** | [../CHANGELOG.md](../CHANGELOG.md) | Version history |
| **License** | [../LICENSE](../LICENSE) | MIT License terms |

---

## 📞 Support

- **🐛 Bug Reports**: [GitHub Issues](https://github.com/qiaolei81/copilot-session-viewer/issues)
- **💬 Questions**: [GitHub Discussions](https://github.com/qiaolei81/copilot-session-viewer/discussions)
- **📖 Documentation**: This directory
- **🚀 Quick Start**: [Main README](../README.md)

---

**Happy exploring!** 🎉 Choose the documentation section that best fits your needs.