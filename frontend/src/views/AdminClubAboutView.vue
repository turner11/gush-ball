<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import ImageListEditor from '../components/ImageListEditor.vue'
import ImageUpload from '../components/ImageUpload.vue'
import { clubAdmin, fullAdmin } from '../composables/useAuth'
import { teamSlug } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const route = useRoute()
const clubId = Number(route.params.id)
const club = ref(null)
const loading = ref(true)
const loadError = ref(false)
const saving = ref(false)
const saved = ref(false)
const saveError = ref(null)
const form = reactive({ about_title: '', about_title_en: '', about: '', about_en: '', about_images: [], about_links: [], officials: [] })

const allowed = computed(() => fullAdmin.value || clubAdmin(club.value?.name))

function fill(c) {
  club.value = c
  Object.assign(form, {
    about_title: c.about_title ?? '',
    about_title_en: c.about_title_en ?? '',
    about: c.about ?? '',
    about_en: c.about_en ?? '',
    about_images: c.about_images.map((i) => ({ ...i, title: i.title ?? '', title_en: i.title_en ?? '' })),
    about_links: c.about_links.map((l) => ({ ...l, label_en: l.label_en ?? '' })),
    officials: c.officials.map((o) => ({ ...o, image_url: o.image_url ?? '', about: o.about ?? '' })),
  })
}

async function load() {
  loading.value = true
  loadError.value = false
  try {
    const found = (await apiFetch('/clubs')).find((c) => c.id === clubId)
    club.value = found ?? null
    if (found) fill(found)
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

const orNull = (v) => v.trim() || null

function move(i, delta) {
  const list = form.officials
  ;[list[i], list[i + delta]] = [list[i + delta], list[i]]
}

async function save() {
  saving.value = true
  saved.value = false
  saveError.value = null
  try {
    const body = {
      about_title: orNull(form.about_title),
      about_title_en: orNull(form.about_title_en),
      about: orNull(form.about),
      about_en: orNull(form.about_en),
      about_images: form.about_images.map((i) => ({ url: i.url, title: orNull(i.title), title_en: orNull(i.title_en) })),
      about_links: form.about_links.map((l) => ({ label: l.label, label_en: orNull(l.label_en), url: l.url })),
      officials: form.officials.map((o) => ({ name: o.name, position: o.position, image_url: orNull(o.image_url), about: orNull(o.about) })),
    }
    fill(await apiFetch(`/clubs/${clubId}/about`, { method: 'PUT', body })) // the server's normalised values
    saved.value = true
  } catch (err) {
    saveError.value =
      err.status === 422 ? 'יש שדה לא תקין (קישור או אורך טקסט)' : err.status === 403 ? 'אין הרשאה' : 'השמירה נכשלה, נסו שוב'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="space-y-6">
    <div v-if="loading" class="space-y-3" aria-busy="true">
      <div class="skeleton h-12" />
      <div class="skeleton h-40" />
    </div>
    <div v-else-if="loadError" class="space-y-3">
      <p class="error-text" role="alert">שגיאה בטעינת המועדון</p>
      <button type="button" class="btn-secondary" @click="load">נסו שוב</button>
    </div>
    <div v-else-if="!club" class="space-y-3">
      <p class="empty-state">המועדון לא נמצא</p>
      <RouterLink :to="{ name: 'admin-home' }" class="btn-secondary">לעמוד הניהול</RouterLink>
    </div>
    <p v-else-if="!allowed" class="empty-state">אין הרשאה לערוך מועדון זה</p>
    <template v-else>
      <div class="page-header">
        <h1 class="page-title">{{ club.name }}</h1>
        <RouterLink :to="'/clubs/' + teamSlug(club)" class="section-link">לעמוד המועדון</RouterLink>
      </div>
      <form class="card space-y-6" @submit.prevent="save">
        <fieldset class="space-y-3">
          <legend class="section-title">טקסט</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label for="club-about-title" class="field-label">כותרת</label>
              <input id="club-about-title" v-model="form.about_title" class="field-input" maxlength="200" />
            </div>
            <div>
              <label for="club-about-title-en" class="field-label">כותרת (אנגלית)</label>
              <input id="club-about-title-en" v-model="form.about_title_en" class="field-input" maxlength="200" dir="ltr" lang="en" />
            </div>
            <div>
              <label for="club-about" class="field-label">על המועדון</label>
              <textarea id="club-about" v-model="form.about" class="field-input" rows="6" maxlength="5000" />
              <p class="mt-1 text-sm text-muted">מוצג בעמוד המועדון. השאירו ריק כדי להסתיר.</p>
            </div>
            <div>
              <label for="club-about-en" class="field-label">על המועדון (אנגלית)</label>
              <textarea id="club-about-en" v-model="form.about_en" class="field-input" rows="6" maxlength="5000" dir="ltr" lang="en" />
            </div>
          </div>
        </fieldset>

        <ImageListEditor v-model="form.about_images" />

        <fieldset class="space-y-3">
          <legend class="section-title">קישורים</legend>
          <p v-if="!form.about_links.length" class="empty-state">אין קישורים</p>
          <div v-for="(link, i) in form.about_links" :key="i" class="grid items-end gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
            <div>
              <label :for="`link-label-${i}`" class="field-label">תווית קישור {{ i + 1 }}</label>
              <input :id="`link-label-${i}`" v-model="link.label" class="field-input" required maxlength="120" />
            </div>
            <div>
              <label :for="`link-label-en-${i}`" class="field-label">תווית קישור {{ i + 1 }} (אנגלית)</label>
              <input :id="`link-label-en-${i}`" v-model="link.label_en" class="field-input" maxlength="120" dir="ltr" lang="en" />
            </div>
            <div>
              <label :for="`link-url-${i}`" class="field-label">כתובת קישור {{ i + 1 }}</label>
              <input :id="`link-url-${i}`" v-model="link.url" type="url" class="field-input" required dir="ltr" />
            </div>
            <button type="button" class="btn-danger-ghost" :data-test="`remove-link-${i}`" :aria-label="`הסרת קישור ${i + 1}`" @click="form.about_links.splice(i, 1)">הסרה</button>
          </div>
          <button type="button" class="btn-secondary" data-test="add-link" @click="form.about_links.push({ label: '', label_en: '', url: '' })">הוספת קישור</button>
        </fieldset>

        <fieldset class="space-y-3">
          <legend class="section-title">בעלי תפקידים</legend>
          <p v-if="!form.officials.length" class="empty-state">אין בעלי תפקידים</p>
          <div v-for="(o, i) in form.officials" :key="i" class="space-y-2 rounded-xl border border-line p-3">
            <div class="grid gap-2 sm:grid-cols-2">
              <div>
                <label :for="`official-name-${i}`" class="field-label">שם בעל תפקיד {{ i + 1 }}</label>
                <input :id="`official-name-${i}`" v-model="o.name" class="field-input" required maxlength="120" />
              </div>
              <div>
                <label :for="`official-position-${i}`" class="field-label">תפקיד {{ i + 1 }}</label>
                <input :id="`official-position-${i}`" v-model="o.position" class="field-input" required maxlength="120" />
              </div>
              <div class="sm:col-span-2">
                <label :for="`official-about-${i}`" class="field-label">על בעל התפקיד {{ i + 1 }}</label>
                <textarea :id="`official-about-${i}`" v-model="o.about" class="field-input" rows="3" maxlength="5000" />
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <template v-if="o.image_url">
                <img :src="o.image_url" alt="" class="size-16 rounded-full object-cover" />
                <button type="button" class="btn-danger-ghost" @click="o.image_url = ''">הסרת תמונה</button>
              </template>
              <ImageUpload v-else :label="`תמונה לבעל תפקיד ${i + 1}`" @uploaded="(url) => (o.image_url = url)" />
            </div>
            <div class="flex flex-wrap gap-1">
              <button type="button" class="btn-ghost" :aria-label="`הזזה למעלה ${i + 1}`" :disabled="i === 0" @click="move(i, -1)">
                <AppIcon name="chevron" class="rotate-180" />
              </button>
              <button type="button" class="btn-ghost" :aria-label="`הזזה למטה ${i + 1}`" :disabled="i === form.officials.length - 1" @click="move(i, 1)">
                <AppIcon name="chevron" />
              </button>
              <button type="button" class="btn-danger-ghost" :data-test="`remove-official-${i}`" :aria-label="`הסרת בעל תפקיד ${i + 1}`" @click="form.officials.splice(i, 1)">הסרה</button>
            </div>
          </div>
          <button type="button" class="btn-secondary" data-test="add-official" @click="form.officials.push({ name: '', position: '', image_url: '', about: '' })">הוספת בעל תפקיד</button>
        </fieldset>

        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class="btn-primary" :disabled="saving">שמירה</button>
          <span aria-live="polite" class="text-sm text-muted">{{ saved ? 'נשמר' : '' }}</span>
          <p v-if="saveError" class="error-text" role="alert">{{ saveError }}</p>
        </div>
      </form>
    </template>
  </section>
</template>
