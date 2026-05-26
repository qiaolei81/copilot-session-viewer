/**
 * Subagent analysis composable — ownership tracking, filtering, and display helpers.
 */
import { ref, computed } from 'vue';

const SUBAGENT_COLORS = [
  '#58a6ff', '#f0883e', '#a371f7', '#3fb950',
  '#f778ba', '#79c0ff', '#d29922', '#56d4dd'
];

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

  for (const ev of events) {
    if (ev.type !== 'tool.execution_start') continue;
    const tcid = ev.data?.toolCallId;
    if (!tcid || !subagentInfo.has(tcid)) continue;
    const info = subagentInfo.get(tcid);
    let args = ev.data?.arguments;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch (_e) { continue; }
    }
    if (!args || typeof args !== 'object') continue;
    if (args.description) info.meta.taskDescription = args.description;
    if (args.name) info.meta.taskName = args.name;
    if (args.agent_type) info.meta.agentType = args.agent_type;
    if (args.mode) info.meta.taskMode = args.mode;
    if (args.description && info.name === (info.meta.agentDisplayName || info.meta.agentName)) {
      info.name = args.description;
    }
  }

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
      ownerMap.set(ev.stableId, sid);
    }
  }

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

  const idMap = new Map();
  for (const ev of events) {
    if (ev.id) idMap.set(ev.id, ev);
  }

  for (const ev of events) {
    if (ev.type === 'assistant.message') {
      const ptcid = ev.data?.parentToolCallId;
      if (ptcid && subagentInfo.has(ptcid)) {
        ownerMap.set(ev.stableId, ptcid);
      }
    }
  }

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

  for (const ev of events) {
    if (ev.type !== 'tool.invocation') continue;
    const ptcid = ev.data?.parentToolCallId;
    if (ptcid && subagentInfo.has(ptcid)) {
      ownerMap.set(ev.stableId, ptcid);
    }
  }

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

export function useSubagentAnalysis(flatEvents) {
  const selectedSubagent = ref(null);
  const subagentDropdownOpen = ref(false);
  const subagentSearchQuery = ref('');
  const subagentSearchRef = ref(null);

  const subagentOwnership = computed(() => computeSubagentOwnership(flatEvents.value));

  const subagentList = computed(() => {
    const { subagentInfo } = subagentOwnership.value;
    if (subagentInfo.size === 0) return [];
    const list = [];
    for (const [toolCallId, info] of subagentInfo) {
      list.push({ toolCallId, name: info.name, colorIndex: info.colorIndex, meta: info.meta || {} });
    }
    return list;
  });

  const filteredSubagentList = computed(() => {
    const q = subagentSearchQuery.value.toLowerCase().trim();
    if (!q) return subagentList.value;
    return subagentList.value.filter(sa => {
      const m = sa.meta || {};
      const searchable = [sa.name, m.taskName, m.taskDescription, m.agentName, m.agentType, m.agentDescription, m.model].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(q);
    });
  });

  const subagentTokenUsage = computed(() => {
    if (!selectedSubagent.value) return null;
    const { ownerMap, subagentInfo } = subagentOwnership.value;
    const tcid = selectedSubagent.value;
    if (!subagentInfo.has(tcid)) return null;
    let eventCount = 0, startTime = null, endTime = null;
    for (const ev of flatEvents.value) {
      const isSubagentDivider = (ev.type === 'subagent.started' || ev.type === 'subagent.completed' || ev.type === 'subagent.failed') && ev.data?.toolCallId === tcid;
      const isOwned = ownerMap.get(ev.stableId) === tcid;
      const isSubagentMeta = ev._subagent?.id === tcid;
      const isVsCode = ev.data?.subAgentId === tcid;
      if (isSubagentDivider || isOwned || isSubagentMeta || isVsCode) {
        eventCount++;
        if (ev.timestamp !== null && ev.timestamp !== undefined) {
          const t = new Date(ev.timestamp).getTime();
          if (startTime === null || t < startTime) startTime = t;
          if (endTime === null || t > endTime) endTime = t;
        }
      }
    }
    const durationMs = startTime === null || endTime === null ? 0 : endTime - startTime;
    return { eventCount, durationMs };
  });

  const hashCode = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return hash;
  };

  const getSubagentInfo = (event) => {
    const { ownerMap, subagentInfo } = subagentOwnership.value;
    if (event.type === 'subagent.started' || event.type === 'subagent.completed' || event.type === 'subagent.failed') {
      const tcid = event.data?.toolCallId;
      if (tcid && subagentInfo.has(tcid)) {
        const info = subagentInfo.get(tcid);
        return { name: info.name, toolCallId: tcid, colorIndex: info.colorIndex };
      }
      return null;
    }
    if (event._subagent) {
      const subagentId = event._subagent.id;
      if (subagentInfo.has(subagentId)) {
        const info = subagentInfo.get(subagentId);
        return { name: info.name, toolCallId: subagentId, colorIndex: info.colorIndex };
      }
      return { name: event._subagent.name, toolCallId: subagentId, colorIndex: Math.abs(hashCode(subagentId)) };
    }
    if (event.data?.subAgentId) {
      const sid = event.data.subAgentId;
      const info = subagentInfo.get(sid);
      if (info) return { name: info.name, toolCallId: sid, colorIndex: info.colorIndex };
    }
    const tcid = ownerMap.get(event.stableId);
    if (!tcid) return null;
    const info = subagentInfo.get(tcid);
    if (!info) return null;
    return { name: info.name, toolCallId: tcid, colorIndex: info.colorIndex };
  };

  const getSubagentColor = (event) => {
    const info = getSubagentInfo(event);
    if (!info) return null;
    return SUBAGENT_COLORS[info.colorIndex % SUBAGENT_COLORS.length];
  };

  const selectSubagent = (toolCallId) => {
    selectedSubagent.value = toolCallId;
    subagentDropdownOpen.value = false;
    subagentSearchQuery.value = '';
  };

  const closeSubagentDropdown = () => { subagentDropdownOpen.value = false; };

  return {
    SUBAGENT_COLORS,
    selectedSubagent,
    subagentDropdownOpen,
    subagentSearchQuery,
    subagentSearchRef,
    subagentOwnership,
    subagentList,
    filteredSubagentList,
    subagentTokenUsage,
    getSubagentInfo,
    getSubagentColor,
    selectSubagent,
    closeSubagentDropdown,
    filterBySubagent,
    hashCode
  };
}
