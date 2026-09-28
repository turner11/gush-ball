import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ConfirmDialog from './ConfirmDialog.vue'

describe('ConfirmDialog', () => {
  it('renders the message and does not call onConfirm until the confirm button is clicked', () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, message: 'למחוק את הפריט?' },
    })

    expect(wrapper.text()).toContain('למחוק את הפריט?')
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('emits confirm when the confirm button is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, message: 'למחוק את הפריט?' },
    })

    const confirmButton = wrapper.findAll('button').find((b) => b.text() === 'אישור')
    await confirmButton.trigger('click')

    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('emits update:open and does not emit confirm when the cancel button is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, message: 'למחוק את הפריט?' },
    })

    const cancelButton = wrapper.findAll('button').find((b) => b.text() === 'ביטול')
    await cancelButton.trigger('click')

    expect(wrapper.emitted('update:open')).toBeTruthy()
    expect(wrapper.emitted('update:open')[0]).toEqual([false])
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })
})
