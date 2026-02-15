#!/usr/bin/env node

/**
 * Generate mock session data for CI testing
 * Creates a minimal but valid session directory structure
 */

const fs = require('fs');
const path = require('path');

// Session ID for testing
const SESSION_ID = 'test-session-ci-12345678';

// Session directory (use env var or default)
const SESSION_DIR = process.env.SESSION_DIR || path.join(process.env.HOME || '/tmp', '.copilot', 'session-state');
const sessionPath = path.join(SESSION_DIR, SESSION_ID);

// Create session directory
fs.mkdirSync(sessionPath, { recursive: true });

// Generate mock events.jsonl
const events = [
  {
    type: 'session.start',
    timestamp: Date.now() - 60000,
    data: {
      copilotVersion: '0.0.409',
      producer: 'copilot-agent',
      selectedModel: 'claude-sonnet-4.5',
      startTime: new Date(Date.now() - 60000).toISOString()
    }
  },
  {
    type: 'user.message',
    timestamp: Date.now() - 55000,
    data: {
      content: 'Hello, can you help me with a coding task?'
    }
  },
  {
    type: 'assistant.turn_start',
    timestamp: Date.now() - 54000,
    data: {}
  },
  {
    type: 'assistant.message',
    timestamp: Date.now() - 50000,
    data: {
      content: 'Of course! I\'d be happy to help you with your coding task.',
      toolRequests: []
    }
  },
  {
    type: 'tool.execution_start',
    timestamp: Date.now() - 48000,
    parentId: 'msg-001',
    data: {
      toolCallId: 'tool-001',
      tool: 'read',
      toolName: 'read',
      arguments: { path: 'test.js' }
    }
  },
  {
    type: 'tool.execution_complete',
    timestamp: Date.now() - 45000,
    parentId: 'msg-001',
    data: {
      toolCallId: 'tool-001',
      result: 'console.log("Hello World");'
    }
  },
  {
    type: 'assistant.turn_complete',
    timestamp: Date.now() - 40000,
    data: {}
  },
  {
    type: 'session.end',
    timestamp: Date.now() - 30000,
    data: {
      endTime: new Date(Date.now() - 30000).toISOString()
    }
  }
];

// Write events.jsonl
const eventsContent = events.map(e => JSON.stringify(e)).join('\n');
fs.writeFileSync(path.join(sessionPath, 'events.jsonl'), eventsContent);

// Generate workspace.yaml
const workspace = `cwd: /tmp/test-workspace
prompt: Test session for CI
model: claude-sonnet-4.5
startTime: ${new Date(Date.now() - 60000).toISOString()}
endTime: ${new Date(Date.now() - 30000).toISOString()}
`;

fs.writeFileSync(path.join(sessionPath, 'workspace.yaml'), workspace);

console.log(`✅ Mock session created: ${SESSION_ID}`);
console.log(`📂 Location: ${sessionPath}`);
console.log(`📊 Events: ${events.length}`);
