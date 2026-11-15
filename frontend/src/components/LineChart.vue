<script setup>
import { computed, ref, watch } from 'vue'

// Presentational line chart. labels: x categories, oldest first. series: [{ key, name, values: (number|null)[], emphasis }].
// selectable: lines get a wide hover/click hit area (native <title> tooltip = series name) and click emits select(key).
// Hover, tap or arrow keys pick the nearest game and show an HTML tooltip with its date and each non-muted series value.
// ponytail: a one-point line has no hit area.
// Always LTR whatever the page language (#625): oldest point on the left, y labels on the left.
const props = defineProps({
  labels: { type: Array, required: true },
  series: { type: Array, required: true },
  ariaLabel: { type: String, required: true },
  // 'W' | 'L' | null per label: draws a win/loss connector between series[0] and series[1] at that point.
  outcomes: { type: Array, default: () => [] },
  selectable: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])

const W = 640
const H = 240
const PAD = { left: 44, right: 36, top: 16, bottom: 36 } // left gutter holds the y labels
const TICKS = 4
const STYLE = {
  primary: { cls: 'text-team', width: 3, dash: null },
  secondary: { cls: 'text-muted', width: 2.5, dash: '8 6' },
  muted: { cls: 'text-line', width: 1.5, dash: null },
}

const top = computed(() => Math.max(TICKS, Math.ceil(Math.max(0, ...props.series.flatMap((s) => s.values.filter((v) => v != null))) / TICKS) * TICKS))
const x = (i) => PAD.left + (props.labels.length < 2 ? 0 : (i * (W - PAD.left - PAD.right)) / (props.labels.length - 1))
const y = (v) => PAD.top + (1 - v / top.value) * (H - PAD.top - PAD.bottom)
const gridlines = computed(() => Array.from({ length: TICKS + 1 }, (_, i) => (top.value * i) / TICKS))
// first, last and (with room) the middle label, so nothing collides on a phone
const shownLabels = computed(() => {
  const last = props.labels.length - 1
  return [0, ...(last >= 4 ? [Math.round(last / 2)] : []), ...(last > 0 ? [last] : [])]
})

const lines = computed(() =>
  props.series.map((s) => {
    const points = s.values.map((v, i) => (v == null ? null : { v, i, x: x(i), y: y(v) })).filter(Boolean)
    return { ...s, ...STYLE[s.emphasis ?? 'primary'], points, path: points.map((p) => `${p.x},${p.y}`).join(' ') }
  }),
)

const OUTCOME_LABEL = { W: 'ניצחון', L: 'הפסד' }

const active = ref(null) // column index under the pointer / keyboard cursor
watch(() => props.labels.length, () => (active.value = null))
const last = computed(() => props.labels.length - 1)
const clamp = (i) => Math.min(Math.max(i, 0), last.value)
// the svg is w-full h-auto, so its box maps 1:1 onto the viewBox
const nearestIndex = (clientX, box) => {
  if (props.labels.length < 2) return 0
  const step = (W - PAD.left - PAD.right) / last.value
  return clamp(Math.round((((clientX - box.left) / box.width) * W - PAD.left) / step))
}
const point = (e) => (active.value = nearestIndex(e.clientX, e.currentTarget.getBoundingClientRect()))
// touch fires pointerleave right after the tap; only a mouse leaving should hide the tooltip
const leave = (e) => e.pointerType === 'mouse' && (active.value = null)
const KEY_STEP = { ArrowRight: 1, ArrowLeft: -1 }
const onKey = (e) => {
  if (e.key === 'Escape') active.value = null
  else if (e.key === 'Home') active.value = 0
  else if (e.key === 'End') active.value = last.value
  else if (e.key in KEY_STEP) active.value = clamp((active.value ?? last.value) + KEY_STEP[e.key])
  else return
  e.preventDefault()
}
const tip = computed(() => {
  const i = active.value
  if (i == null) return null
  const o = props.outcomes[i]
  return {
    left: `${(x(i) / W) * 100}%`,
    right: x(i) > W / 2,
    heading: props.labels[i],
    outcome: OUTCOME_LABEL[o],
    outcomeCls: o === 'W' ? 'text-win' : 'text-loss',
    rows: lines.value.filter((l) => l.emphasis !== 'muted').map((l) => ({ key: l.key, name: l.name, v: l.values[i] ?? '—' })),
  }
})
const connectors = computed(() => {
  const [a, b] = props.series
  return props.outcomes.flatMap((o, i) => (o && a?.values[i] != null && b?.values[i] != null ? [{ i, x: x(i), y1: y(a.values[i]), y2: y(b.values[i]), cls: o === 'W' ? 'text-win' : 'text-loss' }] : []))
})
</script>

<template>
  <div>
    <div class="relative">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        class="h-auto w-full"
        role="img"
        :aria-label="ariaLabel"
        tabindex="0"
        @pointermove="point"
        @pointerdown="point"
        @pointerleave="leave"
        @focus="active ??= last"
        @blur="active = null"
        @keydown="onKey"
      >
        <g class="text-line" stroke="currentColor" stroke-width="1">
          <line v-for="g in gridlines" :key="g" :x1="PAD.left" :x2="W - PAD.right" :y1="y(g)" :y2="y(g)" />
        </g>
        <g class="fill-current text-muted" font-size="20" text-anchor="end" direction="ltr">
          <text v-for="g in gridlines" :key="g" :x="PAD.left - 8" :y="y(g) + 7">{{ g }}</text>
        </g>
        <g class="fill-current text-muted" font-size="20" text-anchor="middle">
          <text v-for="i in shownLabels" :key="i" :x="x(i)" :y="H - 8">{{ labels[i] }}</text>
        </g>
        <line v-if="active != null" class="text-muted" :x1="x(active)" :x2="x(active)" :y1="PAD.top" :y2="H - PAD.bottom" stroke="currentColor" stroke-width="1" />
        <line v-for="c in connectors" :key="c.i" :class="c.cls" :x1="c.x" :x2="c.x" :y1="c.y1" :y2="c.y2" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
        <g
          v-for="l in lines"
          :key="l.key"
          :class="[l.cls, selectable && 'group cursor-pointer']"
          fill="none"
          stroke="currentColor"
          @click="selectable && emit('select', l.key)"
        >
          <polyline :class="[l.cls, selectable && l.emphasis === 'muted' && 'group-hover:text-muted']" :points="l.path" :stroke-width="l.width" :stroke-dasharray="l.dash" stroke-linejoin="round" stroke-linecap="round" />
          <polyline v-if="selectable" data-hit :points="l.path" stroke="transparent" stroke-width="24" pointer-events="stroke">
            <title>{{ l.name }}</title>
          </polyline>
          <template v-if="l.emphasis !== 'muted'">
            <circle v-for="p in l.points" :key="p.i" :cx="p.x" :cy="p.y" fill="currentColor" stroke="none" :r="p.i === active ? 8 : 5" />
          </template>
        </g>
      </svg>
      <!-- ponytail: `left` is physical on purpose, the chart geometry is LTR (#625); the side offset is the whole collision logic. -->
      <div
        v-if="tip"
        data-tooltip
        aria-hidden="true"
        class="pointer-events-none absolute top-0 rounded-lg border border-line bg-raised px-3 py-2 text-sm max-w-[50%] whitespace-nowrap shadow-card"
        :style="{ left: tip.left, transform: tip.right ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }"
      >
        <div class="truncate font-bold text-ink">
          {{ tip.heading }}<span v-if="tip.outcome" :class="tip.outcomeCls"> · {{ tip.outcome }}</span>
        </div>
        <div v-for="r in tip.rows" :key="r.key" class="truncate text-muted">
          {{ r.name }} <span class="font-black tabular-nums text-ink">{{ r.v }}</span>
        </div>
      </div>
    </div>
    <table class="sr-only">
      <caption>{{ ariaLabel }}</caption>
      <thead>
        <tr>
          <th scope="col">משחק</th>
          <th v-for="s in series" :key="s.key" scope="col">{{ s.name }}</th>
          <th v-if="outcomes.length" scope="col">תוצאה</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(label, i) in labels" :key="i">
          <th scope="row">{{ label }}</th>
          <td v-for="s in series" :key="s.key">{{ s.values[i] ?? '' }}</td>
          <td v-if="outcomes.length">{{ OUTCOME_LABEL[outcomes[i]] ?? '' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
