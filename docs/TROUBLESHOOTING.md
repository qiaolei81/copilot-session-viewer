# 🔧 Troubleshooting

Common issues and solutions for Copilot Session Viewer.

---

## Quick Diagnostics

### System Check

Run this diagnostic script to check your setup:

```bash
# Check Node.js version
echo "Node.js: $(node --version)"

# Check npm version
echo "npm: $(npm --version)"

# Check if Copilot CLI is installed
if command -v copilot &> /dev/null; then
  echo "Copilot CLI: $(copilot --version)"
else
  echo "❌ Copilot CLI: Not installed"
fi

# Check session directory
if [ -d ~/.copilot/session-state ]; then
  echo "Session directory: ✅ Exists ($(ls ~/.copilot/session-state | wc -l) sessions)"
else
  echo "Session directory: ❌ Not found"
fi

# Check if port 3838 is available
if lsof -i :3838 &> /dev/null; then
  echo "Port 3838: ❌ In use"
else
  echo "Port 3838: ✅ Available"
fi
```

---

## Installation Issues

### Node.js Version Problems

**Issue:** `Error: Node.js version X.X.X is not supported`

**Solution:**
```bash
# Install Node Version Manager (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc  # or ~/.zshrc

# Install and use latest LTS
nvm install --lts
nvm use --lts
nvm alias default lts/*

# Verify version
node --version  # Should be ≥ 18.0.0
```

### npm Permission Errors

**Issue:** `Error: EACCES: permission denied`

**Solution for macOS/Linux:**
```bash
# Option 1: Fix npm permissions (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc  # or ~/.zshrc
source ~/.bashrc  # or ~/.zshrc

# Option 2: Use npx instead
npx -y @qiaolei81/copilot-session-viewer
```

**Solution for Windows:**
```powershell
# Run PowerShell as Administrator, then:
npm install -g @qiaolei81/copilot-session-viewer
```

### Package Not Found

**Issue:** `Error: Cannot find package '@qiaolei81/copilot-session-viewer'`

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Try with specific registry
npm install -g @qiaolei81/copilot-session-viewer --registry https://registry.npmjs.org/

# Or use npx
npx -y @qiaolei81/copilot-session-viewer
```

---

## Server Startup Issues

### Port Already in Use

**Issue:** `Error: listen EADDRINUSE: address already in use :::3838`

**Solution:**
```bash
# Option 1: Kill process using port 3838
lsof -ti:3838 | xargs kill -9

# Option 2: Use different port
PORT=3839 npx @qiaolei81/copilot-session-viewer

# Option 3: Find and stop the conflicting service
lsof -i :3838  # Shows what's using the port
```

### Session Directory Not Found

**Issue:** `Error: ENOENT: no such file or directory, scandir '/Users/xxx/.copilot/session-state'`

**Solution:**
```bash
# Option 1: Install and run Copilot CLI to create directory
npm install -g @github/copilot-cli
copilot --version  # This should create the directory

# Option 2: Create directory manually and add test session
mkdir -p ~/.copilot/session-state/test-session
echo '{"type":"session.start","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"}' > ~/.copilot/session-state/test-session/events.jsonl

# Option 3: Use custom directory
SESSION_DIR="/path/to/your/sessions" npx @qiaolei81/copilot-session-viewer
```

### File Permission Issues

**Issue:** `Error: EACCES: permission denied, open '/Users/xxx/.copilot/session-state/...'`

**Solution:**
```bash
# Fix permissions on session directory
chmod -R 755 ~/.copilot/session-state/

# If that doesn't work, check ownership
ls -la ~/.copilot/session-state/
# If owned by root or another user:
sudo chown -R $(whoami) ~/.copilot/session-state/
```

---

## Application Runtime Issues

### Sessions Not Appearing

**Issue:** Homepage shows "No sessions found" but sessions exist

**Diagnosis:**
```bash
# Check if sessions exist
ls -la ~/.copilot/session-state/

# Check session format
ls ~/.copilot/session-state/*/events.jsonl
# OR
ls ~/.copilot/session-state/*.jsonl
```

**Solution:**
```bash
# If sessions are empty directories, they need events.jsonl files
for dir in ~/.copilot/session-state/*/; do
  if [ ! -f "$dir/events.jsonl" ]; then
    echo "Missing events.jsonl in $dir"
  fi
done

# Create minimal events file for testing
echo '{"type":"session.start","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"}' > ~/.copilot/session-state/test/events.jsonl
```

### Infinite Scroll Not Working

**Issue:** "Load More Sessions" button doesn't appear or doesn't work

**Solution:**
```bash
# Check browser console for JavaScript errors
# Open Developer Tools (F12) and look in Console tab

# Common fixes:
# 1. Refresh the page
# 2. Clear browser cache (Ctrl+F5 or Cmd+Shift+R)
# 3. Check if sessions are loading in browser Network tab
```

### Session Detail Page Errors

**Issue:** `404 Not Found` when clicking on sessions

**Solution:**
```bash
# Verify session ID format
# Should be UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Check server logs for specific error
# Look in terminal where you started the server

# Try accessing session directly
curl http://localhost:3838/api/sessions/YOUR_SESSION_ID/events
```

---

## AI Insight Issues

### Copilot CLI Not Found

**Issue:** `Error: copilot command not found`

**Solution:**
```bash
# Install GitHub Copilot CLI
npm install -g @github/copilot-cli

# Or use GitHub CLI (if available)
gh extension install github/gh-copilot

# Verify installation
copilot --version
copilot --yolo -p "test"  # Test yolo mode
```

### Insight Generation Timeout

**Issue:** Insight generation hangs or times out

**Solution:**
```bash
# Check if copilot --yolo works manually
copilot --yolo -p "Analyze this simple session data"

# If it hangs, try:
# 1. Restart Copilot CLI: copilot auth logout && copilot auth login
# 2. Check internet connection
# 3. Try with smaller session (fewer events)

# Temporary workaround: Skip AI insights
ENABLE_INSIGHTS=false npx @qiaolei81/copilot-session-viewer
```

### Insight Permission Issues

**Issue:** `Error: EACCES: permission denied, open 'insight-report.md'`

**Solution:**
```bash
# Fix permissions on session directory
chmod 755 ~/.copilot/session-state/YOUR_SESSION_ID/
chmod 644 ~/.copilot/session-state/YOUR_SESSION_ID/*

# If insight file exists but can't be overwritten
rm ~/.copilot/session-state/YOUR_SESSION_ID/insight-report.md
```

---

## Browser Issues

### Page Not Loading

**Issue:** Browser shows "This site can't be reached" or connection errors

**Diagnosis:**
```bash
# Test if server is running
curl http://localhost:3838
# Should return HTML content

# Test API endpoint
curl http://localhost:3838/api/sessions
# Should return JSON array
```

**Solution:**
```bash
# Check if server started successfully
# Look for this message in terminal:
# "🚀 Copilot Session Viewer running at http://localhost:3838"

# If not running, check for error messages
# Common issues:
# - Port in use (see Port Already in Use section)
# - Missing dependencies (run npm install)
# - Node.js version (see Node.js Version Problems section)
```

### JavaScript Errors

**Issue:** Features not working, console shows errors

**Solution:**
1. **Open browser Developer Tools** (F12)
2. **Check Console tab** for error messages
3. **Common fixes:**
   ```javascript
   // If you see "ReferenceError: Vue is not defined"
   // Check internet connection (Vue is loaded from CDN)

   // If you see "TypeError: Cannot read property..."
   // Refresh the page and clear cache
   ```

### Virtual Scrolling Issues

**Issue:** Session event list is choppy or not scrolling smoothly

**Solution:**
1. **Switch to legacy view** if available
2. **Clear browser cache** (Ctrl+F5)
3. **Reduce session size** - Split large sessions
4. **Update browser** to latest version
5. **Try different browser** (Chrome, Firefox, Safari)

---

## Performance Issues

### Slow Session Loading

**Issue:** Homepage takes a long time to load with many sessions

**Solution:**
```bash
# Check session count
ls ~/.copilot/session-state/ | wc -l

# If > 1000 sessions, consider:
# 1. Archive old sessions
mkdir ~/.copilot/session-state-archive
mv ~/.copilot/session-state/old-session-* ~/.copilot/session-state-archive/

# 2. Use session filtering (future feature)
# 3. Increase pagination limit
# Edit your .env file:
echo "DEFAULT_LIMIT=10" >> .env
```

### Memory Usage Issues

**Issue:** High memory usage or browser crashes

**Solution:**
1. **Close other browser tabs**
2. **Reduce virtual scroll buffer** (edit session-vue.ejs)
3. **Use pagination instead of infinite scroll**
4. **Split large sessions** into smaller files

### Network Issues

**Issue:** API requests are slow or timing out

**Solution:**
```bash
# Test local performance
time curl http://localhost:3838/api/sessions

# If slow (> 2 seconds), check:
# 1. Disk I/O performance
# 2. Antivirus software interfering
# 3. Large session files
```

---

## Data Issues

### Corrupted Session Data

**Issue:** Sessions show as "Error parsing session" or have missing data

**Solution:**
```bash
# Check JSONL file format
head ~/.copilot/session-state/SESSION_ID/events.jsonl
# Each line should be valid JSON

# Validate JSON format
cat ~/.copilot/session-state/SESSION_ID/events.jsonl | while read line; do
  echo "$line" | jq . > /dev/null || echo "Invalid JSON: $line"
done

# Fix common issues:
# 1. Remove empty lines
sed -i '' '/^$/d' ~/.copilot/session-state/SESSION_ID/events.jsonl

# 2. Fix trailing commas (if any)
# Manual editing required
```

### Missing Workspace Data

**Issue:** Sessions show "No workspace information"

**Solution:**
```bash
# Check if workspace.yaml exists
ls ~/.copilot/session-state/SESSION_ID/workspace.yaml

# If missing, create minimal file:
cat > ~/.copilot/session-state/SESSION_ID/workspace.yaml << EOF
cwd: /unknown
copilot_version: unknown
model: unknown
EOF
```

---

## Development Issues

### Hot Reload Not Working

**Issue:** Changes to EJS templates don't reflect immediately

**Solution:**
```bash
# Ensure development mode
NODE_ENV=development npm run dev

# Check that nodemon is running (should show in terminal)
# If not, install nodemon:
npm install -g nodemon

# Force restart
# Press Ctrl+C and restart npm run dev
```

### Test Failures

**Issue:** `npm test` fails with various errors

**Solution:**
```bash
# Update test snapshots (if Jest snapshots)
npm test -- --updateSnapshot

# Clear test cache
npm test -- --clearCache

# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- --testPathPattern=sessionRepository
```

### Linting Errors

**Issue:** `npm run lint` shows style violations

**Solution:**
```bash
# Auto-fix most issues
npm run lint -- --fix

# Check specific rules
npm run lint -- --rule no-unused-vars

# Disable rule temporarily (use sparingly)
// eslint-disable-next-line no-unused-vars
const unusedVariable = 'temporary';
```

---

## Environment-Specific Issues

### Windows Issues

**PowerShell Execution Policy:**
```powershell
# If scripts can't run
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Path Issues:**
```powershell
# Session directory path
$sessionDir = "$env:USERPROFILE\.copilot\session-state"
if (Test-Path $sessionDir) { "✅ Sessions found" } else { "❌ No sessions" }
```

### macOS Issues

**Gatekeeper Issues:**
```bash
# If npm packages are quarantined
xattr -r -d com.apple.quarantine ~/.npm-global/

# Homebrew permission issues
sudo chown -R $(whoami) $(brew --prefix)/*
```

### Linux Issues

**Missing Dependencies:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install build-essential

# CentOS/RHEL/Fedora
sudo yum groupinstall "Development Tools"
# OR
sudo dnf groupinstall "Development Tools"
```

---

## Getting More Help

### Enable Debug Mode

```bash
# Start with detailed logging
DEBUG=copilot-viewer:* npm run dev

# Or for production
DEBUG=copilot-viewer:* npm start
```

### Collect System Information

```bash
# Create diagnostic report
echo "=== System Info ===" > debug-info.txt
echo "OS: $(uname -a)" >> debug-info.txt
echo "Node: $(node --version)" >> debug-info.txt
echo "npm: $(npm --version)" >> debug-info.txt
echo "Copilot CLI: $(copilot --version 2>&1)" >> debug-info.txt
echo "Session Dir: $(ls -la ~/.copilot/session-state 2>&1)" >> debug-info.txt
echo "Process: $(ps aux | grep copilot-session-viewer)" >> debug-info.txt
```

### Create Minimal Reproduction

```bash
# Create test case
mkdir test-case
cd test-case

# Create minimal session
mkdir -p test-sessions/test-id
echo '{"type":"session.start","timestamp":"2026-02-15T12:00:00.000Z"}' > test-sessions/test-id/events.jsonl

# Run viewer with test directory
SESSION_DIR=./test-sessions npx @qiaolei81/copilot-session-viewer
```

### Community Support

- **🔍 Search existing issues:** [GitHub Issues](https://github.com/qiaolei81/copilot-session-viewer/issues)
- **💬 Ask questions:** [GitHub Discussions](https://github.com/qiaolei81/copilot-session-viewer/discussions)
- **🐛 Report bugs:** [New Issue](https://github.com/qiaolei81/copilot-session-viewer/issues/new)

### Bug Report Template

When reporting issues, include:

```markdown
## Environment
- OS: [e.g., macOS 14.2, Windows 11, Ubuntu 22.04]
- Node.js: [e.g., 18.19.0]
- npm: [e.g., 10.2.3]
- Package version: [e.g., 0.1.3]
- Copilot CLI: [e.g., 0.0.410]

## Steps to Reproduce
1. Run command: `...`
2. Navigate to: `...`
3. Click on: `...`
4. Error occurs: `...`

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Error Messages
```
[Paste any error messages or logs]
```

## Additional Context
[Any other relevant information]
```

---

## Known Issues & Workarounds

### Large Session Performance

**Issue:** Sessions with >10,000 events may be slow

**Workaround:** Use the Vue.js virtual scrolling view (automatically enabled for large sessions)

### Import/Export on Windows

**Issue:** ZIP file paths may have issues on Windows

**Workaround:** Use forward slashes in paths, avoid special characters in session IDs

### Copilot CLI Rate Limiting

**Issue:** AI insight generation may hit rate limits

**Workaround:** Wait a few minutes between insight generations

---

**Still having issues?** Don't hesitate to reach out to the community! 🤝