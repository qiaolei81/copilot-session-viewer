<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useFormatters } from '../../composables/useFormatters.js'

const { formatDateTime } = useFormatters()

const props = defineProps({
  insightStatus: { type: String, default: 'not_started' },
  insightReport: { type: String, default: null },
  insightLog: { type: String, default: null },
  insightLoading: { type: Boolean, default: false },
  insightError: { type: String, default: null },
  insightGeneratedAt: { type: [String, Number], default: null },
  insightStartedAt: { type: [String, Number], default: null },
  insightAgeMs: { type: Number, default: 0 },
})

const emit = defineEmits(['generate', 'regenerate'])

marked.setOptions({ breaks: true, gfm: true })

const renderedInsight = computed(() => {
  if (!props.insightReport) return ''
  const html = marked.parse(props.insightReport)
  return DOMPurify.sanitize(html)
})
</script>

<template>
  <div class="section">
    <!-- Error State -->
    <div v-if="insightError" class="empty-state error-state">
      &#10060; {{ insightError }}
    </div>

    <!-- Generating State -->
    <div v-else-if="insightStatus === 'generating'" class="insight-generating">
      <div :class="['gen-box', { 'gen-box--slow': insightAgeMs > 300000 }]">
        <div class="gen-header">
          <div class="gen-header-left">
            <span class="gen-icon">&#9203;</span>
            <div>
              <div class="gen-title">Generating Agent Review...</div>
              <div class="gen-meta">
                Started: {{ formatDateTime(insightStartedAt) }} &bull;
                Age: {{ Math.floor(insightAgeMs / 1000) }}s
              </div>
            </div>
          </div>
          <button v-if="insightAgeMs > 300000" class="retry-btn retry-btn--warn" @click="emit('regenerate')">
            &#128260; Stop &amp; Retry
          </button>
        </div>
        <!-- Slow warning -->
        <div v-if="insightAgeMs > 300000" class="slow-warning">
          &#9888;&#65039; Generation is taking longer than 5 minutes. For large sessions this is normal. If stuck, click <strong>Stop &amp; Retry</strong>.
        </div>
        <pre v-if="insightLog" id="insight-log" class="insight-log">{{ insightLog }}</pre>
      </div>
    </div>

    <!-- Timeout State -->
    <div v-else-if="insightStatus === 'timeout'" class="insight-generating">
      <div class="gen-box gen-box--slow">
        <div class="gen-header">
          <div class="gen-header-left">
            <span class="gen-icon">&#9203;</span>
            <div>
              <div class="gen-title" style="color: #d29922;">
                Still generating... ({{ Math.floor(insightAgeMs / 1000 / 60) }}m elapsed)
              </div>
              <div class="gen-meta">
                Large sessions may take 10-15 minutes. Still polling.
              </div>
            </div>
          </div>
          <button class="retry-btn retry-btn--warn" @click="emit('regenerate')">
            &#128260; Stop &amp; Retry
          </button>
        </div>
        <pre v-if="insightLog" class="insight-log">{{ insightLog }}</pre>
      </div>
    </div>

    <!-- Not Started State -->
    <div v-else-if="insightStatus === 'not_started'" class="not-started">
      <p class="not-started-desc">
        Generate an AI-powered quality &amp; performance review of how the agent used its tools, prompts, and workflow in this session
      </p>
      <button class="generate-btn" :disabled="insightLoading" @click="emit('generate')">
        &#128161; Generate Agent Review
      </button>
      <p class="not-started-note">
        For large sessions this may take several minutes.
      </p>
    </div>

    <!-- Completed State -->
    <div v-else-if="insightStatus === 'completed'" class="insight-completed">
      <div class="completed-box">
        <div class="completed-header">
          <span class="completed-meta">Generated: {{ formatDateTime(insightGeneratedAt) }}</span>
          <button class="regen-btn" @click="emit('regenerate')">
            &#128260; Regenerate
          </button>
        </div>
        <div class="insight-content" v-html="renderedInsight"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section { margin: 24px 0; }
.empty-state { text-align: center; padding: 40px; color: #7d8590; font-size: 14px; }
.error-state { color: #f85149; padding: 60px; }

/* Generating */
.insight-generating { padding: 20px; }
.gen-box {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 20px;
  margin-bottom: 20px;
}
.gen-box--slow { border-color: #d29922; }
.gen-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.gen-header-left { display: flex; align-items: center; }
.gen-icon { font-size: 24px; margin-right: 10px; }
.gen-title { font-weight: 600; color: #58a6ff; margin-bottom: 5px; }
.gen-meta { font-size: 13px; color: #7d8590; }
.retry-btn {
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
  white-space: nowrap;
}
.retry-btn--warn { background: #d29922; color: #fff; }
.retry-btn--warn:hover { background: #e3b341; }
.slow-warning {
  background: rgba(210, 153, 34, 0.1);
  border: 1px solid rgba(210, 153, 34, 0.3);
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #d29922;
}
.insight-log {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 14px 16px;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #8b949e;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
}

/* Not Started */
.not-started { padding: 40px; text-align: center; }
.not-started-desc { margin-bottom: 20px; color: #7d8590; }
.generate-btn {
  background: #238636;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
}
.generate-btn:hover { background: #2ea043; }
.generate-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.not-started-note { margin-top: 12px; font-size: 12px; color: #6e7681; }

/* Completed */
.insight-completed { padding: 20px; }
.completed-box {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 20px;
}
.completed-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.completed-meta { color: #7d8590; font-size: 13px; }
.regen-btn {
  background: transparent;
  color: #58a6ff;
  border: 1px solid #58a6ff;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.regen-btn:hover { background: rgba(88, 166, 255, 0.1); }
.insight-content { color: #c9d1d9; line-height: 1.6; }
.insight-content :deep(h1),
.insight-content :deep(h2),
.insight-content :deep(h3) { color: #c9d1d9; margin-top: 24px; margin-bottom: 16px; font-weight: 600; }
.insight-content :deep(h1) { font-size: 2em; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
.insight-content :deep(h2) { font-size: 1.5em; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
.insight-content :deep(h3) { font-size: 1.25em; }
.insight-content :deep(p) { margin-bottom: 16px; }
.insight-content :deep(ul), .insight-content :deep(ol) { margin-bottom: 16px; padding-left: 2em; }
.insight-content :deep(li) { margin-bottom: 8px; }
.insight-content :deep(code) { background: #161b22; padding: 2px 6px; border-radius: 3px; font-family: ui-monospace, monospace; font-size: 85%; }
.insight-content :deep(pre) { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; overflow-x: auto; margin-bottom: 16px; }
.insight-content :deep(pre code) { background: transparent; padding: 0; }
.insight-content :deep(blockquote) { border-left: 4px solid #30363d; padding-left: 16px; color: #7d8590; margin-bottom: 16px; }
.insight-content :deep(table) { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
.insight-content :deep(th), .insight-content :deep(td) { border: 1px solid #30363d; padding: 8px 13px; text-align: left; }
.insight-content :deep(th) { background: #161b22; font-weight: 600; }
</style>
