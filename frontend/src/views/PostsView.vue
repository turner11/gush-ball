<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import LoadError from '../components/LoadError.vue'
import PostCard from '../components/PostCard.vue'
import TeamContentSection from '../components/TeamContentSection.vue'
import { canEditTeam } from '../composables/useAuth'
import { useInlineEditor } from '../composables/useInlineEditor'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { CONTENT_SECTIONS } from '../lib/teamContent'

const posts = ref([])
const loading = ref(false)
const loadError = ref(false)
const route = useRoute()

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

async function load() {
  loadError.value = false
  if (!selectedTeamId.value) {
    posts.value = []
    return
  }
  const id = selectedTeamId.value
  loading.value = true
  try {
    const p = await apiFetch(`/teams/${id}/posts`)
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    posts.value = p
  } catch {
    if (id === selectedTeamId.value) loadError.value = true
  } finally {
    if (id === selectedTeamId.value) loading.value = false
  }
  await revealHashTarget()
}

// The router's scrollBehavior runs before the posts have loaded, so scroll to the #post-<id> card here.
async function revealHashTarget() {
  await nextTick()
  if (route.hash) document.getElementById(route.hash.slice(1))?.scrollIntoView({ block: 'start' })
}

watch(selectedTeamId, load, { immediate: true })

const canEdit = computed(() => !!selectedTeamId.value && canEditTeam(selectedTeamId.value))
const { editing, toggleEl: editToggle, toggle: toggleEditing } = useInlineEditor(canEdit, load) // closing shows what the editor changed
</script>

<template>
  <section class="space-y-6">
    <div class="page-header">
      <h1 class="page-title">עדכונים</h1>
      <button v-if="canEdit && !loadError" ref="editToggle" type="button" class="btn-secondary" :aria-expanded="editing" @click="toggleEditing">
        {{ editing ? 'סיום עריכה' : 'עריכת עדכונים' }}
      </button>
    </div>

    <LoadError v-if="loadError" message="שגיאה בטעינת העדכונים" @retry="load" />
    <TeamContentSection v-else-if="editing" :key="selectedTeamId" :owner-id="selectedTeamId" v-bind="CONTENT_SECTIONS.teamPosts" heading="" />
    <div v-else-if="loading" class="skeleton h-32" aria-busy="true" />
    <div v-else-if="posts.length" class="space-y-6">
      <PostCard v-for="post in posts" :key="post.id" :post="post" :level="2" />
    </div>
    <p v-else class="empty-state">אין עדכונים עדיין.</p>
  </section>
</template>
