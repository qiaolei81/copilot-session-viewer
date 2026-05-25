import { computed } from 'vue';

function normalizeMessage(msg) {
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  if (Array.isArray(msg)) return msg.map(c => c.text || c.content || '').join(' ');
  if (typeof msg === 'object' && msg.text) return msg.text;
  return String(msg);
}

export function useTurnAnalysis(sortedEvents, sessionEnd) {
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
        const endTime = nextMsg ? new Date(nextMsg.timestamp).getTime() : sessionEnd.value || startTime;
        const duration = endTime - startTime;

        const msgIndex = sorted.indexOf(msg);
        const userMessage = sorted.slice(0, msgIndex).reverse().find(e => e.type === 'user.message');
        const userReqNumber = userMessage ? allUserMessages.indexOf(userMessage) + 1 : 0;

        let displayText;
        const hasText = msg.data?.message && msg.data.message.trim() !== '';
        if (hasText) {
          displayText = normalizeMessage(msg.data.message);
        } else if (msg.data?.tools?.length) {
          displayText = `Tool calls: ${msg.data.tools.map(t => t.name || 'unknown').join(', ')}`;
        } else {
          displayText = '(empty assistant message)';
        }

        return {
          turnId: msg.id ?? `msg-${idx}`,
          userReqNumber,
          message: normalizeMessage(userMessage?.data?.message || userMessage?.data?.content || userMessage?.data?.transformedContent || ''),
          displayText, hasText,
          startTime: msg.timestamp,
          endTime: nextMsg?.timestamp || sorted[sorted.length - 1]?.timestamp,
          duration,
          toolCalls: msg.data?.tools?.length || 0,
        };
      }).filter(t => t !== null);
    } catch (err) {
      console.error('[turnAnalysis] Error:', err);
      return [];
    }
  });

  const groupedTurns = computed(() => {
    const groups = new Map();
    for (const turn of turnAnalysis.value) {
      const reqNum = turn.userReqNumber || 0;
      if (!groups.has(reqNum)) {
        groups.set(reqNum, { userReqNumber: reqNum, message: turn.message, turns: [] });
      }
      groups.get(reqNum).turns.push(turn);
    }
    return Array.from(groups.values()).sort((a, b) => a.userReqNumber - b.userReqNumber);
  });

  return { turnAnalysis, groupedTurns };
}
