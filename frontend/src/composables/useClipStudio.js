import { computed, reactive, ref } from 'vue'

import { apiFetch } from '../lib/api'

const FIELDS = ['game_id', 'source_url', 'start', 'end', 'section', 'note', 'is_highlight', 'in_game_briefing', 'in_player_briefing', 'player_ids']
const BLANK = { source_url: null, start: null, end: null, section: null, note: null, is_highlight: false, in_game_briefing: false, in_player_briefing: false, player_ids: [] }

const ERRORS = { 422: 'ערך לא תקין', 403: 'אין הרשאה' }
const errorText = (e) => ERRORS[e.status] ?? 'השמירה נכשלה'

// The video studio's clips (#682): every clip of the team (for section suggestions), this game's ones listed (gameId null: the game-less ones, P only).
// Each clip saves on its own: one request at a time per clip, the latest state re-sent when it returns.
export function useClipStudio(teamId, gameId) {
  const all = ref([])
  const selectedUid = ref(null)
  const lastDeleted = ref(null) // the fields of the clip just deleted, for undo
  const inflight = new Map() // uid -> the clip's running save, so a delete can wait for its POST
  let nextUid = 1

  const clips = computed(() => all.value.filter((c) => c.game_id === gameId.value).sort((a, b) => (b.id ?? Infinity) - (a.id ?? Infinity)))
  const selected = computed(() => all.value.find((c) => c.uid === selectedUid.value) ?? null)
  const sections = computed(() => [...new Set(all.value.map((c) => c.section).filter(Boolean))].sort())

  const wrap = (fields) => reactive({ uid: nextUid++, id: null, ...BLANK, ...fields, status: 'saved', error: null })
  const body = (clip) => ({ ...Object.fromEntries(FIELDS.map((f) => [f, clip[f]])), section: clip.section || null, note: clip.note || null })

  async function load() {
    const rows = await apiFetch(`/teams/${teamId.value}/clips`)
    all.value = rows.map((row) => wrap(row))
    selectedUid.value = clips.value[0]?.uid ?? null // the newest clip of this game
  }

  async function saveLoop(clip) {
    try {
      do {
        clip.again = false
        if (clip.id === null) clip.id = (await apiFetch(`/teams/${teamId.value}/clips`, { method: 'POST', body: body(clip) })).id
        else await apiFetch(`/teams/${teamId.value}/clips/${clip.id}`, { method: 'PATCH', body: body(clip) })
      } while (clip.again)
      clip.status = 'saved'
      clip.error = null
    } catch (e) {
      clip.status = 'error'
      clip.error = errorText(e)
    } finally {
      inflight.delete(clip.uid)
    }
  }

  function save(clip) {
    if (inflight.has(clip.uid)) {
      clip.again = true
      return inflight.get(clip.uid)
    }
    clip.status = 'saving'
    const running = saveLoop(clip)
    inflight.set(clip.uid, running)
    return running
  }

  function add(fields) {
    const clip = wrap({ game_id: gameId.value, in_player_briefing: gameId.value === null, ...fields })
    all.value.push(clip)
    selectedUid.value = clip.uid
    save(clip)
    return clip
  }

  function change(clip, patch) {
    Object.assign(clip, patch)
    return save(clip)
  }

  async function remove(clip) {
    all.value = all.value.filter((c) => c.uid !== clip.uid)
    if (selectedUid.value === clip.uid) selectedUid.value = null
    lastDeleted.value = Object.fromEntries(FIELDS.map((f) => [f, clip[f]]))
    await inflight.get(clip.uid) // a clip still being created gets its id first
    if (clip.id === null) return
    try {
      await apiFetch(`/teams/${teamId.value}/clips/${clip.id}`, { method: 'DELETE' })
    } catch (e) {
      clip.status = 'error'
      clip.error = 'המחיקה נכשלה'
      all.value.push(clip)
      lastDeleted.value = null
    }
  }

  function undo() {
    if (!lastDeleted.value) return
    const fields = lastDeleted.value
    lastDeleted.value = null
    add(fields)
  }

  return { clips, selected, sections, load, add, change, remove, undo, lastDeleted, select: (clip) => (selectedUid.value = clip.uid) }
}
