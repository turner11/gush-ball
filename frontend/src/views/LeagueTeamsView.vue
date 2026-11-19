<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import ConfirmDialog from '../components/ConfirmDialog.vue'
import TeamCard from '../components/TeamCard.vue'
import { useAuth, viewer } from '../composables/useAuth'
import { useFavorites } from '../composables/useFavorites'
import { teamSlug } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { leagueKey } from '../lib/leagues'
import LoadError from '../components/LoadError.vue'

const route = useRoute()
const router = useRouter()
const { checked, checkSession } = useAuth()
const league = ref(null) // null = loading
const ours = ref([]) // GET /teams, kept to match the ibasketball list
const onSite = ref([])
const others = ref(null) // null = ibasketball list still loading; else the not-on-site rows
const othersFailed = ref(false)
const notFound = ref(false)
const errorStatus = ref(null)
const confirming = ref(null) // the not-on-site team awaiting the request confirmation
const busy = ref(false)
const requestError = ref('')
const notice = ref(null) // { text, account } after a request

// Our own teams come from the DB and show at once; ibasketball's list is slow and fills in after.
async function load() {
  league.value = null
  onSite.value = []
  others.value = null
  othersFailed.value = false
  notFound.value = false
  errorStatus.value = null
  const pending = fetchOthers() // start now so the total time is the slower call, not the sum
  pending.catch(() => {}) // loadOthers reports the failure
  try {
    const [teams, leagues] = await Promise.all([apiFetch('/teams'), apiFetch('/leagues')])
    ours.value = teams
    league.value = leagues.find((l) => l.ibasketball_id === Number(route.params.leagueId)) ?? null
  } catch (err) {
    errorStatus.value = err.status ?? 0
    return
  }
  if (!league.value) {
    notFound.value = true
    return
  }
  onSite.value = ours.value.filter((t) => leagueKey(t.ibasketball_league_url) === leagueKey(league.value.url))
  await loadOthers(pending)
}

const fetchOthers = () => apiFetch(`/leagues/${route.params.leagueId}/teams`)

async function loadOthers(pending = fetchOthers()) {
  others.value = null
  othersFailed.value = false
  let result
  try {
    result = await pending
  } catch {
    othersFailed.value = true
    return
  }
  const byId = new Map(ours.value.map((t) => [t.id, t]))
  const listed = new Set(onSite.value.map((t) => t.id))
  // union: a team whose code matches but whose league URL is stale still shows
  for (const t of result.teams) if (byId.has(t.team_id) && !listed.has(t.team_id)) onSite.value.push(byId.get(t.team_id))
  others.value = result.teams.filter((t) => !byId.has(t.team_id))
  await openRequestFromLogin()
}
watch(() => route.params.leagueId, load, { immediate: true })

const requestPath = (t) => `/teams/${route.params.leagueId}?request=${encodeURIComponent(t.ibasketball_team_url)}`
const toLogin = (t) => router.push({ name: 'admin-login', query: { next: requestPath(t) } })

async function ask(t) {
  requestError.value = ''
  notice.value = null
  if (!checked.value) await checkSession()
  if (!viewer.value) return toLogin(t)
  confirming.value = t
}

// Back from login with ?request=<team url>: reopen the confirm for that team.
async function openRequestFromLogin() {
  const wanted = route.query.request
  const t = others.value.find((x) => x.ibasketball_team_url === wanted && !x.requested)
  if (!t) return
  if (!checked.value) await checkSession()
  if (viewer.value) confirming.value = t
}

function closeConfirm() {
  confirming.value = null
  if (route.query.request) router.replace({ query: {} })
}

async function submitRequest() {
  const t = confirming.value
  closeConfirm()
  busy.value = true
  try {
    const { status } = await apiFetch('/team-requests', {
      method: 'POST',
      body: { league_id: league.value.ibasketball_id, ibasketball_team_url: t.ibasketball_team_url },
    })
    if (status === 'approved') {
      await load() // the team moves to "on the site"
      notice.value = { text: 'הקבוצה נוספה לאתר. המשחקים והטבלה ייטענו בדקות הקרובות' }
    } else {
      t.requested = true
      notice.value = { text: 'הבקשה נשלחה וממתינה לאישור', account: true }
    }
    await checkSession() // fresh team_requests and admin flags
  } catch (err) {
    if (err.status === 401) await toLogin(t)
    else requestError.value = [403, 409].includes(err.status) ? err.message : 'שגיאה בשליחת הבקשה, נסו שוב'
  } finally {
    busy.value = false
  }
}

const { sortTeams } = useFavorites()
const onSiteTeams = computed(() => sortTeams(onSite.value))
const empty = computed(() => others.value !== null && !onSite.value.length && !others.value.length)
</script>

<template>
  <div>
    <RouterLink :to="{ name: 'teams' }" class="section-link mb-3 inline-block">→ חזרה לקבוצות</RouterLink>

    <h1 v-if="!league" class="sr-only">ליגה</h1>
    <div v-if="notFound" class="empty-state">
      <p>הליגה לא נמצאה</p>
      <RouterLink :to="{ name: 'teams' }" class="btn-secondary mt-3">חזרה לקבוצות</RouterLink>
    </div>
    <LoadError v-else-if="errorStatus !== null" message="שגיאה בטעינת הליגה" @retry="load" />
    <div v-else-if="!league" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
      <div v-for="n in 8" :key="n" class="skeleton h-36"></div>
    </div>
    <template v-else>
      <div class="page-header"><h1 class="page-title">{{ league.name }}</h1></div>
      <p v-if="notice" class="mb-4 text-sm" role="status">
        {{ notice.text }}
        <RouterLink v-if="notice.account" to="/account" class="section-link">למעקב</RouterLink>
      </p>
      <p v-if="requestError" class="error-text mb-4" role="alert">{{ requestError }}</p>
      <p v-if="empty" class="empty-state">אין קבוצות בליגה הזו עדיין.</p>
      <div v-else class="space-y-10 sm:space-y-14">
        <section v-if="onSite.length">
          <h2 v-if="others === null || others?.length" class="section-title">קבוצות באתר</h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <TeamCard v-for="team in onSiteTeams" :key="team.id" :team-id="team.id" :name="team.name" :logo-url="team.logo_url" :to="'/' + teamSlug(team)" />
          </div>
        </section>
        <section v-if="othersFailed">
          <LoadError message="לא הצלחנו לטעון את שאר קבוצות הליגה מאתר האיגוד" @retry="loadOthers()" />
        </section>
        <section v-else-if="others === null" aria-busy="true">
          <h2 v-if="onSite.length" class="section-title">עוד בליגה</h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <div v-for="n in 4" :key="n" class="skeleton h-36"></div>
          </div>
          <p class="mt-3 text-sm text-muted" role="status">טוען את שאר קבוצות הליגה…</p>
        </section>
        <section v-else-if="others.length">
          <h2 v-if="onSite.length" class="section-title">עוד בליגה</h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <TeamCard v-for="t in others" :key="t.ibasketball_team_url" :name="t.name" :logo-url="t.logo_url">
              <span v-if="t.requested" class="badge-muted">ממתין לאישור</span>
              <button
                v-else
                type="button"
                class="btn-secondary w-full"
                :disabled="busy"
                :aria-label="`בקשת הוספה: ${t.name}`"
                @click="ask(t)"
              >בקשת הוספה</button>
            </TeamCard>
          </div>
        </section>
      </div>
    </template>

    <ConfirmDialog
      :open="confirming !== null"
      :danger="false"
      :message="confirming ? `לבקש להוסיף את ${confirming.name} לאתר? אחרי אישור מנהל תהיו מנהלי הקבוצה.` : ''"
      @update:open="(value) => !value && closeConfirm()"
      @confirm="submitRequest"
    />
  </div>
</template>
