import { nextTick, ref, watch } from 'vue'

// Edit-toggle for an inline editor (#499): closing reloads the read-only data and returns focus to the toggle,
// and losing edit rights (player preview, team switch) closes it.
export function useInlineEditor(canEdit, onClose) {
  const editing = ref(false)
  const toggleEl = ref(null)

  async function close() {
    editing.value = false
    onClose?.()
    await nextTick()
    toggleEl.value?.focus()
  }

  function toggle() {
    if (editing.value) close()
    else editing.value = true
  }

  watch(canEdit, (can) => {
    if (!can && editing.value) close()
  })

  return { editing, toggleEl, toggle }
}
