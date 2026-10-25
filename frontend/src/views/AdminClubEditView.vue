<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import ClubAboutForm from '../components/ClubAboutForm.vue'
import TeamContentSection from '../components/TeamContentSection.vue'
import { teamSlug } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { CONTENT_SECTIONS } from '../lib/teamContent'

const route = useRoute()
const router = useRouter()

const club = ref(null) // null = not found (once loaded)
const teams = ref([])
const loading = ref(true)
const loadFailed = ref(false)
const saved = ref(false)

const clubTeams = computed(() => (club.value ? teams.value.filter((t) => t.club === club.value.name) : []))

async function load() {
  loading.value = true
  loadFailed.value = false
  try {
    const [clubList, teamList] = await Promise.all([apiFetch('/clubs'), apiFetch('/teams')])
    club.value = clubList.find((c) => c.id === Number(route.params.id)) ?? null
    teams.value = teamList
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

function onSaved(updated) {
  club.value = updated
  saved.value = true
}

onMounted(load)
</script>

<template>
  <section class="space-y-6">
    <div v-if="loading" class="space-y-3" aria-busy="true">
      <div class="skeleton h-32" />
      <div class="skeleton h-32" />
    </div>
    <div v-else-if="loadFailed" class="space-y-3">
      <p class="error-text" role="alert">שגיאה בטעינת המועדון</p>
      <button type="button" class="btn-secondary" @click="load">נסו שוב</button>
    </div>
    <div v-else-if="!club" class="space-y-3">
      <p class="empty-state">המועדון לא נמצא.</p>
      <RouterLink :to="{ name: 'admin-clubs' }" class="btn-secondary">לכל המועדונים</RouterLink>
    </div>
    <template v-else>
      <div class="page-header">
        <h1 class="page-title">{{ club.name }}</h1>
        <RouterLink :to="'/clubs/' + teamSlug(club)" class="section-link">לעמוד המועדון</RouterLink>
      </div>
      <!-- grid-cols-1 = minmax(0,1fr): an implicit track grows to fit a long truncated item and overflows the page -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div class="space-y-6">
          <TeamContentSection :key="club.id" owner="clubs" :owner-id="club.id" v-bind="CONTENT_SECTIONS.posts" />
          <section class="card space-y-3">
            <h2 class="section-title">קבוצות המועדון</h2>
            <p v-if="!clubTeams.length" class="empty-state">אין קבוצות במועדון.</p>
            <ul v-else class="divide-y divide-line">
              <li v-for="t in clubTeams" :key="t.id">
                <RouterLink :to="{ name: 'admin-team-edit', params: { id: t.id } }" class="flex min-h-11 items-center">{{ t.name }}</RouterLink>
              </li>
            </ul>
          </section>
        </div>
        <div class="space-y-2">
          <ClubAboutForm :club="club" @saved="onSaved" @cancel="router.push({ name: 'admin-clubs' })" />
          <p class="text-sm text-muted" aria-live="polite">{{ saved ? 'נשמר' : '' }}</p>
        </div>
      </div>
    </template>
  </section>
</template>
