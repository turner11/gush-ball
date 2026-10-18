import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import FilterCombobox from './FilterCombobox.vue'

const OPTIONS = [
  { value: 'a', label: 'אלפא' },
  { value: 'b', label: 'בטא' },
]
const body = () => new DOMWrapper(document.body)
const mountBox = (props = {}) =>
  mount(FilterCombobox, { props: { id: 'f', label: 'ליגה', options: OPTIONS, ...props }, attachTo: document.body })
async function open(wrapper) {
  await wrapper.find('#f').trigger('click')
  await flushPromises()
}
const items = () => body().findAll('[role=option]').map((o) => o.text().trim())

describe('FilterCombobox', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = () => {} // jsdom lacks it; reka scrolls the highlighted item
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows the all label when empty and the option label when set', async () => {
    const wrapper = mountBox({ allLabel: 'כל הליגות', modelValue: '' })
    expect(wrapper.find('#f').text()).toBe('כל הליגות')
    await wrapper.setProps({ modelValue: 'b' })
    expect(wrapper.find('#f').text()).toBe('בטא')
  })

  it('typing in the inner search filters the options', async () => {
    const wrapper = mountBox({ allLabel: 'כל הליגות' })
    await open(wrapper)
    expect(items()).toEqual(['כל הליגות', 'אלפא', 'בטא'])

    const input = body().find('input')
    await input.setValue('בט')
    await flushPromises()
    expect(items()).toEqual(['בטא'])

    await input.setValue('zzz')
    await flushPromises()
    expect(items()).toEqual([])
    expect(body().text()).toContain('אין תוצאות')
  })

  it('picking an option emits its value; picking the all option emits an empty string', async () => {
    const wrapper = mountBox({ allLabel: 'כל הליגות', modelValue: 'a' })
    await open(wrapper)
    await body().findAll('[role=option]').find((o) => o.text().includes('בטא')).trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['b'])

    await open(wrapper)
    await body().findAll('[role=option]').find((o) => o.text().includes('כל הליגות')).trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([''])
  })

  it('without allLabel there is no all option', async () => {
    const wrapper = mountBox({ modelValue: 'a' })
    await open(wrapper)
    expect(items()).toEqual(['אלפא', 'בטא'])
  })
})
