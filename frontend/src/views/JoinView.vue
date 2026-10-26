<script setup>
import { computed, onMounted, ref } from 'vue'

import MyMemberships from '../components/MyMemberships.vue'
import { useAuth } from '../composables/useAuth'
import { useFavorites } from '../composables/useFavorites'
import { useTeams } from '../composables/useTeams'
import { apiFetch } from '../lib/api'
import LoadError from '../components/LoadError.vue'

const { user, checkSession } = useAuth()
const teamsApi = useTeams()

const teams = ref(null) // null = loading
const kind = ref('team')
const picked = ref('')
const submitting = ref(false)
const status = ref('')
const submitError = ref('')

async function loadTeams() {
  teams.value = null
  teams.value = (await teamsApi.list()) ?? []
}
onMounted(loadTeams)

const memberships = computed(() => user.value?.memberships ?? [])

// Teams and clubs the player has no row for yet.
const { sortTeams, sortGroups } = useFavorites()
const teamOptions = computed(() =>
  sortTeams(
    (teams.value ?? [])
      .filter((t) => !memberships.value.some((m) => m.team_id === t.id)),
  ).map((t) => ({ value: t.id, label: t.club ? `${t.name} · ${t.club}` : t.name })),
)
const clubOptions = computed(() =>
  sortGroups(
    [...new Set((teams.value ?? []).map((t) => t.club).filter(Boolean))].filter(
      (club) => !memberships.value.some((m) => m.club === club),
    ),
    (club) => (teams.value ?? []).filter((t) => t.club === club),
    (club) => club,
  ).map((club) => ({ value: club, label: club })),
)
const hasClubs = computed(() => (teams.value ?? []).some((t) => t.club))
const options = computed(() => (kind.value === 'club' ? clubOptions.value : teamOptions.value))

function onKindChange() {
  picked.value = ''
}

async function onSubmit() {
  submitting.value = true
  status.value = ''
  submitError.value = ''
  try {
    await apiFetch('/memberships', {
      method: 'POST',
      body: kind.value === 'club' ? { club: picked.value } : { team_id: picked.value },
    })
    picked.value = ''
    await checkSession() // user.memberships stays the single source of truth
    status.value = 'הבקשה נשלחה וממתינה לאישור'
  } catch (err) {
    submitError.value = err.status === 409 ? 'כבר שלחת בקשה לקבוצה או למועדון הזה' : 'שגיאה בשליחת הבקשה, נסו שוב'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-xl space-y-4">
    <header class="page-header">
      <h1 class="page-title">הצטרפות לקבוצה</h1>
      <p class="text-sm text-muted">
        מחובר/ת בתור <span dir="auto">{{ user?.display_name }}</span>
        <RouterLink :to="{ name: 'account' }" class="section-link ms-2">החשבון שלי</RouterLink>
      </p>
    </header>

    <MyMemberships v-if="memberships.length" :teams="teams" />

    <div class="card space-y-3">
      <h2 class="section-title">בקשת הצטרפות</h2>
      <p v-if="!memberships.length" class="text-sm text-muted">
        בחרו קבוצה או מועדון ושלחו בקשה. לאחר אישור המנהל תוכלו לצפות בתוכן פרטי של הקבוצה.
      </p>

      <div v-if="teams === null && !teamsApi.error.value" class="space-y-2" aria-busy="true">
        <div class="skeleton h-11"></div>
        <div class="skeleton h-11"></div>
      </div>
      <LoadError v-else-if="teamsApi.error.value" :message="teamsApi.error.value" @retry="loadTeams" />
      <p v-else-if="!teams.length" class="empty-state">אין קבוצות עדיין</p>
      <form v-else class="space-y-3" @submit.prevent="onSubmit">
        <fieldset v-if="hasClubs">
          <legend class="field-label">הצטרפות אל</legend>
          <label class="flex min-h-11 items-center gap-2">
            <input v-model="kind" type="radio" name="join-kind" value="team" class="size-5" @change="onKindChange" />
            קבוצה
          </label>
          <label class="flex min-h-11 items-center gap-2">
            <input v-model="kind" type="radio" name="join-kind" value="club" class="size-5" @change="onKindChange" />
            מועדון
          </label>
        </fieldset>
        <div>
          <label for="join-target" class="field-label">{{ kind === 'club' ? 'מועדון' : 'קבוצה' }}</label>
          <select id="join-target" v-model="picked" required :disabled="!options.length" class="field-input w-full">
            <option v-if="!options.length" value="">אין קבוצות נוספות</option>
            <template v-else>
              <option value="" disabled>בחירה</option>
              <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
            </template>
          </select>
        </div>
        <p v-if="submitError" class="error-text" role="alert">{{ submitError }}</p>
        <p v-if="status" class="text-sm text-muted" role="status">{{ status }}</p>
        <button type="submit" :disabled="submitting || picked === ''" class="btn-primary w-full sm:w-auto">
          שליחת בקשה
        </button>
      </form>
    </div>
  </section>
</template>
