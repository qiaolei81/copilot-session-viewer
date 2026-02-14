# Copilot Session Viewer 🤖

A web UI for viewing and browsing GitHub Copilot CLI session logs with Vue-based virtual scrolling.

## Features

- 📋 **List all sessions** - Browse all Copilot CLI sessions from `~/.copilot/session-state/`
- 🔍 **Search & Filter** - Search by session ID, summary, or repository; filter by event type
- 📊 **Session Details** - View complete event logs with Vue virtual scrolling for smooth performance
- 🎨 **Event Type Filtering** - Filter events by type (user messages, assistant responses, tool calls, etc.)
- ⚡ **Virtual Scrolling** - Smooth performance even with thousands of events (Vue + vue-virtual-scroller)
- 💾 **Supports Both Formats** - Handles both directory-based sessions and legacy `.jsonl` files
- 🌗 **Dark Theme** - GitHub-inspired dark UI
- 🔦 **Search Highlighting** - Keywords highlighted in search results

## Installation

```bash
cd ~/workspace/copilot-session-viewer
npm install
```

## Usage

Start the server:

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

Then open your browser to:

**http://localhost:3838**

## Session Data Location

The viewer reads session data from:
```
~/.copilot/session-state/
```

This includes:
- Directory-based sessions (current format)
- Legacy `.jsonl` sessions (older format)

## Session Structure

### Directory Format
```
~/.copilot/session-state/
└── <session-id>/
    ├── events.jsonl       # Event log (JSONL)
    ├── workspace.yaml     # Session metadata
    ├── checkpoints/       # Session checkpoints
    └── files/             # Temporary files
```

### File Format
```
~/.copilot/session-state/
└── <session-id>.jsonl     # Event log
```

## Event Types

The viewer displays various event types:
- `session.start` - Session initialization
- `session.model_change` - Model switches
- `user.message` - User prompts
- `assistant.message` - AI responses
- `assistant.turn_start` / `assistant.turn_end` - Turn boundaries
- `tool.execution_start` / `tool.execution_complete` - Tool executions
- `subagent.started` / `subagent.completed` - Subagent runs
- And more...

## API Endpoints

- `GET /` - List all sessions
- `GET /session/:id` - View session with Vue virtual scrolling
- `GET /api/sessions` - JSON list of all sessions
- `GET /api/session/:id/events` - JSON events for a session

## Tech Stack

- **Backend**: Node.js + Express
- **Templating**: EJS
- **Frontend**: Vue 3 + vue-virtual-scroller
- **Styling**: Pure CSS (GitHub-inspired)
- **Performance**: Dynamic virtual scrolling with Vue reactivity

## License

MIT
