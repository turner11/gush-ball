<script setup>
import { onMounted, ref } from 'vue'

import { apiFetch } from '../lib/api'

const clubs = ref(null) // null while loading
const loadFailed = ref(false)

async function load() {
  loadFailed.value = false
  clubs.value = null
  try {
    const list = await apiFetch('/clubs')
    // `saved` holds the last stored values, so a row knows when it has unsaved changes.
    clubs.value = list.map((c) => ({ ...c, name_en: c.name_en ?? '', ibasketball_url: c.ibasketball_url ?? '', saved: { ...c }, busy: false, status: '' }))
  } catch {
    loadFailed.value = true
  }
}

const isDirty = (c) => c.name !== c.saved.name || c.name_en !== (c.saved.name_en ?? '') || c.ibasketball_url !== (c.saved.ibasketball_url ?? '')

async function save(c) {
  c.busy = true
  c.status = ''
  try {
    const body = { name: c.name, name_en: c.name_en.trim() || null }
    if (c.ibasketball_url) body.ibasketball_url = c.ibasketball_url
    const updated = await apiFetch(`/clubs/${c.id}`, { method: 'PATCH', body })
    c.saved = { ...updated }
    c.name_en = updated.name_en ?? ''
    c.ibasketball_url = updated.ibasketball_url ?? ''
    c.status = 'saved'
  } catch (e) {
    c.status = e.status === 409 ? 'conflict' : e.status === 422 ? 'invalid' : 'error'
  } finally {
    c.busy = false
  }
}

onMounted(load)
</script>

<template>
  <section class="card space-y-3">
    <h2 class="section-title">מועדונים</h2>

    <div v-if="loadFailed" class="space-y-2">
      <p class="error-text" role="alert">שגיאה בטעינת המועדונים</p>
      <button type="button" class="btn-secondary" @click="load">נסו שוב</button>
    </div>
    <div v-else-if="clubs === null" class="space-y-2" aria-hidden="true">
      <div class="skeleton h-11"></div>
      <div class="skeleton h-11"></div>
    </div>
    <p v-else-if="!clubs.length" class="empty-state">
      אין מועדונים עדיין. מועדון נוצר כששומרים קבוצה עם שם מועדון, או בסנכרון.
    </p>
    <ul v-else class="divide-y divide-line">
      <li v-for="c in clubs" :key="c.id" class="py-3">
        <form class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-center" @submit.prevent="save(c)">
          <div class="min-w-0">
            <label :for="`club-name-${c.id}`" class="sr-only">שם המועדון</label>
            <input :id="`club-name-${c.id}`" v-model="c.name" type="text" required maxlength="120" class="field-input min-w-0 font-semibold" />
          </div>
          <div class="min-w-0">
            <label :for="`club-name-en-${c.id}`" class="sr-only">שם המועדון באנגלית</label>
            <input :id="`club-name-en-${c.id}`" v-model="c.name_en" type="text" maxlength="120" dir="ltr" lang="en" placeholder="English name" class="field-input min-w-0" />
          </div>
          <div class="min-w-0">
            <label :for="`club-url-${c.id}`" class="sr-only">קישור ל-ibasketball</label>
            <input
              :id="`club-url-${c.id}`"
              v-model="c.ibasketball_url"
              type="url"
              :required="!!c.saved.ibasketball_url"
              dir="ltr"
              placeholder="https://ibasketball.co.il/club/…"
              class="field-input min-w-0 text-sm"
            />
          </div>
          <button type="submit" class="btn-secondary w-full sm:w-auto" :disabled="c.busy || !isDirty(c)">שמירה</button>
          <p v-if="c.status === 'conflict'" class="error-text sm:col-span-4" role="alert">שם או קישור כבר בשימוש</p>
          <p v-else-if="c.status === 'invalid'" class="error-text sm:col-span-4" role="alert">קישור חייב להיות דף אגודה ב-ibasketball</p>
          <p v-else-if="c.status === 'error'" class="error-text sm:col-span-4" role="alert">השמירה נכשלה, נסו שוב</p>
          <span class="text-sm text-muted sm:col-span-4" aria-live="polite">{{ c.status === 'saved' ? 'נשמר' : '' }}</span>
        </form>
      </li>
    </ul>
  </section>
</template>
