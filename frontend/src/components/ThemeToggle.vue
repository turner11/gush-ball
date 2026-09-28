<script setup>
import { useTheme } from '../composables/useTheme'

const { theme, toggle } = useTheme()
</script>

<template>
  <button
    type="button"
    class="rounded-full border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-600"
    :aria-label="theme === 'dark' ? 'עבור למצב בהיר' : 'עבור למצב כהה'"
    @click="toggle"
  >
    {{ theme === 'dark' ? '☀️' : '🌙' }}
  </button>
</template>
