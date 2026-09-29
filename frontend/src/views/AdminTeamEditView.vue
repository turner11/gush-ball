<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'

import TeamContentSection from '../components/TeamContentSection.vue'
import { useTeams } from '../composables/useTeams'

const route = useRoute()
const teamId = route.params.id

const { error, get, update } = useTeams()

const team = ref(null)
const loading = ref(true)
const submitting = ref(false)
const form = reactive({
  name: '',
  name_en: '',
  primary_color: '#000000',
  secondary_color: '#000000',
  logo_url: '',
  home_court_address: '',
  facebook_url: '',
  instagram_url: '',
  youtube_url: '',
  tiktok_url: '',
  twitter_url: '',
  ibasketball_team_url: '',
  ibasketball_league_url: '',
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

        <div>
          <label for="team-name" class="field-label">שם</label>
          <input
            id="team-name"
            v-model="form.name"
            type="text"
            required
            class="field-input"
          />
        </div>

        <div>
          <label for="team-name-en" class="field-label">שם (אנגלית)</label>
          <input
            id="team-name-en"
            v-model="form.name_en"
            type="text"
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
          <label for="team-logo-url" class="field-label">כתובת לוגו</label>
          <input
            id="team-logo-url"
            v-model="form.logo_url"
            type="url"
            class="field-input"
          />
        </div>

        <div>
          <label for="team-home-court" class="field-label">כתובת אולם הבית</label>
          <input
            id="team-home-court"
            v-model="form.home_court_address"
            type="text"
            class="field-input"
          />
        </div>

        <div>
          <label for="team-facebook" class="field-label">פייסבוק</label>
          <input
            id="team-facebook"
            v-model="form.facebook_url"
            type="url"
            class="field-input"
          />
        </div>

        <div>
          <label for="team-instagram" class="field-label">אינסטגרם</label>
          <input
            id="team-instagram"
            v-model="form.instagram_url"
            type="url"
            class="field-input"
          />
        </div>

        <div>
          <label for="team-youtube" class="field-label">יוטיוב</label>
          <input
            id="team-youtube"
            v-model="form.youtube_url"
            type="url"
            class="field-input"
          />
        </div>

        <div>
          <label for="team-tiktok" class="field-label">טיקטוק</label>
          <input
            id="team-tiktok"
            v-model="form.tiktok_url"
            type="url"
            class="field-input"
          />
        </div>

        <div>
          <label for="team-twitter" class="field-label">טוויטר (X)</label>
          <input
            id="team-twitter"
            v-model="form.twitter_url"
            type="url"
            class="field-input"
          />
        </div>

        <div>
          <label for="team-ibasketball-team" class="field-label">
            כתובת קבוצה ב-ibasketball
          </label>
          <input
            id="team-ibasketball-team"
            v-model="form.ibasketball_team_url"
            type="url"
            class="field-input"
          />
        </div>

        <div>
          <label for="team-ibasketball-league" class="field-label">
            כתובת ליגה ב-ibasketball
          </label>
          <input
            id="team-ibasketball-league"
            v-model="form.ibasketball_league_url"
            type="url"
            class="field-input"
          />
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
