<script setup>
import { ref } from 'vue'
import AppHeader from '../components/common/AppHeader.vue'
import SessionSearchBar from '../components/home/SessionSearchBar.vue'
import SourceFilterPills from '../components/home/SourceFilterPills.vue'
import SessionImport from '../components/home/SessionImport.vue'
import SessionList from '../components/home/SessionList.vue'
import SummaryPreview from '../components/home/SummaryPreview.vue'

const activeSource = ref('copilot')

function onFilterChange(source) {
  activeSource.value = source
}
</script>

<template>
  <div class="min-h-screen bg-[#0d1117] text-[#c9d1d9]">
    <AppHeader title="Session Viewer" />

    <main class="px-4 py-6 sm:px-6 lg:px-8">
      <SessionSearchBar class="mb-6 max-w-xl mx-auto" />

      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <SourceFilterPills @filter-change="onFilterChange" />
        <SessionImport />
      </div>

      <SessionList :source="activeSource" />
    </main>

    <SummaryPreview />
  </div>
</template>
