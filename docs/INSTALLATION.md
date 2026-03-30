# 📦 Installation Guide

Complete installation instructions for Copilot Session Viewer.

---

## Prerequisites

### Required

- **Node.js** ≥ 18.0.0 (LTS recommended)
- **npm** ≥ 9.0.0 or **yarn** ≥ 1.22.0
- **GitHub Copilot CLI** (for session data generation)

### Optional

- **GitHub Copilot CLI with `--yolo` mode** (for AI insights feature)

---

## Installation Methods

### Method 1: NPX (Recommended for Trying)

**Best for:** First-time users, occasional use, always getting the latest version

```bash
# Run directly without installation
npx -y @qiaolei81/copilot-session-viewer

# Then open http://localhost:3838
```

**Pros:**
- ✅ No local installation required
- ✅ Always runs the latest version
- ✅ No disk space usage when not running

**Cons:**
- ⚠️ Slower startup (downloads on each run)
- ⚠️ Requires internet connection

---

### Method 2: Global Installation

**Best for:** Regular users, offline usage, faster startup times

```bash
# Install globally
npm install -g @qiaolei81/copilot-session-viewer

# Run from anywhere
copilot-session-viewer

# Then open http://localhost:3838
```

**Pros:**
- ✅ Fast startup time
- ✅ Works offline after installation
- ✅ Simple command `copilot-session-viewer`

**Cons:**
- ⚠️ Manual updates required
- ⚠️ Uses disk space

**Updating:**
```bash
npm update -g @qiaolei81/copilot-session-viewer
```

---

### Method 3: Local Installation (Development)

**Best for:** Developers, customization, contributing

```bash
# Clone the repository
git clone https://github.com/qiaolei81/copilot-session-viewer.git
cd copilot-session-viewer

# Install dependencies
npm install

# Start development server
npm run dev
# OR start production server
npm start

# Then open http://localhost:3838
```

**Pros:**
- ✅ Full source code access
- ✅ Can modify and customize
- ✅ Contributing and development

**Cons:**
- ⚠️ More setup required
- ⚠️ Manual updates via git

---

## Verification

### Check Installation

```bash
# Check Node.js version
node --version  # Should be ≥ 18.0.0

# Check npm version
npm --version   # Should be ≥ 9.0.0

# Check if Copilot CLI is installed
copilot --version
```

### Test the Installation

1. **Start the viewer:**
   ```bash
   npx -y @qiaolei81/copilot-session-viewer
   # OR if globally installed:
   copilot-session-viewer
   ```

2. **Verify server starts:**
   ```
   🚀 Copilot Session Viewer running at http://localhost:3838
   📂 Monitoring: /Users/yourname/.copilot/session-state
   🔧 Environment: production
   ```

3. **Open in browser:**
   Navigate to `http://localhost:3838`

4. **Check for sessions:**
   - If you have existing Copilot CLI sessions, they should appear
   - If not, generate a test session (see below)

---

## Generating Test Session Data

If you don't have existing session data, create some test sessions:

```bash
# Example sessions with different models
copilot --model claude-sonnet-4.5 -p "Hello, introduce yourself"
copilot --model gpt-4o -p "Explain what you can do"
copilot --model gemini-3-pro -p "Write a simple hello world in Python"
```

Sessions will be saved to:
- **macOS/Linux**: `~/.copilot/session-state/`
- **Windows**: `C:\Users\<username>\.copilot\session-state\`

---

## Configuration

### Environment Variables

Create a `.env` file for custom configuration:

```env
# Server Configuration
PORT=3838
NODE_ENV=development

# Session directories (all auto-detected if omitted)
COPILOT_SESSION_DIR=/path/to/custom/session-state   # GitHub Copilot CLI
SESSION_DIR=/path/to/custom/session-state            # Legacy alias for COPILOT_SESSION_DIR
CLAUDE_SESSION_DIR=/path/to/claude/projects          # Claude Code CLI
PI_MONO_SESSION_DIR=/path/to/pi/agent/sessions       # Pi-Mono
VSCODE_WORKSPACE_STORAGE_DIR=/path/to/workspaceStorage  # Copilot Chat (VS Code)
MODERNIZE_SESSION_DIR=/path/to/modernize/session-state  # Modernize CLI

# Feature Flags
ENABLE_INSIGHTS=true
ENABLE_EXPORT=true
```

### Custom Session Directory

Each session source has its own env var override. Use these for custom `--user-data-dir` VS Code installs, VS Code Insiders, or portable mode:

```bash
# Override Copilot CLI sessions
COPILOT_SESSION_DIR=/custom/path npx @qiaolei81/copilot-session-viewer

# Override VS Code Copilot Chat sessions (e.g. VS Code Insiders or custom --user-data-dir)
VSCODE_WORKSPACE_STORAGE_DIR="/path/to/Code - Insiders/User/workspaceStorage" npm start

# Or create a .env file for permanent overrides
cat > .env <<EOF
COPILOT_SESSION_DIR=/custom/path
VSCODE_WORKSPACE_STORAGE_DIR=/path/to/workspaceStorage
EOF
npm start
```

**Default VS Code workspace storage paths (auto-detected):**
- **macOS**: `~/Library/Application Support/Code/User/workspaceStorage`
- **Linux**: `~/.config/Code/User/workspaceStorage`
- **Windows**: `%APPDATA%\Code\User\workspaceStorage`

If only VS Code Insiders is installed, `Code - Insiders` is automatically preferred.

---

## Docker Installation (Advanced)

For containerized deployment:

```bash
# Clone repository
git clone https://github.com/qiaolei81/copilot-session-viewer.git
cd copilot-session-viewer

# Build Docker image
docker build -t copilot-viewer .

# Run container
docker run -p 3838:3838 \
  -v ~/.copilot:/root/.copilot:ro \
  copilot-viewer

# Open http://localhost:3838
```

**Docker Compose:**

```yaml
version: '3.8'
services:
  copilot-viewer:
    build: .
    ports:
      - "3838:3838"
    volumes:
      - ~/.copilot:/root/.copilot:ro
    environment:
      - NODE_ENV=production
      - PORT=3838
```

---

## Platform-Specific Notes

### macOS

```bash
# Install Node.js via Homebrew (recommended)
brew install node

# Or download from nodejs.org
# Then install Copilot Session Viewer
npm install -g @qiaolei81/copilot-session-viewer
```

### Windows

```powershell
# Install Node.js from nodejs.org
# Then install via npm in PowerShell/Command Prompt
npm install -g @qiaolei81/copilot-session-viewer
```

**Windows-specific paths:**
- Sessions: `C:\Users\%USERNAME%\.copilot\session-state\`
- Global npm packages: `%APPDATA%\npm\`

### Linux

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL/Fedora
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo yum install -y nodejs

# Then install Copilot Session Viewer
npm install -g @qiaolei81/copilot-session-viewer
```

---

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Use different port
PORT=3839 npx @qiaolei81/copilot-session-viewer
```

**Permission errors (macOS/Linux):**
```bash
# Fix npm permissions
npm config set prefix ~/.local
export PATH=~/.local/bin:$PATH
```

**Session directory not found:**
```bash
# Verify Copilot CLI is installed
copilot --version

# Run a test command to create the directory
copilot -p "test"
```

**Node.js version issues:**
```bash
# Install Node Version Manager (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
nvm use --lts
```

### Getting Help

- **📖 Documentation**: [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **🐛 Bug Reports**: [GitHub Issues](https://github.com/qiaolei81/copilot-session-viewer/issues)
- **💬 Questions**: [GitHub Discussions](https://github.com/qiaolei81/copilot-session-viewer/discussions)

---

## Next Steps

After successful installation:

1. **📖 Read the [API Documentation](API.md)** - Learn about available endpoints
2. **🔧 Check [Development Guide](DEVELOPMENT.md)** - Set up for contributing
3. **🚀 Start analyzing your sessions!** - Open http://localhost:3838

---

**Installation complete!** 🎉 You're ready to explore your Copilot CLI sessions.