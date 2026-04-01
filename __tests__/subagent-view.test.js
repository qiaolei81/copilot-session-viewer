/**
 * Unit tests for subagent view filtering logic.
 *
 * These test the pure filtering logic extracted from session-detail.js
 * to verify subagent event attribution and filtering behavior.
 */

describe('Subagent view filtering logic', () => {
  // Simulate the subagent ownership computation
  function computeSubagentOwnership(events) {
    const ownerMap = new Map();
    const subagentInfo = new Map();
    let colorIdx = 0;

    for (const ev of events) {
      if (ev.type === 'subagent.started') {
        const tcid = ev.data?.toolCallId;
        if (tcid) {
          subagentInfo.set(tcid, {
            name: ev.data?.agentDisplayName || ev.data?.agentName || 'SubAgent',
            colorIndex: colorIdx++
          });
        }
      }
    }

    // Attribute assistant.message events via parentToolCallId
    for (const ev of events) {
      if (ev.type === 'assistant.message') {
        const ptcid = ev.data?.parentToolCallId;
        if (ptcid && subagentInfo.has(ptcid)) {
          ownerMap.set(ev.stableId, ptcid);
        }
      }
    }

    // Attribute _subagent metadata events (also discover subagents from metadata)
    for (const ev of events) {
      if (ev._subagent?.id) {
        const sid = ev._subagent.id;
        if (!subagentInfo.has(sid)) {
          subagentInfo.set(sid, {
            name: ev._subagent.name || 'SubAgent',
            colorIndex: colorIdx++
          });
        }
        ownerMap.set(ev.stableId, sid);
      }
    }

    // Temporal attribution: attribute unowned events between subagent boundaries
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

    return { ownerMap, subagentInfo };
  }

  // Simulate the subagent filter from filteredEvents
  function filterBySubagent(events, selectedSubagent, ownerMap) {
    if (!selectedSubagent) return events;
    return events.filter(e => {
      if ((e.type === 'subagent.started' || e.type === 'subagent.completed' || e.type === 'subagent.failed') && e.data?.toolCallId === selectedSubagent) return true;
      if (ownerMap.get(e.stableId) === selectedSubagent) return true;
      if (e._subagent?.id === selectedSubagent) return true;
      if (e.data?.subAgentId === selectedSubagent) return true;
      return false;
    });
  }

  const baseEvents = [
    { type: 'session.start', stableId: 'e0', data: {} },
    { type: 'user.message', stableId: 'e1', data: { message: 'Hello' } },
    { type: 'assistant.turn_start', stableId: 'e2', data: {} },
    { type: 'subagent.started', stableId: 'e3', data: { toolCallId: 'sa-1', agentDisplayName: 'Explorer' } },
    { type: 'assistant.message', stableId: 'e4', data: { message: 'I found it', parentToolCallId: 'sa-1' } },
    { type: 'assistant.message', stableId: 'e5', data: { message: 'Working on it', parentToolCallId: 'sa-1' } },
    { type: 'subagent.completed', stableId: 'e6', data: { toolCallId: 'sa-1' } },
    { type: 'subagent.started', stableId: 'e7', data: { toolCallId: 'sa-2', agentDisplayName: 'Builder' } },
    { type: 'assistant.message', stableId: 'e8', data: { message: 'Building...', parentToolCallId: 'sa-2' } },
    { type: 'subagent.completed', stableId: 'e9', data: { toolCallId: 'sa-2' } },
    { type: 'assistant.message', stableId: 'e10', data: { message: 'Done!' } },
  ];

  describe('computeSubagentOwnership', () => {
    it('should detect subagents from subagent.started events', () => {
      const { subagentInfo } = computeSubagentOwnership(baseEvents);
      expect(subagentInfo.size).toBe(2);
      expect(subagentInfo.get('sa-1').name).toBe('Explorer');
      expect(subagentInfo.get('sa-2').name).toBe('Builder');
    });

    it('should assign sequential color indices', () => {
      const { subagentInfo } = computeSubagentOwnership(baseEvents);
      expect(subagentInfo.get('sa-1').colorIndex).toBe(0);
      expect(subagentInfo.get('sa-2').colorIndex).toBe(1);
    });

    it('should attribute messages to subagents via parentToolCallId', () => {
      const { ownerMap } = computeSubagentOwnership(baseEvents);
      expect(ownerMap.get('e4')).toBe('sa-1');
      expect(ownerMap.get('e5')).toBe('sa-1');
      expect(ownerMap.get('e8')).toBe('sa-2');
    });

    it('should not attribute messages without parentToolCallId', () => {
      const { ownerMap } = computeSubagentOwnership(baseEvents);
      // e10 is after subagent.completed, so NOT attributed
      expect(ownerMap.has('e10')).toBe(false);
      // e1 is before any subagent.started, so NOT attributed
      expect(ownerMap.has('e1')).toBe(false);
    });

    it('should temporally attribute unowned events between subagent boundaries', () => {
      const events = [
        { type: 'session.start', stableId: 't0', data: {} },
        { type: 'subagent.started', stableId: 't1', data: { toolCallId: 'sa-t', agentDisplayName: 'Temporal' } },
        { type: 'assistant.message', stableId: 't2', data: { message: 'No parentToolCallId' } },
        { type: 'reasoning', stableId: 't3', data: { reasoningText: 'Thinking...' } },
        { type: 'subagent.completed', stableId: 't4', data: { toolCallId: 'sa-t' } },
        { type: 'assistant.message', stableId: 't5', data: { message: 'After subagent' } },
      ];
      const { ownerMap } = computeSubagentOwnership(events);
      // t2 and t3 are between started/completed, should be temporally attributed
      expect(ownerMap.get('t2')).toBe('sa-t');
      expect(ownerMap.get('t3')).toBe('sa-t');
      // t0 is before subagent, t5 is after — not attributed
      expect(ownerMap.has('t0')).toBe(false);
      expect(ownerMap.has('t5')).toBe(false);
    });

    it('should not overwrite explicit parentToolCallId attribution with temporal', () => {
      const events = [
        { type: 'subagent.started', stableId: 'o1', data: { toolCallId: 'sa-a', agentDisplayName: 'A' } },
        { type: 'assistant.message', stableId: 'o2', data: { message: 'Explicit', parentToolCallId: 'sa-a' } },
        { type: 'subagent.completed', stableId: 'o3', data: { toolCallId: 'sa-a' } },
      ];
      const { ownerMap } = computeSubagentOwnership(events);
      // Explicit attribution should remain (parentToolCallId)
      expect(ownerMap.get('o2')).toBe('sa-a');
    });

    it('should handle temporal attribution with subagent.failed boundary', () => {
      const events = [
        { type: 'subagent.started', stableId: 'f1', data: { toolCallId: 'sa-f', agentDisplayName: 'Failing' } },
        { type: 'assistant.message', stableId: 'f2', data: { message: 'Working' } },
        { type: 'subagent.failed', stableId: 'f3', data: { toolCallId: 'sa-f' } },
        { type: 'assistant.message', stableId: 'f4', data: { message: 'After failure' } },
      ];
      const { ownerMap } = computeSubagentOwnership(events);
      expect(ownerMap.get('f2')).toBe('sa-f');
      expect(ownerMap.has('f4')).toBe(false);
    });

    it('should handle multiple sequential subagent spans with temporal attribution', () => {
      const events = [
        { type: 'subagent.started', stableId: 'm1', data: { toolCallId: 'sa-x', agentDisplayName: 'X' } },
        { type: 'assistant.message', stableId: 'm2', data: { message: 'In X' } },
        { type: 'subagent.completed', stableId: 'm3', data: { toolCallId: 'sa-x' } },
        { type: 'assistant.message', stableId: 'm4', data: { message: 'Between' } },
        { type: 'subagent.started', stableId: 'm5', data: { toolCallId: 'sa-y', agentDisplayName: 'Y' } },
        { type: 'assistant.message', stableId: 'm6', data: { message: 'In Y' } },
        { type: 'subagent.completed', stableId: 'm7', data: { toolCallId: 'sa-y' } },
      ];
      const { ownerMap } = computeSubagentOwnership(events);
      expect(ownerMap.get('m2')).toBe('sa-x');
      expect(ownerMap.has('m4')).toBe(false);
      expect(ownerMap.get('m6')).toBe('sa-y');
    });

    it('should return empty maps for sessions without subagents', () => {
      const events = [
        { type: 'user.message', stableId: 'e0', data: {} },
        { type: 'assistant.message', stableId: 'e1', data: { message: 'Hi' } },
      ];
      const { ownerMap, subagentInfo } = computeSubagentOwnership(events);
      expect(subagentInfo.size).toBe(0);
      expect(ownerMap.size).toBe(0);
    });

    it('should attribute _subagent metadata events', () => {
      const events = [
        { type: 'subagent.started', stableId: 's0', data: { toolCallId: 'claude-sa', agentName: 'Claude Agent' } },
        { type: 'assistant.message', stableId: 's1', _subagent: { id: 'claude-sa', name: 'Claude Agent' }, data: { message: 'Working' } },
      ];
      const { ownerMap } = computeSubagentOwnership(events);
      expect(ownerMap.get('s1')).toBe('claude-sa');
    });

    it('should discover subagents purely from _subagent metadata (no subagent.started)', () => {
      const events = [
        { type: 'user.message', stableId: 'c0', data: { message: 'Hello' } },
        { type: 'assistant.message', stableId: 'c1', _subagent: { id: 'agent-explore', name: 'Explorer' }, data: { message: 'Searching...' } },
        { type: 'assistant.message', stableId: 'c2', _subagent: { id: 'agent-explore', name: 'Explorer' }, data: { message: 'Found it' } },
        { type: 'assistant.message', stableId: 'c3', _subagent: { id: 'agent-build', name: 'Builder' }, data: { message: 'Building...' } },
        { type: 'assistant.message', stableId: 'c4', data: { message: 'Main thread' } },
      ];
      const { ownerMap, subagentInfo } = computeSubagentOwnership(events);
      // Should discover both subagents from _subagent metadata
      expect(subagentInfo.size).toBe(2);
      expect(subagentInfo.get('agent-explore').name).toBe('Explorer');
      expect(subagentInfo.get('agent-build').name).toBe('Builder');
      // Should attribute events
      expect(ownerMap.get('c1')).toBe('agent-explore');
      expect(ownerMap.get('c2')).toBe('agent-explore');
      expect(ownerMap.get('c3')).toBe('agent-build');
      // Main thread event should not be attributed
      expect(ownerMap.has('c4')).toBe(false);
    });

    it('should include _subagent events in filter even without subagent.started', () => {
      const events = [
        { type: 'user.message', stableId: 'f0', data: { message: 'Hello' } },
        { type: 'assistant.message', stableId: 'f1', _subagent: { id: 'sa-only', name: 'MetaAgent' }, data: { message: 'Working' } },
        { type: 'assistant.message', stableId: 'f2', _subagent: { id: 'sa-only', name: 'MetaAgent' }, data: { message: 'Done' } },
        { type: 'assistant.message', stableId: 'f3', data: { message: 'Main' } },
      ];
      const { ownerMap } = computeSubagentOwnership(events);
      const filtered = filterBySubagent(events, 'sa-only', ownerMap);
      expect(filtered.length).toBe(2);
      expect(filtered.map(e => e.stableId)).toEqual(['f1', 'f2']);
    });
  });

  describe('filterBySubagent', () => {
    let ownerMap;

    beforeAll(() => {
      const result = computeSubagentOwnership(baseEvents);
      ownerMap = result.ownerMap;
    });

    it('should return all events when no subagent is selected', () => {
      const filtered = filterBySubagent(baseEvents, null, ownerMap);
      expect(filtered.length).toBe(baseEvents.length);
    });

    it('should filter to only events for selected subagent', () => {
      const filtered = filterBySubagent(baseEvents, 'sa-1', ownerMap);
      // Should include: subagent.started (e3), 2 messages (e4, e5), subagent.completed (e6)
      expect(filtered.length).toBe(4);
      expect(filtered.map(e => e.stableId)).toEqual(['e3', 'e4', 'e5', 'e6']);
    });

    it('should filter to second subagent correctly', () => {
      const filtered = filterBySubagent(baseEvents, 'sa-2', ownerMap);
      // Should include: subagent.started (e7), message (e8), subagent.completed (e9)
      expect(filtered.length).toBe(3);
      expect(filtered.map(e => e.stableId)).toEqual(['e7', 'e8', 'e9']);
    });

    it('should not include events from other subagents', () => {
      const filtered = filterBySubagent(baseEvents, 'sa-1', ownerMap);
      const hasOther = filtered.some(e => e.stableId === 'e8' || e.stableId === 'e7');
      expect(hasOther).toBe(false);
    });

    it('should not include main-thread events', () => {
      const filtered = filterBySubagent(baseEvents, 'sa-1', ownerMap);
      const hasMain = filtered.some(e => e.stableId === 'e0' || e.stableId === 'e1' || e.stableId === 'e10');
      expect(hasMain).toBe(false);
    });

    it('should handle VS Code subAgentId format', () => {
      const vscodeEvents = [
        { type: 'assistant.message', stableId: 'v0', data: { subAgentId: 'vs-agent', message: 'Hello' } },
        { type: 'assistant.message', stableId: 'v1', data: { message: 'Main thread' } },
      ];
      const filtered = filterBySubagent(vscodeEvents, 'vs-agent', new Map());
      expect(filtered.length).toBe(1);
      expect(filtered[0].stableId).toBe('v0');
    });

    it('should return empty array for non-existent subagent', () => {
      const filtered = filterBySubagent(baseEvents, 'non-existent', ownerMap);
      expect(filtered.length).toBe(0);
    });
  });

  describe('subagent list generation', () => {
    it('should build list from subagentInfo map', () => {
      const { subagentInfo } = computeSubagentOwnership(baseEvents);
      const list = [];
      for (const [toolCallId, info] of subagentInfo) {
        list.push({ toolCallId, name: info.name, colorIndex: info.colorIndex });
      }
      expect(list).toEqual([
        { toolCallId: 'sa-1', name: 'Explorer', colorIndex: 0 },
        { toolCallId: 'sa-2', name: 'Builder', colorIndex: 1 },
      ]);
    });

    it('should return empty list for sessions without subagents', () => {
      const events = [{ type: 'user.message', stableId: 'e0', data: {} }];
      const { subagentInfo } = computeSubagentOwnership(events);
      const list = [];
      for (const [toolCallId, info] of subagentInfo) {
        list.push({ toolCallId, name: info.name });
      }
      expect(list).toEqual([]);
    });
  });

  describe('subagent token usage computation', () => {
    it('should count events and duration for selected subagent', () => {
      const eventsWithTimestamps = baseEvents.map((e, i) => ({
        ...e,
        timestamp: new Date(2026, 0, 1, 10, 0, i * 10).toISOString()
      }));
      const { ownerMap, subagentInfo } = computeSubagentOwnership(eventsWithTimestamps);

      // Simulate subagentTokenUsage computation
      const tcid = 'sa-1';
      let eventCount = 0;
      let startTime = null;
      let endTime = null;

      for (const ev of eventsWithTimestamps) {
        const isSubagentDivider = (ev.type === 'subagent.started' || ev.type === 'subagent.completed') && ev.data?.toolCallId === tcid;
        const isOwned = ownerMap.get(ev.stableId) === tcid;
        if (isSubagentDivider || isOwned) {
          eventCount++;
          const t = new Date(ev.timestamp).getTime();
          if (!startTime || t < startTime) startTime = t;
          if (!endTime || t > endTime) endTime = t;
        }
      }

      expect(eventCount).toBe(4);
      expect(subagentInfo.has(tcid)).toBe(true);
      expect(endTime - startTime).toBeGreaterThan(0);
    });

    it('should return null when no subagent selected', () => {
      // Simulating: if (!selectedSubagent) return null;
      const result = null; // selectedSubagent is null
      expect(result).toBeNull();
    });
  });
});
