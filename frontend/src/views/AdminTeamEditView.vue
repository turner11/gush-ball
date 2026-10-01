<script setup>
import { onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import ImageUpload from '../components/ImageUpload.vue'
import TeamAdminsSection from '../components/TeamAdminsSection.vue'
import TeamContentSection from '../components/TeamContentSection.vue'
import { useAuth } from '../composables/useAuth'
import { teamSlug } from '../composables/useSelectedTeam'
import { useTeams } from '../composables/useTeams'

const route = useRoute()
const teamId = route.params.id

const { error, get, update } = useTeams()
const { user } = useAuth()

// Each group is one fieldset; every field keeps its `team-${key}` input id.
const GROUPS = [
  {
    legend: 'פרטים',
    fields: [
      { key: 'name', label: 'שם', type: 'text', required: true },
      { key: 'name_en', label: 'שם (אנגלית)', type: 'text' },
      { key: 'home_court_address', label: 'כתובת אולם הבית', type: 'text' },
    ],
  },
  { legend: 'מיתוג', fields: [{ key: 'logo_url', label: 'כתובת לוגו', type: 'url' }] },
  {
    legend: 'רשתות חברתיות',
    fields: [
      { key: 'facebook_url', label: 'פייסבוק', type: 'url' },
      { key: 'instagram_url', label: 'אינסטגרם', type: 'url' },
      { key: 'youtube_url', label: 'יוטיוב', type: 'url' },
      { key: 'tiktok_url', label: 'טיקטוק', type: 'url' },
      { key: 'twitter_url', label: 'טוויטר (X)', type: 'url' },
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
  try {
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value !== ''),
    )
    const updated = await update(teamId, payload)
    if (updated && !error.value) team.value = updated
  } finally {
    submitting.value = false
  }
}

onMounted(load)

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
                  <option value="hoop-1">רקע 1</option>
                  <option value="hoop-2">רקע 2</option>
                </select>
              </div>
            </template>
            <div v-for="field in group.fields" :key="field.key">
              <label :for="`team-${field.key}`" class="field-label">{{ field.label }}</label>
              <input :id="`team-${field.key}`" v-model="form[field.key]" :type="field.type" :required="field.required" class="field-input" />
              <template v-if="field.key === 'logo_url'">
                <ImageUpload @uploaded="(url) => (form.logo_url = url)" />
                <img v-if="form.logo_url" :src="form.logo_url" alt="" class="mt-2 size-16 object-contain" />
              </template>
            </div>
          </div>
        </fieldset>

        <p v-if="error" class="error-text" role="alert">{{ error }}</p>

        <div class="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <button type="submit" :disabled="submitting" class="btn-primary w-full sm:w-auto">
            שמירה
          </button>
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
        />
      </div>
      <TeamAdminsSection v-if="!user?.team_id" :team-id="teamId" />
    </template>
    <div v-else-if="loading" class="space-y-3" aria-busy="true">
      <div class="skeleton h-32" />
      <div class="skeleton h-32" />
    </div>
    <p v-else class="error-text" role="alert">{{ error || 'הקבוצה לא נמצאה' }}</p>
  </section>
</template>
