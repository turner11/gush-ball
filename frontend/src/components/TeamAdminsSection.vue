<script setup>
import { onMounted, ref } from 'vue'

import { apiFetch } from '../lib/api'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps({
  teamId: { type: [String, Number], required: true },
  club: { type: String, default: null }, // the team's saved club; enables the club-admin option
})

const base = `/teams/${props.teamId}/admins`

const admins = ref([])
const username = ref('')
const email = ref('')
const password = ref('')
const scope = ref('team')
const submitting = ref(false)
const error = ref('')
const pendingDeleteId = ref(null)

onMounted(async () => {
  try {
    admins.value = await apiFetch(base)
  } catch {
    error.value = 'שגיאה בטעינת המנהלים'
  }
})

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
  } catch (err) {
    // Only the duplicate username/email 409 carries a message worth showing.
    error.value = err.status === 409 ? err.message : 'שגיאה ביצירת המנהל, נסה שוב'
  } finally {
    submitting.value = false
  }
}

async function onDeleteConfirmed() {
  const id = pendingDeleteId.value
  pendingDeleteId.value = null
  try {
    await apiFetch(`${base}/${id}`, { method: 'DELETE' })
    admins.value = admins.value.filter((a) => a.id !== id)
  } catch {
    error.value = 'שגיאה במחיקת המנהל, נסה שוב'
  }
}
</script>

<template>
  <section class="card space-y-3">
    <h2 class="section-title">מנהלי הקבוצה</h2>

    <ul v-if="admins.length" class="divide-y divide-line">
      <li v-for="admin in admins" :key="admin.id" class="flex items-center justify-between gap-2 py-2">
        <span class="min-w-0">
          <span class="block truncate" dir="ltr">{{ admin.username }}</span>
          <span v-if="admin.email" class="block truncate text-sm text-muted" dir="ltr">{{ admin.email }}</span>
          <span v-if="admin.club" class="badge-muted">מנהל מועדון</span>
        </span>
        <button type="button" class="btn-danger-ghost shrink-0" @click="pendingDeleteId = admin.id">מחיקה</button>
      </li>
    </ul>
    <p v-else class="empty-state">אין מנהלים עדיין.</p>

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      message="למחוק מנהל זה? הוא ינותק מיד."
      @update:open="(value) => !value && (pendingDeleteId = null)"
      @confirm="onDeleteConfirmed"
    />

    <form class="space-y-2" @submit.prevent="onSubmit">
      <fieldset v-if="club">
        <legend class="field-label">סוג מנהל</legend>
        <label class="flex min-h-11 items-center gap-2">
          <input v-model="scope" type="radio" value="team" class="size-5" />
          מנהל קבוצה
        </label>
        <label class="flex min-h-11 items-center gap-2">
          <input v-model="scope" type="radio" value="club" class="size-5" />
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

      <p v-if="error" class="error-text" role="alert">{{ error }}</p>

      <button type="submit" :disabled="submitting" class="btn-primary">יצירה</button>
    </form>
  </section>
</template>
