# Test Fixtures

## generate-test-session.js

Generates a minimal mock Copilot CLI session for E2E testing in CI.

**Usage:**

```bash
# Use default location (~/.copilot/session-state/)
node generate-test-session.js

# Use custom location
SESSION_DIR=/path/to/sessions node generate-test-session.js
```

**Generated structure:**

```
test-session-ci-12345678/
├── events.jsonl      # Mock event stream (8 events)
└── workspace.yaml    # Session metadata
```

**Events included:**
- session.start
- user.message
- assistant.turn_start
- assistant.message
- tool.execution_start
- tool.execution_complete
- assistant.turn_complete
- session.end

This provides enough coverage for basic E2E tests without requiring a real Copilot CLI installation.
