import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import ErrorBoundary from './ErrorBoundary.vue'

describe('ErrorBoundary', () => {
  it('resets after navigation', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p*', component: { render: () => null } }],
    })
    await router.push('/a')
    const broken = ref(true)
    const Child = {
      setup() {
        if (broken.value) throw new Error('boom')
        return () => h('p', 'ok')
      },
    }
    const wrapper = mount(ErrorBoundary, { slots: { default: () => h(Child) }, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('משהו השתבש')

    broken.value = false
    await router.push('/b')
    await flushPromises()

    expect(wrapper.text()).not.toContain('משהו השתבש')
    expect(wrapper.text()).toContain('ok')
  })

  it('shows a Hebrew message, never the raw error text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p*', component: { render: () => null } }],
    })
    await router.push('/a')
    const Child = {
      setup() {
        throw new Error('Failed to fetch')
      },
    }
    const wrapper = mount(ErrorBoundary, { slots: { default: () => h(Child) }, global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('אירעה שגיאה לא צפויה.')
    expect(wrapper.text()).not.toContain('Failed to fetch')
  })
})
