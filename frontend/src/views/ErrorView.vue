<script setup>
defineProps({
  message: { type: String, default: '' },
})
</script>

<template>
  <section class="flex flex-col items-center gap-4 py-24 text-center">
    <span class="text-7xl font-black tracking-tight text-neutral-300 dark:text-neutral-700">500</span>
    <h1 class="text-xl font-bold">משהו השתבש</h1>
    <p class="text-neutral-600 dark:text-neutral-400">{{ message || 'אירעה שגיאה לא צפויה.' }}</p>
    <button type="button" class="btn-primary" @click="() => location.reload()">
      רענון העמוד
    </button>
  </section>
</template>
