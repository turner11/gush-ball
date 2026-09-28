import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import ConfirmDialog from './ConfirmDialog.vue'

// ConfirmDialog renders its content through an AlertDialog portal teleported to
// document.body, so assertions read from the body rather than from `wrapper`. The
// portal's Teleport also only activates after mount, so tests await a tick first.
function body() {
  return new DOMWrapper(document.body)
}

describe('ConfirmDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the message and does not call onConfirm until the confirm button is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, message: 'למחוק את הפריט?' },
      attachTo: document.body,
    })
    await flushPromises()

    expect(body().text()).toContain('למחוק את הפריט?')
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('emits confirm when the confirm button is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, message: 'למחוק את הפריט?' },
      attachTo: document.body,
    })
    await flushPromises()

    const confirmButton = body().findAll('button').find((b) => b.text() === 'אישור')
    await confirmButton.trigger('click')

    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('emits update:open and does not emit confirm when the cancel button is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, message: 'למחוק את הפריט?' },
      attachTo: document.body,
    })
    await flushPromises()

    const cancelButton = body().findAll('button').find((b) => b.text() === 'ביטול')
    await cancelButton.trigger('click')

    expect(wrapper.emitted('update:open')).toBeTruthy()
    expect(wrapper.emitted('update:open')[0]).toEqual([false])
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })
})
