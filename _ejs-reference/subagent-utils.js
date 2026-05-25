/**
 * Subagent ownership and filtering utilities.
 *
 * Pure functions extracted from session-detail.js so they can be
 * shared between the Vue frontend and unit tests.
 */

/**
 * Compute subagent ownership for a list of session events.
 *
 * @param {Array} events - flat, sorted event array
 * @returns {{ ownerMap: Map<string,string>, subagentInfo: Map<string,{name:string,colorIndex:number}> }}
 */
function computeSubagentOwnership(events) {
  const ownerMap = new Map();       // stableId → toolCallId
  const subagentInfo = new Map();   // toolCallId → { name, colorIndex, meta }

  // 1. Collect all subagent.started toolCallIds + assign colorIndex
  let colorIdx = 0;
  for (const ev of events) {
    if (ev.type === 'subagent.started') {
      const tcid = ev.data?.toolCallId;
      if (tcid) {
        subagentInfo.set(tcid, {
          name: ev.data?.agentDisplayName || ev.data?.agentName || 'SubAgent',
          colorIndex: colorIdx++,
          meta: {
            agentName: ev.data?.agentName || '',
            agentDisplayName: ev.data?.agentDisplayName || '',
            agentDescription: ev.data?.agentDescription || ''
          }
        });
      }
    }
  }

  // 1a. Enrich subagentInfo with task dispatch metadata (tool.execution_start for the dispatching tool call)
  for (const ev of events) {
    if (ev.type !== 'tool.execution_start') continue;
    const tcid = ev.data?.toolCallId;
    if (!tcid || !subagentInfo.has(tcid)) continue;
    const info = subagentInfo.get(tcid);
    // Parse arguments (may be string or object)
    let args = ev.data?.arguments;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch (_e) { continue; }
    }
    if (!args || typeof args !== 'object') continue;
    // Merge task-level metadata into meta
    if (args.description) info.meta.taskDescription = args.description;
    if (args.name) info.meta.taskName = args.name;
    if (args.agent_type) info.meta.agentType = args.agent_type;
    if (args.mode) info.meta.taskMode = args.mode;
    // Use task description as display name if more specific than generic agent name
    if (args.description && info.name === (info.meta.agentDisplayName || info.meta.agentName)) {
      info.name = args.description;
    }
  }

  // 1b. VS Code source: collect subagent names from assistant.message data.subAgentName
  // (VS Code does not emit subagent.started events; subagent identity is on the message)
  for (const ev of events) {
    if (ev.type === 'assistant.message' && ev.data?.subAgentName && ev.data?.subAgentId) {
      const sid = ev.data.subAgentId;
      if (!subagentInfo.has(sid)) {
        subagentInfo.set(sid, {
          name: ev.data.subAgentName,
          colorIndex: colorIdx++,
          meta: { agentName: ev.data.subAgentName }
        });
      }
      // Directly map this event to its subagent (vscode has no parentToolCallId)
      ownerMap.set(ev.stableId, sid);
    }
  }

  // 1c. Claude format: collect subagent info from _subagent metadata on any event
  for (const ev of events) {
    if (ev._subagent?.id) {
      const sid = ev._subagent.id;
      if (!subagentInfo.has(sid)) {
        subagentInfo.set(sid, {
          name: ev._subagent.name || 'SubAgent',
          colorIndex: colorIdx++,
          meta: { agentName: ev._subagent.name || '' }
        });
      }
      ownerMap.set(ev.stableId, sid);
    }
  }

  if (subagentInfo.size === 0) return { ownerMap, subagentInfo };

  // 2. Build id → event lookup for parentId chain walking
  const idMap = new Map();
  for (const ev of events) {
    if (ev.id) idMap.set(ev.id, ev);
  }

  // 3. Attribute assistant.message events via data.parentToolCallId
  for (const ev of events) {
    if (ev.type === 'assistant.message') {
      const ptcid = ev.data?.parentToolCallId;
      if (ptcid && subagentInfo.has(ptcid)) {
        ownerMap.set(ev.stableId, ptcid);
      }
    }
  }

  // 4. Attribute reasoning events by walking parentId → assistant.message
  for (const ev of events) {
    if (ev.type !== 'reasoning') continue;
    let current = ev.parentId;
    let depth = 0;
    while (current && depth < 10) {
      const parent = idMap.get(current);
      if (!parent) break;
      if (parent.type === 'assistant.message') {
        const ptcid = parent.data?.parentToolCallId;
        if (ptcid && subagentInfo.has(ptcid)) {
          ownerMap.set(ev.stableId, ptcid);
        }
        break;
      }
      current = parent.parentId;
      depth++;
    }
  }

  // 5. Attribute tool.execution_start/complete by walking parentId chain
  const startIdByToolCallId = new Map();
  for (const ev of events) {
    if (ev.type !== 'tool.execution_start') continue;
    let current = ev.parentId;
    let depth = 0;
    while (current && depth < 10) {
      const parent = idMap.get(current);
      if (!parent) break;
      if (parent.type === 'assistant.message') {
        const ptcid = parent.data?.parentToolCallId;
        if (ptcid && subagentInfo.has(ptcid)) {
          ownerMap.set(ev.stableId, ptcid);
          const tcid = ev.data?.toolCallId;
          if (tcid) startIdByToolCallId.set(tcid, ptcid);
        }
        break;
      }
      current = parent.parentId;
      depth++;
    }
  }

  for (const ev of events) {
    if (ev.type !== 'tool.execution_complete') continue;
    const tcid = ev.data?.toolCallId;
    if (tcid && startIdByToolCallId.has(tcid)) {
      ownerMap.set(ev.stableId, startIdByToolCallId.get(tcid));
    }
  }

  // 6. Attribute tool.invocation events (VS Code format) via parentToolCallId
  for (const ev of events) {
    if (ev.type !== 'tool.invocation') continue;
    const ptcid = ev.data?.parentToolCallId;
    if (ptcid && subagentInfo.has(ptcid)) {
      ownerMap.set(ev.stableId, ptcid);
    }
  }

  // 7. Temporal attribution: attribute unowned events between subagent boundaries
  // Events between subagent.started and subagent.completed/failed are attributed
  // to the enclosing subagent if they don't already have an owner.
  let activeSubagent = null;
  for (const ev of events) {
    if (ev.type === 'subagent.started' && ev.data?.toolCallId && subagentInfo.has(ev.data.toolCallId)) {
      activeSubagent = ev.data.toolCallId;
    } else if ((ev.type === 'subagent.completed' || ev.type === 'subagent.failed') && ev.data?.toolCallId === activeSubagent) {
      activeSubagent = null;
    } else if (activeSubagent && !ownerMap.has(ev.stableId)) {
      ownerMap.set(ev.stableId, activeSubagent);
    }
  }

  // 8. Extract model for each subagent from its owned events
  for (const [tcid, info] of subagentInfo) {
    for (const ev of events) {
      const owned = ownerMap.get(ev.stableId) === tcid ||
        (ev._subagent?.id === tcid) ||
        (ev.data?.subAgentId === tcid);
      if (!owned) continue;
      const model = ev.model || ev.data?.model;
      if (model) {
        info.meta.model = model;
        break;
      }
    }
  }

  return { ownerMap, subagentInfo };
}

/**
 * Filter events to only those belonging to a specific subagent.
 *
 * @param {Array} events
 * @param {string|null} selectedSubagent - toolCallId to filter by, or null/falsy for no filter
 * @param {Map<string,string>} ownerMap - stableId → toolCallId from computeSubagentOwnership
 * @returns {Array}
 */
function filterBySubagent(events, selectedSubagent, ownerMap) {
  if (!selectedSubagent) return events;
  return events.filter(e => {
    // Include subagent dividers for this subagent
    if ((e.type === 'subagent.started' || e.type === 'subagent.completed' || e.type === 'subagent.failed') && e.data?.toolCallId === selectedSubagent) return true;
    // Include events owned by this subagent
    if (ownerMap.get(e.stableId) === selectedSubagent) return true;
    // Include events with _subagent metadata
    if (e._subagent?.id === selectedSubagent) return true;
    // Include VS Code subagent events
    if (e.data?.subAgentId === selectedSubagent) return true;
    return false;
  });
}

// Support both CommonJS (Node.js / Jest) and bundler (esbuild) environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeSubagentOwnership, filterBySubagent };
}

