<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import { fullAdmin } from '../composables/useAuth'
import { apiFetch } from '../lib/api'
import { userLabel } from '../lib/format'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps({
  teamId: { type: [String, Number], required: true },
  club: { type: String, default: null }, // the team's saved club; enables the club-admin option
})

const base = `/teams/${props.teamId}/admins`

const admins = ref([])
const users = ref([])
const usersState = ref('loading') // 'loading' | 'ready' | 'failed'
const assignUserId = ref('')
const assignScope = ref('team')
const assigning = ref(false)
const assignError = ref('')
const username = ref('')
const email = ref('')
const password = ref('')
const scope = ref('team')
const submitting = ref(false)
const error = ref('')
const pendingDelete = ref(null) // { id, scope }

const scopeOf = (admin) => (admin.club ? 'club' : 'team')
// Only a full admin may touch club grants (the server enforces it too).
const canRemove = (admin) => !admin.club || fullAdmin.value
// Users not already an admin at the picked scope.
const candidates = computed(() =>
  users.value.filter((u) => !admins.value.some((a) => a.id === u.id && scopeOf(a) === assignScope.value)),
)

// A scope switch (or reload) can drop the picked user from the list.
watch(candidates, (list) => {
  if (!list.some((u) => u.id === assignUserId.value)) assignUserId.value = ''
})

async function loadAdmins() {
  admins.value = await apiFetch(base)
}

async function loadUsers() {
  try {
    users.value = await apiFetch('/teams/assignable-users')
    usersState.value = 'ready'
  } catch {
    usersState.value = 'failed'
  }
}

onMounted(async () => {
  loadUsers()
  try {
    await loadAdmins()
  } catch {
    error.value = 'שגיאה בטעינת המנהלים'
  }
})

async function onAssign() {
  assigning.value = true
  assignError.value = ''
  try {
    await apiFetch(`${base}/${assignUserId.value}`, { method: 'PUT', body: { scope: assignScope.value } })
    assignUserId.value = ''
    await loadAdmins()
  } catch {
    assignError.value = 'שגיאה בשיוך המנהל, נסה שוב'
  } finally {
    assigning.value = false
  }
}

async function onSubmit() {
  submitting.value = true
  error.value = ''
  try {
    admins.value.push(
      await apiFetch(base, {
        method: 'POST',
        body: { username: username.value, password: password.value, email: email.value.trim() || null, scope: scope.value },
      }),
    )
    username.value = ''
    email.value = ''
    password.value = ''
    scope.value = 'team'
    loadUsers()
  } catch (err) {
    // Only the duplicate username/email 409 carries a message worth showing.
    error.value = err.status === 409 ? err.message : 'שגיאה ביצירת המנהל, נסה שוב'
  } finally {
    submitting.value = false
  }
}

async function onDeleteConfirmed() {
  const { id, scope: grantScope } = pendingDelete.value
  pendingDelete.value = null
  try {
    await apiFetch(`${base}/${id}?scope=${grantScope}`, { method: 'DELETE' })
    admins.value = admins.value.filter((a) => !(a.id === id && scopeOf(a) === grantScope))
  } catch {
    error.value = 'שגיאה בהסרת המנהל, נסה שוב'
  }
}
</script>

<template>
  <section class="card space-y-3">
    <h2 class="section-title">מנהלי הקבוצה</h2>

    <ul v-if="admins.length" class="divide-y divide-line">
      <li v-for="admin in admins" :key="`${admin.id}-${scopeOf(admin)}`" class="flex items-center justify-between gap-2 py-2">
        <span class="min-w-0">
          <span class="block truncate" dir="auto">{{ userLabel(admin) }}</span>
          <span v-if="admin.email" class="block truncate text-sm text-muted" dir="ltr">{{ admin.email }}</span>
          <span v-if="admin.club" class="badge-muted">מנהל מועדון</span>
        </span>
        <button
          v-if="canRemove(admin)"
          type="button"
          class="btn-danger-ghost shrink-0"
          @click="pendingDelete = { id: admin.id, scope: scopeOf(admin) }"
        >הסרה</button>
      </li>
    </ul>
    <p v-else class="empty-state">אין מנהלים עדיין.</p>

    <ConfirmDialog
      :open="pendingDelete !== null"
      message="להסיר את הרשאת הניהול? החשבון עצמו לא יימחק."
      @update:open="(value) => !value && (pendingDelete = null)"
      @confirm="onDeleteConfirmed"
    />

    <form class="space-y-2" @submit.prevent="onAssign">
      <h3 class="field-label">שיוך משתמש קיים</h3>
      <fieldset v-if="fullAdmin && club">
        <legend class="field-label">סוג מנהל</legend>
        <label class="flex min-h-11 items-center gap-2">
          <input v-model="assignScope" type="radio" name="assign-scope" value="team" class="size-5" />
          מנהל קבוצה
        </label>
        <label class="flex min-h-11 items-center gap-2">
          <input v-model="assignScope" type="radio" name="assign-scope" value="club" class="size-5" />
          מנהל מועדון — כל הקבוצות של {{ club }}
        </label>
      </fieldset>
      <p v-if="usersState === 'failed'" class="error-text" role="alert">שגיאה בטעינת המשתמשים</p>
      <p v-else-if="usersState === 'ready' && !candidates.length" class="empty-state">אין משתמשים לשיוך</p>
      <template v-else>
        <div>
          <label for="assign-user" class="field-label">משתמש</label>
          <select id="assign-user" v-model="assignUserId" required :disabled="usersState === 'loading'" class="field-input w-full">
            <option v-if="usersState === 'loading'" value="">טוען…</option>
            <template v-else>
              <option value="" disabled>בחירת משתמש</option>
              <option v-for="u in candidates" :key="u.id" :value="u.id">{{ userLabel(u) }}</option>
            </template>
          </select>
        </div>
        <p v-if="assignError" class="error-text" role="alert">{{ assignError }}</p>
        <button type="submit" :disabled="assigning || !assignUserId" class="btn-primary w-full sm:w-auto">שיוך</button>
      </template>
    </form>

    <details v-if="fullAdmin">
      <summary class="flex min-h-11 cursor-pointer items-center font-bold">יצירת משתמש חדש</summary>
      <form class="space-y-2" @submit.prevent="onSubmit">
        <fieldset v-if="club">
          <legend class="field-label">סוג מנהל</legend>
          <label class="flex min-h-11 items-center gap-2">
            <input v-model="scope" type="radio" name="create-scope" value="team" class="size-5" />
            מנהל קבוצה
          </label>
          <label class="flex min-h-11 items-center gap-2">
            <input v-model="scope" type="radio" name="create-scope" value="club" class="size-5" />
            מנהל מועדון — כל הקבוצות של {{ club }}
          </label>
        </fieldset>
        <div>
          <label for="admin-username" class="field-label">שם משתמש</label>
          <input id="admin-username" v-model="username" type="text" required maxlength="64" pattern="[^@]+" title="שם המשתמש לא יכול להכיל @" autocomplete="off" dir="ltr" class="field-input" />
        </div>
        <div>
          <label for="admin-email" class="field-label">אימייל (לכניסה עם Google ולאיפוס סיסמה)</label>
          <input id="admin-email" v-model="email" type="email" maxlength="254" autocomplete="off" dir="ltr" class="field-input" />
        </div>
        <div>
          <label for="admin-password" class="field-label">סיסמה</label>
          <input
            id="admin-password"
            v-model="password"
            type="password"
            required
            minlength="8"
            autocomplete="new-password"
            dir="ltr"
            class="field-input"
          />
        </div>

        <button type="submit" :disabled="submitting" class="btn-secondary">יצירה</button>
      </form>
    </details>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </section>
</template>
