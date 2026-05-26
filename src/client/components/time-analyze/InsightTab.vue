<template>
  <div class="section my-6">
    <!-- Error State -->
    <div v-if="insightError" class="empty-state" style="padding: 60px; color: #f85149;">
      ❌ {{ insightError }}
    </div>

    <!-- Generating State -->
    <div v-else-if="insightStatus === 'generating'" style="padding: 20px;">
      <div
:style="{
        background: '#0d1117',
        border: '1px solid ' + (insightAgeMs > 300000 ? '#d29922' : '#30363d'),
        borderRadius: '6px',
        padding: '20px',
        marginBottom: '20px',
      }"
>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <div style="display: flex; align-items: center;">
            <span style="font-size: 24px; margin-right: 10px;">⏳</span>
            <div>
              <div style="font-weight: 600; color: #58a6ff; margin-bottom: 5px;">
                Generating Agent Review...
              </div>
              <div style="font-size: 13px; color: #7d8590;">
                Started: {{ formatDateTime(insightStartedAt) }} •
                Age: {{ Math.floor(insightAgeMs / 1000) }}s
              </div>
            </div>
          </div>
          <button
            v-if="insightAgeMs > 300000"
            style="
              background: #d29922;
              color: #fff;
              border: none;
              padding: 8px 16px;
              border-radius: 6px;
              font-size: 13px;
              cursor: pointer;
              font-weight: 500;
              white-space: nowrap;
            "
            @click="$emit('regenerate')"
            @mouseover="$event.target.style.background='#e3b341'"
            @mouseleave="$event.target.style.background='#d29922'"
          >
            🔄 Stop &amp; Retry
          </button>
        </div>
        <!-- Slow generation warning -->
        <div
v-if="insightAgeMs > 300000" style="
          background: rgba(210, 153, 34, 0.1);
          border: 1px solid rgba(210, 153, 34, 0.3);
          border-radius: 6px;
          padding: 10px 14px;
          margin-bottom: 12px;
          font-size: 13px;
          color: #d29922;
        "
>
          ⚠️ Generation is taking longer than 5 minutes. For large sessions this is normal — the agent needs to read and analyze all events. If it appears stuck, you can click <strong>Stop &amp; Retry</strong> to cancel and start fresh.
        </div>
        <div
v-if="insightLog" id="insight-log" style="
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
        "
>
{{ insightLog }}
</div>
      </div>
    </div>

    <!-- Timeout State -->
    <div v-else-if="insightStatus === 'timeout'" style="padding: 20px;">
      <div
style="
        background: #0d1117;
        border: 1px solid #d29922;
        border-radius: 6px;
        padding: 20px;
        margin-bottom: 20px;
      "
>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <div style="display: flex; align-items: center;">
            <span style="font-size: 24px; margin-right: 10px;">⏳</span>
            <div>
              <div style="font-weight: 600; color: #d29922; margin-bottom: 5px;">
                Still generating... ({{ Math.floor(insightAgeMs / 1000 / 60) }}m elapsed)
              </div>
              <div style="font-size: 13px; color: #7d8590;">
                Large sessions with sub-agents may take 10–15 minutes. Still polling for completion.
              </div>
            </div>
          </div>
          <button
            style="
              background: #d29922;
              color: #fff;
              border: none;
              padding: 8px 16px;
              border-radius: 6px;
              font-size: 13px;
              cursor: pointer;
              font-weight: 500;
              white-space: nowrap;
            "
            @click="$emit('regenerate')"
            @mouseover="$event.target.style.background='#e3b341'"
            @mouseleave="$event.target.style.background='#d29922'"
          >
            🔄 Stop &amp; Retry
          </button>
        </div>
        <div
v-if="insightLog" style="
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
        "
>
{{ insightLog }}
</div>
      </div>
    </div>

    <!-- Not Started State -->
    <div v-else-if="insightStatus === 'not_started'" style="padding: 40px; text-align: center;">
      <p style="margin-bottom: 20px; color: #7d8590;">
        Generate an AI-powered quality &amp; performance review of how the agent used its tools, prompts, and workflow in this session
      </p>
      <button
        :disabled="insightLoading"
        style="
          background: #238636;
          color: #fff;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          font-weight: 500;
        "
        @click="$emit('generate')"
        @mouseover="$event.target.style.background='#2ea043'"
        @mouseleave="$event.target.style.background='#238636'"
      >
        💡 Generate Agent Review
      </button>
      <p style="margin-top: 12px; font-size: 12px; color: #6e7681;">
        For large sessions this may take several minutes — you'll see a live progress log while the review is being generated.
      </p>
    </div>

    <!-- Completed State -->
    <div v-else-if="insightStatus === 'completed'" style="padding: 20px;">
      <div
style="
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 6px;
        padding: 20px;
        margin-bottom: 20px;
      "
>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <span style="color: #7d8590; font-size: 13px;">
            Generated: {{ formatDateTime(insightGeneratedAt) }}
          </span>
          <button
            style="
              background: transparent;
              color: #58a6ff;
              border: 1px solid #58a6ff;
              padding: 5px 12px;
              border-radius: 6px;
              font-size: 12px;
              cursor: pointer;
            "
            @click="$emit('regenerate')"
            @mouseover="$event.target.style.background='rgba(88, 166, 255, 0.1)'"
            @mouseleave="$event.target.style.background='transparent'"
          >
            🔄 Regenerate
          </button>
        </div>
        <div
style="
          color: #c9d1d9;
          line-height: 1.6;
        " v-html="renderedInsight"
/>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  insightStatus: { type: String, required: true },
  insightError: {},
  insightLog: {},
  insightLoading: { type: Boolean },
  insightAgeMs: { type: Number },
  insightStartedAt: {},
  insightGeneratedAt: {},
  renderedInsight: { type: String },
  formatDateTime: { type: Function, required: true },
});

defineEmits(['generate', 'regenerate']);
</script>
