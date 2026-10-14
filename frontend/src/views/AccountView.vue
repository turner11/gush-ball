<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import ConfirmDialog from '../components/ConfirmDialog.vue'
import MyMemberships from '../components/MyMemberships.vue'
import { useAuth } from '../composables/useAuth'
import { useTeams } from '../composables/useTeams'
import { apiFetch } from '../lib/api'

const router = useRouter()
const { user } = useAuth()
const teamsApi = useTeams()

const teams = ref(null) // null = loading
onMounted(async () => {
  loadPlayers()
  teams.value = (await teamsApi.list()) ?? []
})
const teamName = (id) => teams.value?.find((t) => t.id === id)?.name ?? '…'

// ---- display name ----
const displayName = ref(user.value?.display_name ?? '')
const nameBusy = ref(false)
const nameSaved = ref(false)
const nameError = ref('')

async function saveName() {
  nameBusy.value = true
  nameSaved.value = false
  nameError.value = ''
  try {
    user.value = await apiFetch('/auth/me', { method: 'PATCH', body: { display_name: displayName.value } })
    displayName.value = user.value.display_name
    nameSaved.value = true
  } catch {
    nameError.value = 'שגיאה בשמירת השם, נסו שוב'
  } finally {
    nameBusy.value = false
  }
}

// ---- password ----
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const pwBusy = ref(false)
const pwDone = ref(false)
const currentError = ref('')
const confirmError = ref('')
const pwError = ref('')

async function changePassword() {
  pwDone.value = false
  currentError.value = confirmError.value = pwError.value = ''
  if (newPassword.value !== confirmPassword.value) {
    confirmError.value = 'הסיסמאות אינן תואמות'
    return
  }
  pwBusy.value = true
  try {
    await apiFetch('/auth/change-password', {
      method: 'POST',
      body: { current_password: currentPassword.value, new_password: newPassword.value },
    })
    currentPassword.value = newPassword.value = confirmPassword.value = ''
    pwDone.value = true
  } catch (err) {
    if (err.status === 400) currentError.value = 'הסיסמה הנוכחית שגויה'
    else if (err.status === 429) pwError.value = 'יותר מדי ניסיונות, נסו שוב מאוחר יותר'
    else pwError.value = 'שגיאה בעדכון הסיסמה, נסו שוב'
  } finally {
    pwBusy.value = false
  }
}

// ---- linked players ----
const players = ref(null) // null = loading
const playersError = ref('')

async function loadPlayers() {
  players.value = null
  playersError.value = ''
  try {
    players.value = await Promise.all((user.value?.player_ids ?? []).map((id) => apiFetch(`/players/${id}`)))
  } catch {
    playersError.value = 'שגיאה בטעינת השחקנים'
  }
}

// ---- delete account ----
const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref('')

async function deleteAccount() {
  confirmingDelete.value = false
  deleting.value = true
  deleteError.value = ''
  try {
    await apiFetch('/auth/me', { method: 'DELETE' })
    user.value = null
    router.push('/')
  } catch (err) {
    deleteError.value = err.status === 409 ? err.message : 'שגיאה במחיקת החשבון, נסו שוב'
  } finally {
    deleting.value = false
  }
}

const hasPlayers = computed(() => players.value?.length > 0)
</script>

<template>
  <section class="mx-auto max-w-xl space-y-4">
    <header class="page-header">
      <h1 class="page-title">החשבון שלי</h1>
      <p class="text-sm text-muted">שם משתמש: <span dir="auto">{{ user?.username }}</span></p>
    </header>

    <form class="card space-y-3" @submit.prevent="saveName">
      <h2 class="section-title">פרטים</h2>
      <div>
        <label for="account-display-name" class="field-label">שם תצוגה</label>
        <input
          id="account-display-name"
          v-model="displayName"
          type="text"
          required
          maxlength="64"
          autocomplete="name"
          dir="auto"
          class="field-input w-full"
        />
      </div>
      <p v-if="nameError" class="error-text" role="alert">{{ nameError }}</p>
      <p v-if="nameSaved" class="text-sm text-muted" role="status">השם נשמר</p>
      <button type="submit" :disabled="nameBusy" class="btn-primary w-full sm:w-auto">שמירה</button>
    </form>

    <form class="card space-y-3" @submit.prevent="changePassword">
      <h2 class="section-title">סיסמה</h2>
      <div>
        <label for="account-current-password" class="field-label">סיסמה נוכחית</label>
        <input
          id="account-current-password"
          v-model="currentPassword"
          type="password"
          required
          autocomplete="current-password"
          dir="ltr"
          class="field-input w-full"
          :aria-invalid="currentError ? 'true' : undefined"
          :aria-describedby="currentError ? 'account-current-error' : undefined"
        />
        <p v-if="currentError" id="account-current-error" class="error-text">{{ currentError }}</p>
      </div>
      <div>
        <label for="account-new-password" class="field-label">סיסמה חדשה</label>
        <input
          id="account-new-password"
          v-model="newPassword"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
          dir="ltr"
          class="field-input w-full"
        />
      </div>
      <div>
        <label for="account-confirm-password" class="field-label">אימות סיסמה חדשה</label>
        <input
          id="account-confirm-password"
          v-model="confirmPassword"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
          dir="ltr"
          class="field-input w-full"
          :aria-invalid="confirmError ? 'true' : undefined"
          :aria-describedby="confirmError ? 'account-confirm-error' : undefined"
        />
        <p v-if="confirmError" id="account-confirm-error" class="error-text">{{ confirmError }}</p>
      </div>
      <p v-if="pwError" class="error-text" role="alert">{{ pwError }}</p>
      <p v-if="pwDone" class="text-sm text-muted" role="status">הסיסמה עודכנה. חיבורים אחרים נותקו</p>
      <button type="submit" :disabled="pwBusy" class="btn-primary w-full sm:w-auto">עדכון סיסמה</button>
      <RouterLink :to="{ name: 'admin-reset-password' }" class="section-link block">
        נרשמתם עם Google או שכחתם את הסיסמה? קבלו קישור לקביעת סיסמה
      </RouterLink>
    </form>

    <MyMemberships :teams="teams" title="הקבוצות שלי" />
    <RouterLink to="/join" class="section-link block">הצטרפות לקבוצה נוספת</RouterLink>

    <div class="card space-y-3">
      <h2 class="section-title">השחקנים שלי</h2>
      <div v-if="players === null && !playersError" class="space-y-2" aria-busy="true">
        <div class="skeleton h-11"></div>
        <div class="skeleton h-11"></div>
      </div>
      <div v-else-if="playersError" class="space-y-2">
        <p class="error-text" role="alert">{{ playersError }}</p>
        <button type="button" class="btn-secondary" @click="loadPlayers">נסו שוב</button>
      </div>
      <p v-else-if="!hasPlayers" class="empty-state">
        אין שחקן מקושר לחשבון. מנהל הקבוצה יכול לקשר אותך לשחקן בסגל
      </p>
      <ul v-else class="divide-y divide-line">
        <li v-for="p in players" :key="p.id" class="flex min-h-11 items-center justify-between gap-2 py-2">
          <span class="min-w-0">
            <span class="block truncate font-bold" dir="auto">{{ p.name }}</span>
            <span class="block truncate text-sm text-muted" dir="auto">{{ teamName(p.team_id) }}</span>
          </span>
          <RouterLink :to="`/players/${p.id}`" class="section-link shrink-0">לפרופיל</RouterLink>
        </li>
      </ul>
    </div>

    <div class="card space-y-3">
      <h2 class="section-title">מחיקת חשבון</h2>
      <p class="text-sm text-muted">החשבון, החברויות שלו והקישור לשחקנים יוסרו לצמיתות.</p>
      <p v-if="deleteError" class="error-text" role="alert">{{ deleteError }}</p>
      <button type="button" :disabled="deleting" class="btn-danger w-full sm:w-auto" @click="confirmingDelete = true">
        מחיקת החשבון
      </button>
    </div>

    <ConfirmDialog
      v-model:open="confirmingDelete"
      message="למחוק את החשבון לצמיתות? החברויות שלך יימחקו והקישור לשחקנים יוסר."
      @confirm="deleteAccount"
    />
  </section>
</template>
