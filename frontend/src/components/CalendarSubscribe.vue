<script setup>
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed, ref, useId } from 'vue'

import { apiUrl } from '../lib/api'
import AppIcon from './AppIcon.vue'

const props = defineProps({ teamId: { type: Number, required: true }, practices: Boolean })

const feedUrl = computed(() => apiUrl(`/teams/${props.teamId}/calendar.ics${props.practices ? '?practices=1' : ''}`))
const webcalUrl = computed(() => feedUrl.value.replace(/^https?:/, 'webcal:'))

const noteId = useId()
const copied = ref(false)
const copyFailed = ref(false)

async function copy() {
  copied.value = false
  copyFailed.value = false
  try {
    await navigator.clipboard.writeText(feedUrl.value)
    copied.value = true
  } catch {
    copyFailed.value = true
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <DropdownMenuRoot>
      <DropdownMenuTrigger as-child>
        <button type="button" class="btn-secondary"><AppIcon name="calendar" />הוספה ליומן<AppIcon name="chevron" class="size-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent align="start" :side-offset="4" class="menu-content max-w-xs">
          <DropdownMenuItem as-child>
            <a :href="webcalUrl" class="menu-item">הוספה ליומן במכשיר</a>
          </DropdownMenuItem>
          <DropdownMenuItem class="menu-item" :aria-describedby="practices ? noteId : undefined" @select="copy">העתקת קישור ל-Google</DropdownMenuItem>
          <p v-if="practices" :id="noteId" class="px-3 py-1.5 text-xs text-muted">יומן Google מרענן מינויים רק כל כמה שעות, כך ששינוי של הרגע האחרון עשוי להופיע באיחור</p>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
    <p v-if="copied" role="status" aria-live="polite" class="basis-full text-sm text-muted">הקישור הועתק</p>
    <p v-else-if="copyFailed" role="status" aria-live="polite" class="basis-full text-sm text-muted">
      לא ניתן להעתיק, העתיקו ידנית:
      <code dir="ltr" class="select-all break-all">{{ feedUrl }}</code>
    </p>
  </div>
</template>
