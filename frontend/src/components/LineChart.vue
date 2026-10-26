<script setup>
import { computed } from 'vue'

// Presentational line chart. labels: x categories, oldest first. series: [{ key, name, values: (number|null)[], emphasis }].
// RTL: time flows right to left, so the oldest point sits at the inline-start (right) edge.
const props = defineProps({
  labels: { type: Array, required: true },
  series: { type: Array, required: true },
  ariaLabel: { type: String, required: true },
  // 'W' | 'L' | null per label: draws a win/loss connector between series[0] and series[1] at that point.
  outcomes: { type: Array, default: () => [] },
})

const W = 640
const H = 240
const PAD = { start: 44, end: 36, top: 16, bottom: 36 } // start = right in RTL, where the y labels sit; under dir=rtl SVG "end" extends rightwards from x
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

const OUTCOME_LABEL = { W: 'ניצחון', L: 'הפסד' }
const connectors = computed(() => {
  const [a, b] = props.series
  return props.outcomes.flatMap((o, i) => (o && a?.values[i] != null && b?.values[i] != null ? [{ i, x: x(i), y1: y(a.values[i]), y2: y(b.values[i]), cls: o === 'W' ? 'text-win' : 'text-loss' }] : []))
})
</script>

<template>
  <div>
    <svg :viewBox="`0 0 ${W} ${H}`" class="h-auto w-full" role="img" :aria-label="ariaLabel">
      <g class="text-line" stroke="currentColor" stroke-width="1">
        <line v-for="g in gridlines" :key="g" :x1="PAD.end" :x2="W - PAD.start" :y1="y(g)" :y2="y(g)" />
      </g>
      <g class="fill-current text-muted" font-size="20" text-anchor="end">
        <text v-for="g in gridlines" :key="g" :x="W - PAD.start + 8" :y="y(g) + 7">{{ g }}</text>
      </g>
      <g class="fill-current text-muted" font-size="20" text-anchor="middle">
        <text v-for="i in shownLabels" :key="i" :x="x(i)" :y="H - 8">{{ labels[i] }}</text>
      </g>
      <line v-for="c in connectors" :key="c.i" :class="c.cls" :x1="c.x" :x2="c.x" :y1="c.y1" :y2="c.y2" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.5" />
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
