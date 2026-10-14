<script setup>
import { useTheme } from '../composables/useTheme'
import AppIcon from './AppIcon.vue'

const { theme, toggle } = useTheme()
</script>

<template>
  <button
    type="button"
    class="btn-icon"
    :aria-label="theme === 'dark' ? 'עבור למצב בהיר' : 'עבור למצב כהה'"
    @click="toggle"
  >
    <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" />
  </button>
</template>
