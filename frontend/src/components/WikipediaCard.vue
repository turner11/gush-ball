<script setup>
import { computed, onMounted, ref } from 'vue'

import AppIcon from './AppIcon.vue'

const props = defineProps({ url: { type: String, required: true } })

// ponytail: only /wiki/<title> links get a card; ?curid= and /w/index.php links keep just the button.
function summaryUrl(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.match(/^([a-z-]+)\.(?:m\.)?wikipedia\.org$/)
    const title = u.pathname.match(/^\/wiki\/(.+)$/)
    if (!host || !title) return null
    return `https://${host[1]}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(decodeURIComponent(title[1]))}`
  } catch {
    return null
  }
}

const endpoint = computed(() => summaryUrl(props.url))
const status = ref(endpoint.value ? 'loading' : 'failed')
const data = ref(null)

onMounted(async () => {
  if (!endpoint.value) return
  try {
    const res = await fetch(endpoint.value)
    const body = res.ok ? await res.json() : null
    // disambiguation / no-extract pages have no useful preview
    if (body?.type !== 'standard') throw new Error(`no preview for ${endpoint.value}`)
    data.value = body
    status.value = 'ready'
  } catch {
    status.value = 'failed'
  }
})
</script>

<template>
  <section v-if="status !== 'failed'" class="space-y-2">
    <h2 class="section-title">בוויקיפדיה</h2>
    <div v-if="status === 'loading'" class="skeleton h-28" aria-busy="true"></div>
    <a
      v-else
      :href="url"
      target="_blank"
      rel="noopener"
      class="card flex gap-3 transition hover:border-team"
    >
      <img v-if="data.thumbnail?.source" :src="data.thumbnail.source" alt="" loading="lazy" class="h-20 w-20 shrink-0 rounded-xl object-cover" />
      <div class="min-w-0 space-y-1" :lang="data.lang" :dir="data.dir">
        <p class="font-bold text-ink">{{ data.title }}</p>
        <p class="line-clamp-4 text-sm text-muted">{{ data.extract }}</p>
        <p class="flex items-center gap-1 text-xs text-muted">ויקיפדיה<AppIcon name="external" /></p>
      </div>
    </a>
  </section>
</template>
