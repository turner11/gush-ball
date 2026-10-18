<script setup>
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui'
import { computed } from 'vue'

import AppIcon from './AppIcon.vue'

// A searchable single select. '' means "all" (shown as `allLabel`); reka forbids an empty item value, hence the sentinel.
const ALL = '__all__'

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  options: { type: Array, required: true }, // [{ value, label }]
  allLabel: { type: String, default: null },
  disabled: { type: Boolean, default: false },
})
const model = defineModel({ type: String, default: '' })

const selected = computed({
  get: () => model.value || (props.allLabel ? ALL : ''),
  set: (value) => (model.value = value === ALL ? '' : value),
})
const triggerText = computed(() => props.options.find((o) => o.value === model.value)?.label ?? props.allLabel ?? '')
</script>

<template>
  <div>
    <span :id="`${id}-label`" class="field-label">{{ label }}</span>
    <ComboboxRoot v-model="selected" :disabled="disabled" dir="rtl">
      <ComboboxAnchor as-child>
        <ComboboxTrigger as-child>
          <button
            :id="id"
            type="button"
            :aria-labelledby="`${id}-label ${id}`"
            class="field-input flex items-center justify-between gap-2 text-start"
            :disabled="disabled"
          >
            <span class="truncate">{{ triggerText }}</span>
            <AppIcon name="chevron" />
          </button>
        </ComboboxTrigger>
      </ComboboxAnchor>
      <ComboboxPortal>
        <ComboboxContent
          position="popper"
          :side-offset="4"
          class="menu-content w-[var(--reka-combobox-trigger-width)] max-h-[min(20rem,var(--reka-combobox-content-available-height))] overflow-y-auto"
        >
          <ComboboxInput class="field-input mb-1" placeholder="חיפוש…" :aria-label="`חיפוש ${label}`" />
          <ComboboxViewport>
            <ComboboxEmpty class="px-3 py-2 text-sm text-muted">אין תוצאות</ComboboxEmpty>
            <template v-if="allLabel">
              <ComboboxItem :value="ALL" :text-value="allLabel" class="menu-item">
                <span class="truncate">{{ allLabel }}</span>
                <ComboboxItemIndicator class="ms-auto"><AppIcon name="check" /></ComboboxItemIndicator>
              </ComboboxItem>
              <ComboboxSeparator class="my-1 h-px bg-line" />
            </template>
            <ComboboxItem v-for="o in options" :key="o.value" :value="o.value" :text-value="o.label" class="menu-item">
              <span class="truncate">{{ o.label }}</span>
              <ComboboxItemIndicator class="ms-auto"><AppIcon name="check" /></ComboboxItemIndicator>
            </ComboboxItem>
          </ComboboxViewport>
        </ComboboxContent>
      </ComboboxPortal>
    </ComboboxRoot>
  </div>
</template>
