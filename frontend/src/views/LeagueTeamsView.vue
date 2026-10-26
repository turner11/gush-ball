<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import ConfirmDialog from '../components/ConfirmDialog.vue'
import TeamCard from '../components/TeamCard.vue'
import { useAuth, viewer } from '../composables/useAuth'
import { useFavorites } from '../composables/useFavorites'
import { teamSlug } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import LoadError from '../components/LoadError.vue'

const route = useRoute()
const router = useRouter()
const { checked, checkSession } = useAuth()
const data = ref(null) // null = loading
const errorStatus = ref(null)
const confirming = ref(null) // the not-on-site team awaiting the request confirmation
const busy = ref(false)
const requestError = ref('')
const notice = ref(null) // { text, account } after a request

async function load() {
  data.value = null
  errorStatus.value = null
  try {
    const [ours, result] = await Promise.all([apiFetch('/teams'), apiFetch(`/leagues/${route.params.leagueId}/teams`)])
    const byId = new Map(ours.map((t) => [t.id, t]))
    data.value = {
      league: result.league,
      onSite: result.teams.filter((t) => byId.has(t.team_id)).map((t) => byId.get(t.team_id)),
      notOnSite: result.teams.filter((t) => !byId.has(t.team_id)),
    }
  } catch (err) {
    errorStatus.value = err.status ?? 0
    return
  }
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
  const t = data.value.notOnSite.find((x) => x.ibasketball_team_url === wanted && !x.requested)
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
      body: { league_id: data.value.league.ibasketball_id, ibasketball_team_url: t.ibasketball_team_url },
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
const onSiteTeams = computed(() => sortTeams(data.value?.onSite ?? []))
const empty = computed(() => data.value && !data.value.onSite.length && !data.value.notOnSite.length)
</script>

<template>
  <div>
    <RouterLink :to="{ name: 'teams' }" class="section-link mb-3 inline-block">→ חזרה לקבוצות</RouterLink>

    <div v-if="errorStatus === 404" class="empty-state">
      <p>הליגה לא נמצאה</p>
      <RouterLink :to="{ name: 'teams' }" class="btn-secondary mt-3">חזרה לקבוצות</RouterLink>
    </div>
    <LoadError v-else-if="errorStatus !== null" message="לא הצלחנו לטעון את קבוצות הליגה מאתר האיגוד" @retry="load" />
    <div v-else-if="data === null" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
      <div v-for="n in 8" :key="n" class="skeleton h-36"></div>
    </div>
    <template v-else>
      <div class="page-header"><h1 class="page-title">{{ data.league.name }}</h1></div>
      <p v-if="notice" class="mb-4 text-sm" role="status">
        {{ notice.text }}
        <RouterLink v-if="notice.account" to="/account" class="section-link">למעקב</RouterLink>
      </p>
      <p v-if="requestError" class="error-text mb-4" role="alert">{{ requestError }}</p>
      <p v-if="empty" class="empty-state">אין קבוצות בליגה הזו עדיין.</p>
      <div v-else class="space-y-10 sm:space-y-14">
        <section v-if="data.onSite.length">
          <h2 v-if="data.notOnSite.length" class="section-title">קבוצות באתר</h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <TeamCard v-for="team in onSiteTeams" :key="team.id" :team-id="team.id" :name="team.name" :logo-url="team.logo_url" :to="'/' + teamSlug(team)" />
          </div>
        </section>
        <section v-if="data.notOnSite.length">
          <h2 v-if="data.onSite.length" class="section-title">עוד בליגה</h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <TeamCard v-for="t in data.notOnSite" :key="t.ibasketball_team_url" :name="t.name" :logo-url="t.logo_url">
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
