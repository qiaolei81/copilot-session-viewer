# 🔌 API Documentation

REST API endpoints for Copilot Session Viewer.

---

## Base URL

```
http://localhost:3838
```

---

## Authentication

**None required** - This is a local development tool with no authentication.

---

## Endpoints

### Sessions

#### List Sessions

Get all sessions with optional pagination.

```http
GET /api/sessions
```

**Query Parameters:**
- `page` (number, optional) - Page number for pagination
- `limit` (number, optional) - Items per page

**Response:**
```json
[
  {
    "id": "f9db650c-1f87-491f-8e4f-52d45538d677",
    "summary": "Analyze this codebase structure",
    "createdAt": "2026-02-15T02:30:00.000Z",
    "duration": 17936000,
    "eventCount": 1044,
    "type": "directory",
    "workspace": {
      "cwd": "/Users/dev/my-project"
    },
    "selectedModel": "claude-sonnet-4.5",
    "copilotVersion": "0.0.410",
    "isImported": false,
    "hasInsight": true
  }
]
```

**Example:**
```bash
curl http://localhost:3838/api/sessions
```

---

#### Load More Sessions

Get additional sessions with offset-based pagination (for infinite scroll).

```http
GET /api/sessions/load-more
```

**Query Parameters:**
- `offset` (number, required) - Number of sessions to skip
- `limit` (number, optional, default: 20) - Number of sessions to return

**Response:**
```json
{
  "sessions": [
    {
      "id": "session-id",
      "summary": "Session summary",
      // ... same structure as /api/sessions
    }
  ],
  "hasMore": true,
  "totalSessions": 237
}
```

**Example:**
```bash
curl "http://localhost:3838/api/sessions/load-more?offset=20&limit=20"
```

---

#### Get Session Events

Retrieve all events for a specific session.

```http
GET /api/sessions/:sessionId/events
```

**Path Parameters:**
- `sessionId` (string, required) - UUID of the session

**Response:** JSONL stream (one JSON object per line)
```
{"type":"session.start","timestamp":"2026-02-15T02:30:00.000Z","sessionId":"f9db650c..."}
{"type":"user.message","timestamp":"2026-02-15T02:30:01.000Z","message":"Analyze this code","turnId":0}
{"type":"assistant.message","timestamp":"2026-02-15T02:30:05.000Z","message":"I'll help you analyze...","turnId":0}
```

**Example:**
```bash
curl http://localhost:3838/api/sessions/f9db650c-1f87-491f-8e4f-52d45538d677/events
```

---

### Session Management

#### Get Session Details

Get detailed information about a specific session.

```http
GET /session/:sessionId
```

**Response:** HTML page with session viewer interface

---

#### Export Session

Download a session as a ZIP archive.

```http
GET /session/:sessionId/download
```

**Response:**
- **Content-Type:** `application/zip`
- **Content-Disposition:** `attachment; filename="session-{sessionId}.zip"`

**ZIP Contents:**
- `events.jsonl` - Event stream data
- `workspace.yaml` - Session metadata
- `copilot-insight.md` - AI analysis (if available)

**Example:**
```bash
curl -O http://localhost:3838/session/f9db650c-1f87-491f-8e4f-52d45538d677/download
```

---

#### Import Session

Upload and import a session ZIP file.

```http
POST /session/import
```

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `sessionZip` (file, required) - ZIP file containing session data

**Response:**
```json
{
  "success": true,
  "sessionId": "imported-session-uuid",
  "message": "Session imported successfully"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Invalid ZIP file format"
}
```

**Example:**
```bash
curl -X POST \
  -F "sessionZip=@session-export.zip" \
  http://localhost:3838/session/import
```

---

### AI Insights

#### Generate Insight

Generate an AI-powered analysis of a session.

```http
POST /session/:sessionId/insight
```

**Request Body:**
```json
{}
```

**Response:** Server-Sent Events (SSE) stream

**SSE Event Types:**
```
data: {"type":"start","message":"Starting analysis..."}
data: {"type":"progress","message":"Analyzing events...","percent":25}
data: {"type":"content","content":"## Session Analysis\n\nThis session shows..."}
data: {"type":"complete","message":"Analysis complete"}
```

**Example:**
```bash
curl -X POST \
  -H "Accept: text/event-stream" \
  http://localhost:3838/session/f9db650c-1f87-491f-8e4f-52d45538d677/insight
```

---

#### Get Insight Status

Check if an insight exists for a session.

```http
GET /session/:sessionId/insight
```

**Response:**
```json
{
  "exists": true,
  "path": "/path/to/copilot-insight.md",
  "size": 15420,
  "lastModified": "2026-02-15T02:35:00.000Z"
}
```

---

#### Delete Insight

Remove the generated insight for a session.

```http
DELETE /session/:sessionId/insight
```

**Response:**
```json
{
  "success": true,
  "message": "Insight deleted successfully"
}
```

---

## Data Types

### Session Object

```typescript
interface Session {
  id: string;                    // UUID
  summary: string;               // Human-readable description
  createdAt: string;            // ISO timestamp
  duration?: number;            // Duration in milliseconds
  eventCount: number;           // Number of events in session
  type: "directory" | "file";   // Session format type
  workspace?: {
    cwd: string;                // Working directory
  };
  selectedModel?: string;       // AI model used
  copilotVersion?: string;      // Copilot CLI version
  isImported: boolean;          // Whether session was imported
  hasInsight: boolean;          // Whether AI insight exists
}
```

### Event Object

```typescript
interface Event {
  type: string;                 // Event type (e.g., "user.message")
  timestamp: string;            // ISO timestamp
  [key: string]: any;          // Additional event-specific fields
}
```

### Common Event Types

| Category | Event Types | Description |
|----------|-------------|-------------|
| **Session** | `session.start`, `session.model_change` | Session lifecycle |
| **User** | `user.message`, `user.confirmation` | User interactions |
| **Assistant** | `assistant.message`, `assistant.turn_start`, `assistant.turn_end` | AI responses |
| **Tool** | `tool.execution_start`, `tool.execution_complete` | Tool invocations |
| **Sub-Agent** | `subagent.started`, `subagent.completed` | Sub-agent lifecycle |
| **System** | `client.log`, `error` | System diagnostics |

---

## Error Responses

### Standard Error Format

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": "Additional details"
}
```

### HTTP Status Codes

| Code | Description | Common Causes |
|------|-------------|---------------|
| `200` | OK | Request successful |
| `400` | Bad Request | Invalid session ID, malformed request |
| `404` | Not Found | Session not found, endpoint not found |
| `500` | Internal Server Error | File system errors, processing errors |

### Example Error Responses

**Invalid Session ID:**
```json
{
  "error": "Invalid session ID format",
  "code": "INVALID_SESSION_ID"
}
```

**Session Not Found:**
```json
{
  "error": "Session not found",
  "code": "SESSION_NOT_FOUND"
}
```

**File System Error:**
```json
{
  "error": "Unable to read session directory",
  "code": "FILE_SYSTEM_ERROR",
  "details": "ENOENT: no such file or directory"
}
```

---

## Rate Limiting

### Current Limits

- **General requests**: 100 requests per minute
- **Insight generation**: 5 requests per minute
- **File uploads**: 10 requests per minute

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

---

## WebSocket Support

**Not currently implemented** - All communication is via REST API and SSE.

Future versions may include WebSocket support for:
- Real-time session updates
- Live event streaming
- Multi-user collaboration

---

## SDK / Client Libraries

### JavaScript/Node.js

```javascript
// Basic API client example
class CopilotSessionViewer {
  constructor(baseURL = 'http://localhost:3838') {
    this.baseURL = baseURL;
  }

  async getSessions() {
    const response = await fetch(`${this.baseURL}/api/sessions`);
    return response.json();
  }

  async getSessionEvents(sessionId) {
    const response = await fetch(`${this.baseURL}/api/sessions/${sessionId}/events`);
    const text = await response.text();
    return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
  }

  async exportSession(sessionId) {
    const response = await fetch(`${this.baseURL}/session/${sessionId}/download`);
    return response.blob();
  }
}

// Usage
const viewer = new CopilotSessionViewer();
const sessions = await viewer.getSessions();
```

### Python

```python
import requests
import json

class CopilotSessionViewer:
    def __init__(self, base_url="http://localhost:3838"):
        self.base_url = base_url

    def get_sessions(self):
        response = requests.get(f"{self.base_url}/api/sessions")
        return response.json()

    def get_session_events(self, session_id):
        response = requests.get(f"{self.base_url}/api/sessions/{session_id}/events")
        return [json.loads(line) for line in response.text.strip().split('\n')]

    def export_session(self, session_id, filename):
        response = requests.get(f"{self.base_url}/session/{session_id}/download")
        with open(filename, 'wb') as f:
            f.write(response.content)

# Usage
viewer = CopilotSessionViewer()
sessions = viewer.get_sessions()
```

---

## OpenAPI Specification

A complete OpenAPI 3.0 specification is available at:
```
http://localhost:3838/api/openapi.json
```

You can use this with tools like Swagger UI, Postman, or code generators.

---

**Need help?** Check the [Troubleshooting Guide](TROUBLESHOOTING.md) or [open an issue](https://github.com/qiaolei81/copilot-session-viewer/issues).