<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { RouterLink, useRoute } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import MembershipRequests from '../components/MembershipRequests.vue'
import SyncStatus from '../components/SyncStatus.vue'
import { fullAdmin, ownTeams, useAuth } from '../composables/useAuth'
import { useTeams } from '../composables/useTeams'

// The slug (when present) scopes the players/games links to one team.
const route = useRoute()
const base = computed(() => (route.params.slug ? '/' + route.params.slug : ''))

const { user } = useAuth()
const pickTeams = computed(() => !user.value?.team_id) // full and club admins both choose teams

const KIND_OPTIONS = [
  { value: 'players', label: 'שחקנים' },
  { value: 'games', label: 'משחקים (לוח ותוצאות)' },
  { value: 'standings', label: 'טבלת ליגה' },
]
const kinds = ref(KIND_OPTIONS.map((k) => k.value))
const autoAccept = ref(true)
const teamsApi = useTeams()
const teams = ref(null) // null = loading
const teamIds = ref([])

const allTeamsSelected = computed(() => teamIds.value.length === (teams.value?.length ?? 0))
const selectAllState = computed(() =>
  allTeamsSelected.value ? true : teamIds.value.length ? 'indeterminate' : false,
)
const toggleAllTeams = () => {
  teamIds.value = allTeamsSelected.value ? [] : teams.value.map((t) => t.id)
}
const toggleTeam = (id, on) => {
  teamIds.value = on ? [...teamIds.value, id] : teamIds.value.filter((i) => i !== id)
}
const teamsSummary = computed(() => {
  if (!teams.value) return 'טוען קבוצות…'
  if (allTeamsSelected.value) return 'כל הקבוצות'
  if (!teamIds.value.length) return 'לא נבחרו קבוצות'
  if (teamIds.value.length === 1) return teams.value.find((t) => t.id === teamIds.value[0]).name
  return `${teamIds.value.length} מתוך ${teams.value.length} קבוצות`
})
const ITEM_CLASS =
  'flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-lg px-3 text-sm data-[highlighted]:bg-sunken'
const syncBody = computed(() => ({
  kinds: kinds.value,
  auto_accept: autoAccept.value,
  ...(pickTeams.value && { team_ids: teamIds.value }),
}))
const cannotSync = computed(
  () => !kinds.value.length || (pickTeams.value && !teamIds.value.length),
)

onMounted(async () => {
  if (!pickTeams.value) return
  const all = (await teamsApi.list()) ?? []
  teams.value = ownTeams(all).filter((t) => t.ibasketball_team_url || t.ibasketball_league_url)
  teamIds.value = teams.value.map((t) => t.id)
})
</script>

<template>
  <section class="space-y-6">
    <div class="section-header">
      <h1 class="page-title">אזור ניהול</h1>
      <RouterLink to="/account" class="section-link">החשבון שלי</RouterLink>
    </div>
    <nav class="grid grid-cols-2 gap-3" :class="fullAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'">
      <RouterLink :to="base + '/admin/players'" class="card space-y-2 transition hover:border-team">
        <span class="flex size-10 items-center justify-center rounded-xl bg-sunken"><AppIcon name="users" /></span>
        <span class="block font-extrabold">ניהול שחקנים</span>
        <span class="block text-sm text-muted">שחקנים ותמונות</span>
      </RouterLink>
      <RouterLink :to="base + '/admin/games'" class="card space-y-2 transition hover:border-team">
        <span class="flex size-10 items-center justify-center rounded-xl bg-sunken"><AppIcon name="calendar" /></span>
        <span class="block font-extrabold">ניהול משחקים</span>
        <span class="block text-sm text-muted">לוח משחקים, תוצאות ותור אישור</span>
      </RouterLink>
      <RouterLink to="/admin/standings" class="card space-y-2 transition hover:border-team">
        <span class="flex size-10 items-center justify-center rounded-xl bg-sunken"><AppIcon name="table" /></span>
        <span class="block font-extrabold">ניהול טבלת ליגה</span>
        <span class="block text-sm text-muted">טבלאות ליגה לפי ליגה</span>
      </RouterLink>
      <RouterLink :to="{ name: 'admin-teams' }" class="card space-y-2 transition hover:border-team">
        <span class="flex size-10 items-center justify-center rounded-xl bg-sunken"><AppIcon name="shield" /></span>
        <span class="block font-extrabold">ניהול קבוצות</span>
        <span class="block text-sm text-muted">קבוצות, מיתוג ותוכן</span>
      </RouterLink>
      <RouterLink
        v-if="fullAdmin"
        :to="{ name: 'admin-users' }"
        class="card col-span-2 space-y-2 transition hover:border-team lg:col-span-1"
      >
        <span class="flex size-10 items-center justify-center rounded-xl bg-sunken"><AppIcon name="users" /></span>
        <span class="block font-extrabold">ניהול משתמשים</span>
        <span class="block text-sm text-muted">חשבונות, חיפוש ומחיקה</span>
      </RouterLink>
      <RouterLink
        v-if="fullAdmin"
        :to="{ name: 'admin-audit' }"
        class="card col-span-2 space-y-2 transition hover:border-team lg:col-span-1"
      >
        <span class="flex size-10 items-center justify-center rounded-xl bg-sunken"><AppIcon name="calendar" /></span>
        <span class="block font-extrabold">יומן שינויים</span>
        <span class="block text-sm text-muted">מי שינה מה ומתי</span>
      </RouterLink>
    </nav>

    <MembershipRequests />

    <div class="card space-y-2">
      <h2 class="section-title">סנכרון מ-ibasketball</h2>
      <fieldset class="space-y-2">
        <legend class="field-label">מה לסנכרן</legend>
        <div class="flex flex-wrap gap-x-4 gap-y-2">
          <label v-for="k in KIND_OPTIONS" :key="k.value" class="flex min-h-11 items-center gap-2">
            <input v-model="kinds" type="checkbox" :value="k.value" class="size-5" />
            {{ k.label }}
          </label>
        </div>
      </fieldset>
      <div v-if="kinds.includes('games')">
        <label class="flex min-h-11 items-center gap-2">
          <input v-model="autoAccept" type="checkbox" class="size-5" />
          אישור אוטומטי של משחקים
        </label>
        <p class="text-sm text-muted">משחקים שנערכו ידנית תמיד ימתינו לאישור</p>
      </div>
      <div v-if="pickTeams" class="space-y-1.5">
        <span id="sync-teams-label" class="field-label">קבוצות</span>
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <button
              id="sync-teams-trigger"
              type="button"
              aria-labelledby="sync-teams-label sync-teams-trigger"
              class="field-input flex items-center justify-between gap-2 text-start"
              :disabled="!teams?.length"
            >
              <span class="truncate">{{ teamsSummary }}</span>
              <AppIcon name="chevron" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              aria-labelledby="sync-teams-label"
              align="start"
              :side-offset="4"
              class="z-50 max-h-[var(--reka-dropdown-menu-content-available-height)] min-w-[var(--reka-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-line bg-raised p-1 shadow-card"
            >
              <DropdownMenuCheckboxItem
                :model-value="selectAllState"
                :class="ITEM_CLASS"
                @update:model-value="toggleAllTeams"
                @select.prevent
              >
                <span class="flex size-5 shrink-0 items-center justify-center rounded border border-muted">
                  <DropdownMenuItemIndicator>
                    <AppIcon :name="selectAllState === true ? 'check' : 'minus'" />
                  </DropdownMenuItemIndicator>
                </span>
                בחר הכל
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator class="my-1 h-px bg-line" />
              <DropdownMenuCheckboxItem
                v-for="t in teams"
                :key="t.id"
                :model-value="teamIds.includes(t.id)"
                :class="ITEM_CLASS"
                @update:model-value="(on) => toggleTeam(t.id, on)"
                @select.prevent
              >
                <span class="flex size-5 shrink-0 items-center justify-center rounded border border-muted">
                  <DropdownMenuItemIndicator><AppIcon name="check" /></DropdownMenuItemIndicator>
                </span>
                {{ t.name }}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <p v-if="teams?.length === 0 && !teamsApi.error.value" class="text-sm text-muted">
          אין קבוצות עם קישור ל-ibasketball.
          <RouterLink :to="{ name: 'admin-teams' }" class="underline">הוסיפו קישור בניהול קבוצות</RouterLink>
        </p>
        <p v-if="teamsApi.error.value" class="error-text" role="alert">{{ teamsApi.error.value }}</p>
      </div>
      <p v-else class="text-sm text-muted">הסנכרון יתבצע לקבוצה שלך בלבד</p>
      <SyncStatus v-slot="{ start, busy }">
        <button type="button" :disabled="busy || cannotSync" class="btn-primary" @click="start('/sync/now', syncBody)">
          סנכרון עכשיו
        </button>
      </SyncStatus>
    </div>
  </section>
</template>
