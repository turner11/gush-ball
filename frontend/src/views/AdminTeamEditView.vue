<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'

import TeamContentSection from '../components/TeamContentSection.vue'
import { useTeams } from '../composables/useTeams'

const route = useRoute()
const teamId = route.params.id

const { error, get, update } = useTeams()

// Plain inputs shown above and below the color pickers.
const NAME_FIELDS = [
  { key: 'name', label: 'שם', type: 'text', required: true },
  { key: 'name_en', label: 'שם (אנגלית)', type: 'text' },
]
const DETAIL_FIELDS = [
  { key: 'logo_url', label: 'כתובת לוגו', type: 'url' },
  { key: 'home_court_address', label: 'כתובת אולם הבית', type: 'text' },
  { key: 'facebook_url', label: 'פייסבוק', type: 'url' },
  { key: 'instagram_url', label: 'אינסטגרם', type: 'url' },
  { key: 'youtube_url', label: 'יוטיוב', type: 'url' },
  { key: 'tiktok_url', label: 'טיקטוק', type: 'url' },
  { key: 'twitter_url', label: 'טוויטר (X)', type: 'url' },
  { key: 'ibasketball_team_url', label: 'כתובת קבוצה ב-ibasketball', type: 'url' },
  { key: 'ibasketball_league_url', label: 'כתובת ליגה ב-ibasketball', type: 'url' },
]

const team = ref(null)
const loading = ref(true)
const submitting = ref(false)
const form = reactive({
  ...Object.fromEntries([...NAME_FIELDS, ...DETAIL_FIELDS].map((f) => [f.key, ''])),
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
    ],
  },
  {
    resource: 'images',
    heading: 'תמונות',
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'title_en', label: 'כותרת (אנגלית)', type: 'text' },
      { key: 'url', label: 'כתובת', type: 'url', required: true },
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
    <h1 class="page-title">עריכת קבוצה</h1>

    <template v-if="team">
      <form class="max-w-lg space-y-3" @submit.prevent="onSubmit">
        <div>
          <span class="field-label">מזהה (slug)</span>
          <p class="mt-1 text-neutral-600 dark:text-neutral-400">{{ team.slug }}</p>
        </div>

        <div v-for="field in NAME_FIELDS" :key="field.key">
          <label :for="`team-${field.key}`" class="field-label">{{ field.label }}</label>
          <input
            :id="`team-${field.key}`"
            v-model="form[field.key]"
            :type="field.type"
            :required="field.required"
            class="field-input"
          />
        </div>

        <div class="flex gap-4">
          <div>
            <label for="team-primary-color" class="field-label">צבע ראשי</label>
            <input id="team-primary-color" v-model="form.primary_color" type="color" class="mt-1" />
          </div>
          <div>
            <label for="team-secondary-color" class="field-label">צבע משני</label>
            <input
              id="team-secondary-color"
              v-model="form.secondary_color"
              type="color"
              class="mt-1"
            />
          </div>
        </div>

        <div>
          <label for="team-background" class="field-label">רקע</label>
          <select id="team-background" v-model="form.background" class="field-input">
            <option value="hoop-1">רקע 1</option>
            <option value="hoop-2">רקע 2</option>
          </select>
        </div>

        <div v-for="field in DETAIL_FIELDS" :key="field.key">
          <label :for="`team-${field.key}`" class="field-label">{{ field.label }}</label>
          <input :id="`team-${field.key}`" v-model="form[field.key]" :type="field.type" class="field-input" />
        </div>

        <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

        <button type="submit" :disabled="submitting" class="btn-primary w-full">
          שמירה
        </button>
      </form>

      <TeamContentSection
        v-for="section in contentSections"
        :key="section.resource"
        :team-id="teamId"
        :resource="section.resource"
        :heading="section.heading"
        :fields="section.fields"
      />
    </template>
    <p v-else-if="loading" class="text-neutral-500">טוען...</p>
    <p v-else class="text-red-600 dark:text-red-400">{{ error || 'הקבוצה לא נמצאה' }}</p>
  </section>
</template>
