# Copilot Session Viewer

[![npm version](https://img.shields.io/npm/v/@qiaolei81/copilot-session-viewer.svg)](https://www.npmjs.com/package/@qiaolei81/copilot-session-viewer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)

**AI-Assisted Session Log Analysis Tool for GitHub Copilot CLI**

A web-based visualization and analysis interface for GitHub Copilot CLI session logs. This tool provides comprehensive session inspection, time-series analysis, and event stream visualization capabilities.

---

## Quick Start

### Install via npm (recommended)

```bash
npm install -g @qiaolei81/copilot-session-viewer
copilot-session-viewer
```

Then open http://localhost:3838

### Install from source

```bash
git clone https://github.com/qiaolei81/copilot-session-viewer.git
cd copilot-session-viewer
npm install
npm start
```

---

## System Overview

### Core Capabilities

- **Session Management**: Complete CRUD operations for session archives (list, view, export, import)
- **Event Stream Analysis**: Real-time event log parsing with type filtering and search functionality
- **Time Analysis**: Turn execution timelines, sub-agent lifecycle tracking, tool invocation metrics
- **Virtual Scrolling**: High-performance rendering of large event streams (1000+ events) using Vue 3 reactive virtual scrolling
- **AI-Powered Insights**: Integrated LLM-based session analysis via GitHub Copilot CLI
- **Export/Import**: ZIP-based session sharing with metadata preservation
- **Multi-Format Support**: Directory-based sessions and legacy JSONL file formats

### Technical Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend (Vue 3 + EJS Templates)               │
│  - Virtual Scroller (vue-virtual-scroller)      │
│  - Reactive State Management                    │
│  - GitHub-Inspired Dark Theme                   │
└─────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────┐
│  Backend (Node.js + Express)                    │
│  - Session Repository (FileSystemWatcher)       │
│  - JSONL Parser (line-by-line streaming)        │
│  - Multer (file upload handling)                │
└─────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────┐
│  Data Layer                                     │
│  ~/.copilot/session-state/                      │
│  - events.jsonl (event stream)                  │
│  - workspace.yaml (metadata)                    │
│  - insight-report.md (AI analysis)              │
└─────────────────────────────────────────────────┘
```

---

## Installation

### Prerequisites

**Required:**
- Node.js >= 18.0.0 (LTS recommended)
- npm >= 9.0.0 or yarn >= 1.22.0
- GitHub Copilot CLI (for session data generation)

**Optional:**
- GitHub Copilot CLI with `--yolo` mode enabled (for AI insights feature)

### Installation Steps

**1. Clone Repository**

```bash
git clone <repository-url>
cd copilot-session-viewer
```

**2. Install Dependencies**

```bash
npm install
```

**3. Verify Installation**

```bash
npm run check
```

This command will verify:
- Node.js version compatibility
- Dependency integrity
- Session directory accessibility

**4. Configure Environment (Optional)**

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3838
NODE_ENV=development

# Session Data Directory (auto-detected if omitted)
SESSION_DIR=/custom/path/to/session-state

# Feature Flags
ENABLE_INSIGHTS=true
ENABLE_EXPORT=true
```

---

## Development

### Development Workflow

**1. Start Development Server**

```bash
npm run dev
```

This command:
- Starts Express server with `nodemon` auto-reload
- Watches template files (`.ejs`) for changes
- Disables template caching for hot-reload
- Enables verbose logging (`DEBUG=copilot-viewer:*`)

**2. Development Server Access**

Navigate to: `http://localhost:3838`

**3. Directory Structure**

```
copilot-session-viewer/
├── server.js                  # Express application entry point
├── src/
│   ├── fileUtils.js          # File system utilities
│   ├── session.js            # Session data parser
│   ├── sessionRepository.js  # Session management layer
│   └── teamsShareService.js  # (Legacy) Teams integration stub
├── views/
│   ├── index.ejs             # Session list page
│   ├── session.ejs           # Legacy session detail view
│   ├── session-vue.ejs       # Vue 3 virtual scrolling view
│   └── time-analyze.ejs      # Time analysis dashboard
├── package.json
└── README.md
```

**4. Code Style Guidelines**

This project follows standard Node.js conventions:
- **Indentation**: 2 spaces
- **Quotes**: Single quotes for JavaScript, double quotes for HTML/EJS
- **Semicolons**: Required
- **Async/Await**: Preferred over Promise chains

**5. Testing**

```bash
# Run unit tests (if available)
npm test

# Manual integration testing
npm run dev
# Navigate to http://localhost:3838 and verify all features
```

**6. Debugging**

Enable verbose logging:

```bash
DEBUG=copilot-viewer:* npm run dev
```

Inspect session parsing:

```bash
node -e "const session = require('./src/session'); session.parseSession('<session-id>').then(console.log)"
```

---

## Quick Start

### Basic Usage

**Step 1: Generate Session Data**

Use GitHub Copilot CLI to create session logs:

```bash
# Example: Run a task with Copilot CLI
copilot --model claude-sonnet-4.5 --yolo -p "Analyze this codebase"
```

Sessions are automatically saved to:
- **macOS/Linux**: `~/.copilot/session-state/`
- **Windows**: `C:\Users\<username>\.copilot\session-state\`

**Step 2: Start Viewer**

```bash
npm start
```

**Step 3: Access Web Interface**

Open browser: `http://localhost:3838`

**Step 4: Explore Sessions**

1. **Session List**: Browse all sessions with metadata (duration, event count)
2. **Session Detail**: Click any session to view event stream
3. **Time Analysis**: Click "Time Analysis" to view execution breakdown
4. **AI Insights**: Click "Generate Insight" for LLM-powered analysis (requires `copilot --yolo`)

### Advanced Features

**Exporting Sessions**

1. Navigate to session detail page
2. Click "Share Session" button
3. Download ZIP archive containing:
   - `events.jsonl`
   - `workspace.yaml`
   - `insight-report.md` (if generated)

**Importing Sessions**

1. On homepage, click "Import session from zip"
2. Select ZIP file exported from another viewer instance
3. Session automatically extracted to `~/.copilot/session-state/`

**AI Insight Generation**

Prerequisites:
- GitHub Copilot CLI installed
- `copilot --yolo` mode functional

Process:
1. Navigate to Time Analysis tab
2. Click "Copilot Insight" tab
3. Click "Generate Insight" button
4. System executes: `copilot --yolo -p "<analysis-prompt>"`
5. Real-time streaming output displayed
6. Report saved to `session-dir/insight-report.md`

---

## Configuration

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | Integer | `3838` | HTTP server port |
| `NODE_ENV` | String | `development` | Environment mode (`development` \| `production`) |
| `SESSION_DIR` | Path | `~/.copilot/session-state` | Session data directory |
| `ENABLE_INSIGHTS` | Boolean | `true` | Enable AI insights feature |
| `ENABLE_EXPORT` | Boolean | `true` | Enable session export/import |

### Production Deployment

**Option 1: Direct Execution**

```bash
NODE_ENV=production PORT=8080 npm start
```

**Option 2: Process Manager (PM2)**

```bash
npm install -g pm2
pm2 start server.js --name copilot-viewer
pm2 save
```

**Option 3: Docker (Example)**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3838
CMD ["node", "server.js"]
```

```bash
docker build -t copilot-viewer .
docker run -p 3838:3838 -v ~/.copilot:/root/.copilot copilot-viewer
```

**Production Optimizations:**
- Template caching enabled (`NODE_ENV=production`)
- Static asset compression (gzip)
- Session directory monitoring disabled for performance

---

## Session Data Format

### Directory-Based Format (Current)

```
~/.copilot/session-state/<session-id>/
├── events.jsonl              # Event stream (JSONL format)
├── workspace.yaml            # Session metadata
├── checkpoints/              # Session checkpoints (optional)
├── files/                    # Temporary file artifacts
└── insight-report.md         # AI-generated analysis (optional)
```

### JSONL Event Structure

Each line in `events.jsonl` is a JSON object:

```json
{
  "type": "user.message",
  "timestamp": "2026-02-15T02:30:00.000Z",
  "message": "Analyze this codebase",
  "parentId": "msg_abc123",
  "turnId": 0,
  "userReqNumber": 1
}
```

### Event Type Taxonomy

| Category | Event Types | Description |
|----------|-------------|-------------|
| **Session** | `session.start`, `session.model_change` | Session lifecycle |
| **User** | `user.message`, `user.confirmation` | User interactions |
| **Assistant** | `assistant.message`, `assistant.turn_start`, `assistant.turn_end` | LLM responses |
| **Tool** | `tool.execution_start`, `tool.execution_complete` | Tool invocations |
| **Sub-Agent** | `subagent.started`, `subagent.completed` | Sub-agent lifecycle |
| **System** | `client.log`, `error` | System diagnostics |

---

## API Reference

### REST Endpoints

**Session List**

```http
GET /api/sessions
```

Response:
```json
[
  {
    "id": "f9db650c-1f87-491f-8e4f-52d45538d677",
    "startTime": "2026-02-15T02:30:00.000Z",
    "duration": 17936000,
    "eventCount": 1044,
    "type": "directory"
  }
]
```

**Session Events**

```http
GET /api/session/:id/events
```

Response: JSONL stream

**AI Insight Generation**

```http
POST /session/:id/insight
Content-Type: application/json

{}
```

Response (SSE stream):
```
data: {"status":"generating","progress":0.1}
data: {"status":"generating","progress":0.5}
data: {"status":"completed","report":"..."}
```

**Session Export**

```http
GET /session/:id/download
```

Response: `application/zip` (session archive)

**Session Import**

```http
POST /session/import
Content-Type: multipart/form-data

file: <session.zip>
```

Response:
```json
{
  "success": true,
  "sessionId": "imported-session-id"
}
```

---

## Feature Documentation

### Time Analysis Dashboard

**Components:**

1. **Summary Cards**
   - Total Duration
   - Tool Call Count
   - Average Tool Duration
   - Sub-Agent Count

2. **Turns Tab**
   - Grouped by UserReq (user request)
   - Timeline visualization (gantt chart in table)
   - Turn-level metrics (duration, tool calls)

3. **Sub-Agents Tab**
   - Agent lifecycle timeline
   - Status indicators (Completed ✓ | Failed ✗ | Incomplete ⏳)
   - Tool call aggregation

4. **Tool Summary Tab**
   - Tool invocation frequency
   - Average duration per tool
   - Category-based aggregation

5. **Copilot Insight Tab**
   - AI-powered session analysis
   - Incremental generation with progress tracking
   - Timeout handling (5-minute threshold)
   - Force regenerate option

### Virtual Scrolling

**Performance Characteristics:**

- **Rendering**: Only visible items rendered (viewport + buffer)
- **Capacity**: Tested up to 10,000 events without performance degradation
- **Memory**: Constant memory footprint regardless of event count
- **Scroll**: 60 FPS smooth scrolling

**Implementation Details:**

```javascript
// Vue 3 + vue-virtual-scroller
<virtual-scroller
  :items="events"
  :item-size="80"
  :buffer="200"
  key-field="index"
>
  <template #default="{ item }">
    <!-- Event rendering -->
  </template>
</virtual-scroller>
```

---

## Troubleshooting

### Common Issues

**Issue: Session directory not found**

```
Error: ENOENT: no such file or directory, scandir '/Users/xxx/.copilot/session-state'
```

**Solution:**
1. Verify GitHub Copilot CLI is installed: `copilot --version`
2. Run at least one Copilot CLI command to initialize session directory
3. Or manually set `SESSION_DIR` in `.env`

**Issue: Port already in use**

```
Error: listen EADDRINUSE: address already in use :::3838
```

**Solution:**
```bash
# Option 1: Kill existing process
lsof -ti:3838 | xargs kill -9

# Option 2: Use different port
PORT=3839 npm start
```

**Issue: AI Insight generation fails**

```
Error: copilot command not found
```

**Solution:**
1. Install GitHub Copilot CLI
2. Verify `copilot --yolo` works: `echo "test" | copilot --yolo -p "analyze"`
3. Check PATH includes Copilot CLI binary location

**Issue: Large session crashes browser**

**Solution:**
- Upgrade to `session-vue.ejs` view (automatic for 500+ events)
- Virtual scrolling handles sessions up to 10,000 events
- If issues persist, increase browser memory limit

---

## Performance Optimization

### Server-Side

- **Template Caching**: Enabled in production (`NODE_ENV=production`)
- **JSONL Streaming**: Line-by-line parsing (constant memory)
- **Session Repository**: In-memory cache with file system watching

### Client-Side

- **Virtual Scrolling**: Only render visible DOM nodes
- **Event Batching**: Process events in chunks (100 at a time)
- **Debounced Search**: 300ms delay to prevent excessive filtering
- **CSS Containment**: `contain: layout style` for scroller items

---

## Roadmap

- [ ] WebSocket support for real-time session updates
- [ ] Advanced filtering (regex, date ranges, multi-field queries)
- [ ] Session comparison (diff view for multiple sessions)
- [ ] Export formats (CSV, JSON, HTML report)
- [ ] Authentication/authorization for multi-user deployments
- [ ] Database backend (PostgreSQL/SQLite) for large-scale deployments

---

## Contributing

This project is maintained as an internal tool. External contributions are not currently accepted.

For bug reports or feature requests, contact the repository maintainer.

---

## License

MIT License - See LICENSE file for details

---

## Acknowledgments

**AI-Generated Code:**
This project was developed with assistance from GitHub Copilot and Claude AI. All code generation, documentation, and architectural decisions were guided by AI-assisted development workflows.

**Dependencies:**
- Vue 3 (Frontend reactivity)
- vue-virtual-scroller (Performance-critical virtual scrolling)
- Express.js (HTTP server framework)
- EJS (Server-side templating)
- Multer (File upload handling)

**Inspired By:**
GitHub Copilot CLI session architecture and event stream design patterns.

---

**Status:** Active Development | **Version:** 1.0.0 | **Last Updated:** 2026-02-15
