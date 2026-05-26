import { computed } from 'vue';

export function useTurnAnalysis(sortedEvents, sessionEnd, normalizeMessage, events) {
  const turnAnalysis = computed(() => {
    try {
      const sorted = sortedEvents.value;
      const assistantMessages = sorted.filter(e => e.type === 'assistant.message');
      const allUserMessages = sorted.filter(e => e.type === 'user.message');

      return assistantMessages.map((msg, idx) => {
        const ts = msg.timestamp;
        if (!ts) return null;
        const startTime = new Date(ts).getTime();
        if (isNaN(startTime)) return null;

        const nextMsg = assistantMessages[idx + 1];
        const endTime = nextMsg
          ? new Date(nextMsg.timestamp).getTime()
          : sessionEnd.value || startTime;
        const duration = endTime - startTime;

        const msgIndex = sorted.indexOf(msg);
        const userMessage = sorted
          .slice(0, msgIndex)
          .reverse()
          .find(e => e.type === 'user.message');

        const userReqNumber = userMessage
          ? allUserMessages.indexOf(userMessage) + 1
          : 0;

        let displayText;
        const hasText = msg.data?.message && msg.data.message.trim() !== '';

        if (hasText) {
          displayText = normalizeMessage(msg.data.message);
        } else if (msg.data?.tools && msg.data.tools.length > 0) {
          const toolNames = msg.data.tools.map(t => t.name || 'unknown').join(', ');
          displayText = `Tool calls: ${toolNames}`;
        } else {
          displayText = '(empty assistant message)';
        }

        const toolCalls = msg.data?.tools?.length || 0;

        return {
          turnId: msg.id ?? `msg-${idx}`,
          userReqNumber,
          message: normalizeMessage(userMessage?.data?.message || userMessage?.data?.content || userMessage?.data?.transformedContent || ''),
          displayText,
          hasText,
          startTime: msg.timestamp,
          endTime: nextMsg?.timestamp || events.value[events.value.length - 1]?.timestamp,
          duration,
          toolCalls
        };
      }).filter(t => t !== null);
    } catch (err) {
      console.error('[turnAnalysis] Error:', err);
      return [];
    }
  });

  const maxTurnDuration = computed(() => {
    return Math.max(...turnAnalysis.value.map(t => t.duration || 0), 1);
  });

  const groupedTurns = computed(() => {
    const groups = new Map();
    for (const turn of turnAnalysis.value) {
      const reqNum = turn.userReqNumber || 0;
      if (!groups.has(reqNum)) {
        groups.set(reqNum, {
          userReqNumber: reqNum,
          message: turn.message,
          turns: []
        });
      }
      groups.get(reqNum).turns.push(turn);
    }
    return Array.from(groups.values()).sort((a, b) => a.userReqNumber - b.userReqNumber);
  });

  return { turnAnalysis, maxTurnDuration, groupedTurns };
}
