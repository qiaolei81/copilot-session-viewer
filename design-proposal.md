# Copilot Session Viewer - UI Redesign

## Design Principles
1. **Visual Hierarchy** - Clear distinction between user/assistant/system
2. **Scanability** - Easy to skim through conversation flow
3. **Density Control** - Compact but not cramped
4. **Tool Call Clarity** - Inline, collapsible, with status

## Layout Structure

```
┌─────────────────────────────────────────┐
│ [Timeline]  [Badge] [Timestamp]         │
│    │                                     │
│    ├─ Message content (if any)          │
│    │                                     │
│    └─ Tools (inline boxes)              │
│       ┌─────────────────────────────┐   │
│       │ ✓ tool_name (0.5s)          │   │
│       │ └─ result preview...        │   │
│       └─────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## Visual Changes

### Events
- **User**: Blue badge 🧑 + blue timeline dot
- **Assistant**: Green badge 🤖 + green timeline dot
- **System**: Gray badge ⚙️ + gray timeline dot

### Tool Calls
- Inline card style (not tree connectors)
- Status icon: ⏳ running, ✓ success, ⚠️ error
- Expandable result (click to show full)
- Color-coded border: green success, red error, yellow running

### Typography
- Event badge: 11px uppercase, semibold
- Timestamp: 10px, muted
- Message: 13px, regular, line-height 1.6
- Tool name: 12px, monospace
- Tool result: 11px, monospace, muted

### Spacing
- Event vertical gap: 16px
- Tool call gap: 8px
- Internal padding: 8px cards, 12px messages

## Sample Code Structure

```html
<div class="event user">
  <div class="timeline-dot"></div>
  <div class="event-header">
    <span class="badge">🧑 USER</span>
    <span class="timestamp">17:41:29</span>
  </div>
  <div class="message">
    Rewrite this project to springboot
  </div>
</div>

<div class="event assistant">
  <div class="timeline-dot"></div>
  <div class="event-header">
    <span class="badge">🤖 ASSISTANT</span>
    <span class="timestamp">17:41:37</span>
  </div>
  <div class="message">
    I'll start by resolving the KIT_ROOT...
  </div>
  <div class="tools">
    <div class="tool-card success">
      <div class="tool-header">
        <span class="status">✓</span>
        <span class="name">report_intent</span>
        <span class="duration">0.5s</span>
      </div>
      <div class="tool-result collapsed">
        Intent logged • Resolving paths & exploring...
      </div>
    </div>
  </div>
</div>
```

## Color Palette (GitHub Dark)
- Background: #0d1117
- Card bg: #161b22
- Border: #30363d
- Text primary: #e6edf3
- Text secondary: #7d8590
- Blue: #58a6ff
- Green: #3fb950
- Red: #f85149
- Yellow: #d29922
- Timeline: #30363d
