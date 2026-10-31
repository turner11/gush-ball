<script setup>
import { computed, ref } from 'vue'

import { useAuth } from '../composables/useAuth'
import { apiFetch } from '../lib/api'
import { sheetCopyUrl } from '../lib/games'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  teamId: { type: [Number, String], required: true },
  game: { type: Object, required: true },
})
const emit = defineEmits(['change']) // { has_stats, stats_url }: the parent applies it to its game

// Binding the model is optional: unbound, the input is local and starts from the game's saved sheet URL.
const url = defineModel('url', { type: String, default: (raw) => raw.game?.stats_url ?? '' })

const { user } = useAuth()
const templateCopyUrl = computed(() => sheetCopyUrl(user.value?.stats_template_url ?? ''))
const error = ref(null)
const statsMessage = ref(null)
const confirming = ref(null) // null | 'replace' | 'delete'
const loadButton = ref(null)
const CONFIRMS = {
  replace: { text: 'למשחק זה כבר יש נתונים. לטעון מחדש ולהחליף אותם?', button: 'החלפה', cls: 'btn-primary' },
  delete: { text: 'למחוק את כל נתוני הסטטיסטיקה של המשחק? הקישור לגיליון יישמר.', button: 'מחיקה', cls: 'btn-danger' },
}
const statsPath = () => `/teams/${props.teamId}/games/${props.game.id}/stats`

function requestLoadStats() {
  if (props.game.has_stats) {
    confirming.value = 'replace'
    return
  }
  loadStats()
}

function confirmStats() {
  const action = confirming.value
  cancelConfirm()
  if (action === 'delete') deleteStats()
  else loadStats()
}

function cancelConfirm() {
  confirming.value = null
  loadButton.value?.focus()
}

async function deleteStats() {
  error.value = statsMessage.value = null
  try {
    await apiFetch(statsPath(), { method: 'DELETE' })
    emit('change', { has_stats: false, stats_url: props.game.stats_url })
    statsMessage.value = 'הסטטיסטיקה נמחקה'
  } catch (e) {
    error.value = e.message
  }
}

// Saves just the sheet link (the parent calls this when ending the edit). False = rejected, error shown.
async function saveUrl() {
  error.value = statsMessage.value = null
  const link = url.value.trim()
  if (link === (props.game.stats_url ?? '')) return true
  try {
    const res = await apiFetch(`/teams/${props.teamId}/games/${props.game.id}`, { method: 'PATCH', body: { stats_url: link || null } })
    emit('change', { stats_url: res.stats_url })
    return true
  } catch (e) {
    error.value = e.message
    return false
  }
}
defineExpose({ saveUrl })

async function loadStats() {
  error.value = statsMessage.value = null
  try {
    const res = await apiFetch(statsPath(), { method: 'POST', body: { url: url.value || null } })
    emit('change', { has_stats: res.snapshots > 0, stats_url: res.stats_url })
    statsMessage.value = res.snapshots ? `נטענו ${res.snapshots} רשומות` : 'הקישור נשמר — הגיליון עדיין ריק. טענו שוב אחרי המשחק.'
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <div class="space-y-2">
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <label for="stats-url" class="field-label">קישור ללשונית הנתונים (כולל gid) או מזהה הגיליון — משותף ל"כל מי שיש לו קישור"</label>
    <input id="stats-url" v-model="url" type="text" inputmode="url" dir="ltr" autocomplete="off" spellcheck="false" class="field-input" />
    <div class="flex flex-wrap gap-x-4">
      <a v-if="game.stats_url" :href="game.stats_url" target="_blank" rel="noopener" class="section-link">פתיחת הגיליון<AppIcon name="external" /></a>
      <a v-if="templateCopyUrl" :href="templateCopyUrl" target="_blank" rel="noopener" class="section-link">גיליון חדש מתבנית<AppIcon name="external" /></a>
    </div>
    <p v-if="templateCopyUrl" class="text-sm text-muted">לפני המשחק: צרו גיליון מהתבנית, הדביקו את הקישור ולחצו על טעינת סטטיסטיקה. אחרי המשחק: טענו שוב.</p>
    <div class="flex flex-wrap gap-2">
      <button ref="loadButton" type="button" class="btn-secondary" @click="requestLoadStats">טעינת סטטיסטיקה</button>
      <button v-if="game.has_stats" type="button" class="btn-danger-ghost" @click="confirming = 'delete'">מחיקת סטטיסטיקה</button>
    </div>
    <div v-if="confirming" role="alert" class="space-y-2 rounded-xl border border-warn/60 p-3">
      <p class="text-sm">{{ CONFIRMS[confirming].text }}</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" :class="CONFIRMS[confirming].cls" @click="confirmStats">{{ CONFIRMS[confirming].button }}</button>
        <button type="button" class="btn-secondary" @click="cancelConfirm">ביטול</button>
      </div>
    </div>
    <p v-if="statsMessage" class="text-sm">{{ statsMessage }}</p>
  </div>
</template>
