<script setup>
import { computed } from 'vue'

// Presentational line chart. labels: x categories, oldest first. series: [{ key, name, values: (number|null)[], emphasis }].
// RTL: time flows right to left, so the oldest point sits at the inline-start (right) edge.
const props = defineProps({
  labels: { type: Array, required: true },
  series: { type: Array, required: true },
  ariaLabel: { type: String, required: true },
})

const W = 640
const H = 240
const PAD = { start: 44, end: 16, top: 16, bottom: 36 } // start = right in RTL, where the y labels sit
const TICKS = 4
const STYLE = {
  primary: { cls: 'text-team', width: 3, dash: null },
  secondary: { cls: 'text-muted', width: 2.5, dash: '8 6' },
  muted: { cls: 'text-line', width: 1.5, dash: null },
}

const top = computed(() => Math.max(TICKS, Math.ceil(Math.max(0, ...props.series.flatMap((s) => s.values.filter((v) => v != null))) / TICKS) * TICKS))
const x = (i) => W - PAD.start - (props.labels.length < 2 ? 0 : (i * (W - PAD.start - PAD.end)) / (props.labels.length - 1))
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
</script>

<template>
  <div>
    <svg :viewBox="`0 0 ${W} ${H}`" class="h-auto w-full" role="img" :aria-label="ariaLabel">
      <g class="text-line" stroke="currentColor" stroke-width="1">
        <line v-for="g in gridlines" :key="g" :x1="PAD.end" :x2="W - PAD.start" :y1="y(g)" :y2="y(g)" />
      </g>
      <g class="fill-current text-muted" font-size="20" text-anchor="start">
        <text v-for="g in gridlines" :key="g" :x="W - PAD.start + 8" :y="y(g) + 7">{{ g }}</text>
      </g>
      <g class="fill-current text-muted" font-size="20" text-anchor="middle">
        <text v-for="i in shownLabels" :key="i" :x="x(i)" :y="H - 8">{{ labels[i] }}</text>
      </g>
      <g v-for="l in lines" :key="l.key" :class="l.cls" fill="none" stroke="currentColor">
        <polyline :class="l.cls" :points="l.path" :stroke-width="l.width" :stroke-dasharray="l.dash" stroke-linejoin="round" stroke-linecap="round" />
        <template v-if="l.emphasis !== 'muted'">
          <circle v-for="p in l.points" :key="p.i" :cx="p.x" :cy="p.y" r="5" fill="currentColor" stroke="none">
            <title>{{ l.name }} · {{ labels[p.i] }} · {{ p.v }}</title>
          </circle>
        </template>
      </g>
    </svg>
    <table class="sr-only">
      <caption>{{ ariaLabel }}</caption>
      <thead>
        <tr>
          <th scope="col">משחק</th>
          <th v-for="s in series" :key="s.key" scope="col">{{ s.name }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(label, i) in labels" :key="i">
          <th scope="row">{{ label }}</th>
          <td v-for="s in series" :key="s.key">{{ s.values[i] ?? '' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
