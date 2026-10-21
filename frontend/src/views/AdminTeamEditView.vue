<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import ImageUpload from '../components/ImageUpload.vue'
import TeamAdminsSection from '../components/TeamAdminsSection.vue'
import TeamContentSection from '../components/TeamContentSection.vue'
import { clubAdmin, fullAdmin } from '../composables/useAuth'
import { teamSlug } from '../composables/useSelectedTeam'
import { useTeams } from '../composables/useTeams'
import { apiFetch } from '../lib/api'
import { BACKGROUND_PRESETS, backgroundSrc, isPresetBackground } from '../lib/backgrounds'

const route = useRoute()
const teamId = route.params.id

const { error, get, update } = useTeams()

// Each group is one fieldset; every field keeps its `team-${key}` input id.
const GROUPS = [
  {
    legend: 'פרטים',
    fields: [
      { key: 'name', label: 'שם', type: 'text', required: true },
      { key: 'name_en', label: 'שם (אנגלית)', type: 'text' },
      { key: 'club', label: 'מועדון', type: 'text' },
      { key: 'home_court_address', label: 'כתובת אולם הבית', type: 'text' },
    ],
  },
  { legend: 'מיתוג', fields: [{ key: 'logo_url', label: 'כתובת לוגו', type: 'url' }] },
  {
    legend: 'רשתות חברתיות',
    fields: [
      { key: 'facebook_url', label: 'פייסבוק', type: 'url', hint: 'הפוסטים מוצגים רק מדף פייסבוק ציבורי, ללא הגבלת גיל או מדינה.' },
      { key: 'instagram_url', label: 'אינסטגרם', type: 'url' },
      { key: 'youtube_url', label: 'יוטיוב', type: 'url' },
      { key: 'tiktok_url', label: 'טיקטוק', type: 'url' },
      { key: 'twitter_url', label: 'טוויטר (X)', type: 'url' },
      { key: 'wikipedia_url', label: 'ויקיפדיה', type: 'url' },
    ],
  },
  {
    legend: 'מקורות נתונים',
    fields: [
      { key: 'ibasketball_team_url', label: 'כתובת קבוצה ב-ibasketball', type: 'url' },
      { key: 'ibasketball_league_url', label: 'כתובת ליגה ב-ibasketball', type: 'url' },
    ],
  },
]

const team = ref(null)
const loading = ref(true)
const submitting = ref(false)
const saved = ref(false)
const allTeams = ref([])
const clubOptions = computed(() => [...new Set(allTeams.value.map((t) => t.club).filter(Boolean))].sort())
const previewFailed = ref(false)
const form = reactive({
  ...Object.fromEntries(GROUPS.flatMap((g) => g.fields).map((f) => [f.key, ''])),
  primary_color: '#000000',
  secondary_color: '#000000',
  background: 'hoop-1',
})

async function load() {
  team.value = (await get(teamId)) ?? null
  if (team.value) {
    for (const key of Object.keys(form)) {
      if (team.value[key] != null) form[key] = team.value[key]
    }
  }
  loading.value = false
}

async function onSubmit() {
  submitting.value = true
  saved.value = false
  try {
    const payload = {
      ...Object.fromEntries(Object.entries(form).filter(([, value]) => value !== '')),
      club: form.club || null, // null lets a full admin take a team out of its club
    }
    const updated = await update(teamId, payload)
    if (updated && !error.value) {
      team.value = updated
      saved.value = true
    }
  } finally {
    submitting.value = false
  }
}

watch(form, () => {
  saved.value = false
  previewFailed.value = false
})

// ponytail: club backgrounds derived from teams' current values; add Club.backgrounds if admins need a persistent library
const customBackgrounds = computed(() => {
  const used = allTeams.value.filter((t) => t.club && t.club === team.value?.club).map((t) => t.background)
  return [...new Set([...used, form.background])].filter((b) => b && !isPresetBackground(b))
})
const backgroundUrl = computed({
  get: () => (isPresetBackground(form.background) ? '' : form.background),
  set: (value) => (form.background = value || 'hoop-1'),
})

async function loadClubOptions() {
  try {
    allTeams.value = await apiFetch('/teams')
  } catch {
    // only a suggestion list
  }
}

onMounted(() => Promise.all([load(), loadClubOptions()]))

const contentSections = [
  {
    resource: 'links',
    heading: 'קישורים',
    fields: [
      { key: 'label', label: 'תווית', type: 'text', required: true },
      { key: 'label_en', label: 'תווית (אנגלית)', type: 'text' },
      { key: 'url', label: 'כתובת', type: 'url', required: true },
    ],
  },
  {
    resource: 'videos',
    heading: 'סרטונים',
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'title_en', label: 'כותרת (אנגלית)', type: 'text' },
      { key: 'url', label: 'כתובת', type: 'url', required: true },
      { key: 'player_ids', label: 'תיוג שחקנים', type: 'players' },
    ],
  },
  {
    resource: 'images',
    heading: 'תמונות',
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'title_en', label: 'כותרת (אנגלית)', type: 'text' },
      { key: 'url', label: 'כתובת', type: 'url', required: true, upload: true },
      { key: 'player_ids', label: 'תיוג שחקנים', type: 'players' },
    ],
  },
  {
    resource: 'posts',
    heading: 'פוסטים',
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'title_en', label: 'כותרת (אנגלית)', type: 'text' },
      { key: 'body', label: 'תוכן', type: 'textarea', required: true },
      { key: 'body_en', label: 'תוכן (אנגלית)', type: 'textarea' },
      { key: 'pinned', label: 'נעוץ', type: 'checkbox' },
    ],
  },
  {
    resource: 'plays',
    heading: 'פלייבוק',
    reorderable: true,
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'title_en', label: 'כותרת (אנגלית)', type: 'text' },
      { key: 'notes', label: 'הערות', type: 'textarea' },
      { key: 'file_url', label: 'קובץ: תמונה, GIF, MP4 או PDF', type: 'url', upload: true, accept: 'image/*,video/mp4,application/pdf' },
      { key: 'url', label: 'או קישור חיצוני (FastDraw, YouTube…)', type: 'url' },
    ],
  },
]
</script>

<template>
  <section class="space-y-8">
    <div class="page-header">
      <h1 class="page-title">עריכת קבוצה</h1>
      <div class="flex gap-2">
        <RouterLink to="/admin/teams" class="section-link">→ כל הקבוצות</RouterLink>
        <RouterLink v-if="team" :to="'/' + teamSlug(team)" class="section-link">צפייה באתר</RouterLink>
      </div>
    </div>

    <template v-if="team">
      <form class="space-y-4" @submit.prevent="onSubmit">
        <fieldset v-for="group in GROUPS" :key="group.legend" class="card space-y-3">
          <legend class="section-title">{{ group.legend }}</legend>
          <div v-if="group.legend === 'פרטים'">
            <span class="field-label">מזהה (slug)</span>
            <p class="mt-1 text-muted">{{ teamSlug(team) }}</p>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <template v-if="group.legend === 'מיתוג'">
              <div>
                <label for="team-primary-color" class="field-label">צבע ראשי</label>
                <div class="mt-1 flex items-center gap-2">
                  <input id="team-primary-color" v-model="form.primary_color" type="color" class="h-11 w-16 rounded" />
                  <span class="text-sm tabular-nums" dir="ltr">{{ form.primary_color }}</span>
                </div>
              </div>
              <div>
                <label for="team-secondary-color" class="field-label">צבע משני</label>
                <div class="mt-1 flex items-center gap-2">
                  <input id="team-secondary-color" v-model="form.secondary_color" type="color" class="h-11 w-16 rounded" />
                  <span class="text-sm tabular-nums" dir="ltr">{{ form.secondary_color }}</span>
                </div>
              </div>
              <div>
                <label for="team-background" class="field-label">רקע</label>
                <select id="team-background" v-model="form.background" class="field-input">
                  <option v-for="preset in BACKGROUND_PRESETS" :key="preset.value" :value="preset.value">{{ preset.label }}</option>
                  <option v-for="(url, i) in customBackgrounds" :key="url" :value="url">תמונה מותאמת {{ i + 1 }}</option>
                </select>
                <label for="team-background-url" class="field-label mt-3">או כתובת תמונה</label>
                <input id="team-background-url" v-model.lazy="backgroundUrl" type="url" dir="ltr" class="field-input" />
                <ImageUpload label="העלאת תמונת רקע" @uploaded="(url) => (form.background = url)" />
                <img
                  v-if="!previewFailed"
                  :src="backgroundSrc(form.background)"
                  alt="תצוגה מקדימה של הרקע"
                  class="mt-2 h-20 w-full rounded-xl border border-line object-cover object-[50%_65%]"
                  @error="previewFailed = true"
                />
                <p v-else class="error-text" role="alert">לא ניתן לטעון את התמונה</p>
              </div>
            </template>
            <div v-for="field in group.fields" :key="field.key">
              <label :for="`team-${field.key}`" class="field-label">{{ field.label }}</label>
              <input
                :id="`team-${field.key}`"
                v-model="form[field.key]"
                :type="field.type"
                :required="field.required"
                :list="field.key === 'club' ? 'club-options' : undefined"
                :disabled="field.key === 'club' && !fullAdmin"
                :aria-describedby="field.hint ? `team-${field.key}-hint` : field.key === 'club' && !fullAdmin ? 'club-hint' : undefined"
                class="field-input"
              />
              <p v-if="field.hint" :id="`team-${field.key}-hint`" class="mt-1 text-sm text-muted">{{ field.hint }}</p>
              <template v-if="field.key === 'club'">
                <datalist id="club-options"><option v-for="name in clubOptions" :key="name" :value="name" /></datalist>
                <p v-if="!fullAdmin" id="club-hint" class="mt-1 text-sm text-muted">רק מנהל ראשי יכול לשנות מועדון</p>
              </template>
              <div
                v-if="field.key === 'ibasketball_league_url' && team?.league_url_suggestion && form.ibasketball_league_url !== team.league_url_suggestion"
                id="league-suggestion"
                class="mt-2 flex flex-wrap items-center gap-2 text-sm"
              >
                <span class="text-muted">הליגה העדכנית שזוהתה:</span>
                <bdi dir="ltr" class="break-all">{{ team.league_url_suggestion }}</bdi>
                <button type="button" class="btn-secondary" @click="form.ibasketball_league_url = team.league_url_suggestion">
                  השתמש בכתובת
                </button>
              </div>
              <template v-if="field.key === 'logo_url'">
                <ImageUpload label="העלאת לוגו" @uploaded="(url) => (form.logo_url = url)" />
                <img v-if="form.logo_url" :src="form.logo_url" alt="" class="mt-2 size-16 object-contain" />
              </template>
            </div>
          </div>
        </fieldset>

        <p v-if="error" class="error-text" role="alert">{{ error }}</p>

        <div class="sticky-actions flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="submit" :disabled="submitting" class="btn-primary w-full sm:w-auto">
            שמירה
          </button>
          <span class="text-sm text-muted" aria-live="polite">{{ saved ? 'נשמר' : '' }}</span>
        </div>
      </form>

      <h2 class="page-title">תוכן הקבוצה</h2>
      <!-- grid-cols-1 = minmax(0,1fr): an implicit track grows to fit a long truncated item and overflows the page -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TeamContentSection
          v-for="section in contentSections"
          :key="section.resource"
          :team-id="teamId"
          :resource="section.resource"
          :heading="section.heading"
          :fields="section.fields"
          :reorderable="section.reorderable"
        />
      </div>
      <TeamAdminsSection v-if="fullAdmin || clubAdmin(team.club)" :team-id="teamId" :club="team.club" />
    </template>
    <div v-else-if="loading" class="space-y-3" aria-busy="true">
      <div class="skeleton h-32" />
      <div class="skeleton h-32" />
    </div>
    <p v-else class="error-text" role="alert">{{ error || 'הקבוצה לא נמצאה' }}</p>
  </section>
</template>
