<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const sessionId = ref('')

function viewSession() {
  const id = sessionId.value.trim()
  if (id) {
    router.push(`/session/${id}`)
  }
}
</script>

<template>
  <form @submit.prevent="viewSession">
    <div class="flex gap-2 rounded-xl border-2 border-[#30363d] bg-[#161b22] p-2 transition-colors focus-within:border-[#58a6ff]">
      <input
        v-model="sessionId"
        type="text"
        class="min-h-[44px] flex-1 border-none bg-transparent px-5 py-4 font-mono text-base text-[#c9d1d9] placeholder-[#6e7681] focus:outline-none"
        placeholder="Enter Session ID..."
        autofocus
        required
      >
      <button
        type="submit"
        class="min-h-[44px] cursor-pointer rounded-lg bg-[#238636] px-8 py-4 text-base font-semibold text-white transition-all hover:scale-[1.02] hover:bg-[#2ea043] active:scale-[0.98]"
      >
        View
      </button>
    </div>
  </form>
</template>
