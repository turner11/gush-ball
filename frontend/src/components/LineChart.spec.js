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

  it('oldest label sits at the inline-start (largest x)', () => {
    const wrapper = mount(LineChart, { props })
    const xs = wrapper.findAll('polyline')[0].attributes('points').split(' ').map((p) => Number(p.split(',')[0]))
    expect(xs).toHaveLength(3)
    expect(xs[0]).toBeGreaterThan(xs[1])
    expect(xs[1]).toBeGreaterThan(xs[2])
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
})
