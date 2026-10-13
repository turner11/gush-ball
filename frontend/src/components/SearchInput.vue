<script setup>
import { ref } from 'vue'

defineProps({ id: { type: String, required: true }, label: { type: String, required: true } })
const query = defineModel({ type: String, default: '' })
const input = ref(null)
defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div>
    <label :for="id" class="sr-only">{{ label }}</label>
    <input
      :id="id"
      ref="input"
      v-model="query"
      type="search"
      :placeholder="label + '…'"
      autocomplete="off"
      enterkeyhint="search"
      class="field-input mt-0"
    />
  </div>
</template>
