<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AdminLayout from './layouts/AdminLayout.vue'
import DefaultLayout from './layouts/DefaultLayout.vue'

const route = useRoute()
const layout = computed(() => (route.meta.layout === 'admin' ? AdminLayout : DefaultLayout))
</script>

<template>
  <component :is="layout" />
</template>
