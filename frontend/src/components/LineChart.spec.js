import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import LineChart from './LineChart.vue'

const props = {
  labels: ['01.03', '08.03', '15.03'],
  series: [
    { key: 'a', name: 'נקודות', values: [10, 20, 15], emphasis: 'primary' },
    { key: 'b', name: 'יריבה', values: [5, null, 25], emphasis: 'secondary' },
  ],
  ariaLabel: 'נקודות לאורך העונה',
}

describe('LineChart', () => {
  it('renders one polyline per series and an sr-only table with every value', () => {
    const wrapper = mount(LineChart, { props })
    expect(wrapper.find('svg').attributes('aria-label')).toBe('נקודות לאורך העונה')
    expect(wrapper.findAll('polyline')).toHaveLength(2)
    const table = wrapper.find('table.sr-only')
    expect(table.findAll('tbody tr')).toHaveLength(3)
    for (const v of ['10', '20', '15', '25']) expect(table.text()).toContain(v)
    expect(table.text()).toContain('01.03')
  })

  it('draws time left to right: oldest point has the smallest x, y labels sit left of it', () => {
    const wrapper = mount(LineChart, { props })
    const xs = wrapper.findAll('polyline')[0].attributes('points').split(' ').map((p) => Number(p.split(',')[0]))
    expect(xs).toHaveLength(3)
    expect(xs[0]).toBeLessThan(xs[1])
    expect(xs[1]).toBeLessThan(xs[2])
    const tickGroup = wrapper.find('g[direction="ltr"]')
    expect(tickGroup.exists()).toBe(true)
    for (const t of tickGroup.findAll('text')) expect(Number(t.attributes('x'))).toBeLessThan(xs[0])
  })

  it('draws a win/loss connector per outcome that has both values', () => {
    const wrapper = mount(LineChart, { props: { ...props, outcomes: ['W', null, 'L'] } })
    expect(wrapper.findAll('line.text-win')).toHaveLength(1)
    expect(wrapper.findAll('line.text-loss')).toHaveLength(1)
    expect(wrapper.find('table.sr-only').text()).toContain('ניצחון')
    expect(wrapper.find('table.sr-only').text()).toContain('הפסד')
  })

  it('draws no connectors and no outcome column without outcomes', () => {
    const wrapper = mount(LineChart, { props })
    expect(wrapper.findAll('line.text-win, line.text-loss')).toHaveLength(0)
    expect(wrapper.find('table.sr-only').text()).not.toContain('תוצאה')
  })

  it('selectable: each line gets a hit area titled with its series name', () => {
    const wrapper = mount(LineChart, { props: { ...props, selectable: true } })
    const hits = wrapper.findAll('polyline[data-hit]')
    expect(hits.map((h) => h.find('title').text())).toEqual(['נקודות', 'יריבה'])
  })

  it('selectable: clicking a line emits select with its key', async () => {
    const wrapper = mount(LineChart, { props: { ...props, selectable: true } })
    await wrapper.findAll('polyline[data-hit]')[1].trigger('click')
    expect(wrapper.emitted('select')).toEqual([['b']])
  })

  const mountBox = (extra = {}) => {
    const wrapper = mount(LineChart, { props: { ...props, ...extra } })
    wrapper.find('svg').element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 240 })
    return wrapper
  }
  const tip = (w) => w.find('[data-tooltip]')

  it('pointer over the chart shows a tooltip with the date and each series value at the nearest point', async () => {
    const wrapper = mountBox()
    expect(tip(wrapper).exists()).toBe(false)
    await wrapper.find('svg').trigger('pointermove', { clientX: 330 })
    for (const t of ['08.03', 'נקודות', '20', 'יריבה', '—']) expect(tip(wrapper).text()).toContain(t)
    expect(wrapper.findAll('circle[r="8"]')).toHaveLength(1)
  })

  it('mouse leave hides the tooltip; a touch leave keeps it', async () => {
    const wrapper = mountBox()
    const svg = wrapper.find('svg')
    await svg.trigger('pointerdown', { clientX: 330, pointerType: 'touch' })
    await svg.trigger('pointerleave', { pointerType: 'touch' })
    expect(tip(wrapper).exists()).toBe(true)
    await svg.trigger('pointerleave', { pointerType: 'mouse' })
    expect(tip(wrapper).exists()).toBe(false)
  })

  it('keyboard: focus shows the latest point, arrows move, Escape hides', async () => {
    const wrapper = mountBox()
    const svg = wrapper.find('svg')
    await svg.trigger('focus')
    expect(tip(wrapper).text()).toContain('15.03')
    expect(tip(wrapper).text()).toContain('15')
    await svg.trigger('keydown', { key: 'ArrowRight' })
    expect(tip(wrapper).text()).toContain('15.03')
    await svg.trigger('keydown', { key: 'ArrowLeft' })
    expect(tip(wrapper).text()).toContain('08.03')
    await svg.trigger('keydown', { key: 'Escape' })
    expect(tip(wrapper).exists()).toBe(false)
  })

  it('outcomes appear in the tooltip heading; muted series stay out', async () => {
    const wrapper = mountBox({
      outcomes: ['W', null, 'L'],
      series: [props.series[0], { ...props.series[1], emphasis: 'muted' }],
    })
    await wrapper.find('svg').trigger('focus')
    expect(tip(wrapper).text()).toContain('הפסד')
    expect(tip(wrapper).text()).not.toContain('יריבה')
  })

  it('not selectable by default: no hit areas', () => {
    const wrapper = mount(LineChart, { props })
    expect(wrapper.find('polyline[data-hit]').exists()).toBe(false)
    expect(wrapper.find('.cursor-pointer').exists()).toBe(false)
  })
})
