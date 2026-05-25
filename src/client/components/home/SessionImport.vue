<script setup>
import { ref } from 'vue'

const fileInput = ref(null)
const status = ref({ type: '', message: '' })
const importing = ref(false)

function triggerFileInput() {
  fileInput.value?.click()
}

async function handleFileChange(e) {
  const file = e.target.files[0]
  if (!file) return

  if (!file.name.endsWith('.zip')) {
    status.value = { type: 'error', message: '❌ Please select a .zip file' }
    return
  }

  importing.value = true
  status.value = { type: 'loading', message: 'Uploading and extracting session...' }

  try {
    const formData = new FormData()
    formData.append('zipFile', file)

    const response = await fetch('/session/import', {
      method: 'POST',
      body: formData,
    })
    const result = await response.json()

    if (response.ok) {
      status.value = { type: 'success', message: `✅ Session ${result.sessionId} imported successfully!` }
      setTimeout(() => window.location.reload(), 1500)
    } else {
      status.value = { type: 'error', message: `❌ Import failed: ${result.error}` }
      importing.value = false
    }
  } catch (err) {
    status.value = { type: 'error', message: `❌ Import failed: ${err.message}` }
    importing.value = false
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>

<template>
  <div>
    <input
      ref="fileInput"
      type="file"
      accept=".zip"
      class="hidden"
      @change="handleFileChange"
    >
    <a
      class="cursor-pointer text-sm text-[#58a6ff] transition-colors hover:text-[#79c0ff] hover:underline"
      :class="{ 'pointer-events-none opacity-50': importing }"
      @click.prevent="triggerFileInput"
    >
      {{ importing ? 'Importing...' : 'Import session from zip' }}
    </a>
    <span class="ml-1.5 text-[11px] text-[#6e7681]">Supports: GitHub Copilot, Claude, Pi-Mono</span>

    <div
      v-if="status.message"
      class="mt-3 rounded-md px-3 py-2.5 text-[13px]"
      :class="{
        'border border-[#238636] bg-[rgba(35,134,54,0.15)] text-[#3fb950]': status.type === 'success',
        'border border-[#f85149] bg-[rgba(248,81,73,0.15)] text-[#ff7b72]': status.type === 'error',
        'border border-[#58a6ff] bg-[rgba(88,166,255,0.15)] text-[#58a6ff]': status.type === 'loading',
      }"
    >
      {{ status.message }}
    </div>
  </div>
</template>
