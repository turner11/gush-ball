<script setup>
import { computed } from 'vue'

// The studio's keyboard map and moment window (#683). Pure view: the studio owns the values.
const props = defineProps({ withGame: { type: Boolean, required: true } })
const before = defineModel('before', { required: true })
const after = defineModel('after', { required: true })

const KEYS = [
  { keys: 'Space', label: 'ניגון / השהיה' },
  { keys: '← / →', label: '10 שניות אחורה / קדימה' },
  { keys: '< / >', label: '3 שניות אחורה / קדימה' },
  { keys: '- / +', label: 'האטה / האצה של הניגון' },
  { keys: 'M', label: 'סימון רגע' },
  { keys: 'I / O', label: 'התחלה / סוף בזמן הנוכחי' },
  { keys: 'R', label: 'תצוגה מקדימה של הקטע' },
  { keys: '[ ]', label: 'כוונון התחלה בשנייה' },
  { keys: 'Shift+[ ]', label: 'כוונון סוף בשנייה' },
  { keys: '0-9 ו-Enter', label: 'תיוג שחקן לפי מספר חולצה' },
  { keys: 'Esc', label: 'ניקוי מספר' },
  { keys: 'H', label: 'היילייטס', needsGame: true },
  { keys: 'B', label: 'תדריך משחק', needsGame: true },
  { keys: 'P', label: 'תדריך שחקן' },
  { keys: 'A', label: 'היילייט אישי (דורש שחקן מתויג)' },
  { keys: 'S', label: 'פרק' },
  { keys: 'Delete', label: 'מחיקת הקטע' },
  { keys: '?', label: 'הצגה / הסתרה של הקיצורים' },
]
const rows = computed(() => KEYS.filter((k) => props.withGame || !k.needsGame))
</script>

<template>
  <section id="studio-shortcuts" class="card space-y-3" aria-labelledby="studio-shortcuts-title">
    <h2 id="studio-shortcuts-title" class="section-title">קיצורי מקלדת</h2>
    <dl class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-sm">
      <template v-for="k in rows" :key="k.keys">
        <dt dir="ltr"><kbd class="kbd">{{ k.keys }}</kbd></dt>
        <dd>{{ k.label }}</dd>
      </template>
    </dl>
    <p class="text-sm text-muted">הקיצורים פועלים כשהפוקוס מחוץ לנגן: לחצו על הדף ליד הנגן אם הם נעצרו.</p>
    <div class="flex flex-wrap gap-3">
      <div>
        <label for="studio-before" class="field-label">שניות לפני הרגע</label>
        <input id="studio-before" v-model.number="before" class="field-input w-20" type="number" min="0" max="60" step="1" inputmode="numeric" dir="ltr" />
      </div>
      <div>
        <label for="studio-after" class="field-label">שניות אחרי הרגע</label>
        <input id="studio-after" v-model.number="after" class="field-input w-20" type="number" min="1" max="60" step="1" inputmode="numeric" dir="ltr" />
      </div>
    </div>
  </section>
</template>
