import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PlayerTagsInput from './PlayerTagsInput.vue'

const PLAYERS = [
  { id: 5, name: 'דני', jersey_number: 7 },
  { id: 6, name: 'רון', jersey_number: 9 },
]

async function mountInput(modelValue) {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: async () => PLAYERS }),
  )
  const wrapper = mount(PlayerTagsInput, { props: { teamId: 1, modelValue } })
  await flushPromises()
  return wrapper
}

describe('PlayerTagsInput', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('emits the id when a player name is entered, and clears the input', async () => {
    const wrapper = await mountInput([])
    const input = wrapper.get('input')
    await input.setValue('דני')
    await input.trigger('change')
    expect(wrapper.emitted('update:modelValue')[0][0]).toEqual([5])
    expect(input.element.value).toBe('')
  })

  it('shows chips, omits tagged players from the datalist, removes on click', async () => {
    const wrapper = await mountInput([5])
    expect(wrapper.text()).toContain('דני')
    const options = wrapper.findAll('option').map((o) => o.attributes('value'))
    expect(options).toEqual(['רון'])
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')[0][0]).toEqual([])
  })

  it('ignores names that match no player', async () => {
    const wrapper = await mountInput([])
    await wrapper.get('input').setValue('nobody')
    await wrapper.get('input').trigger('change')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
