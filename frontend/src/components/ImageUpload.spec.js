import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function pickFile(wrapper) {
  const input = wrapper.find('input[type="file"]')
  const file = new File(['a'], 'a.png', { type: 'image/png' })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

describe('ImageUpload', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uploads the selected file and emits the returned url', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://cdn/x.png' }),
    })

    const { default: ImageUpload } = await import('./ImageUpload.vue')
    const wrapper = mount(ImageUpload)
    await pickFile(wrapper)

    const [url, init] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/uploads')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect(init.body.get('file')).toBeInstanceOf(File)
    expect(wrapper.emitted('uploaded')).toEqual([['https://cdn/x.png']])
  })

  it('shows an error and emits nothing when the upload fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new Error('no body')
      },
    })

    const { default: ImageUpload } = await import('./ImageUpload.vue')
    const wrapper = mount(ImageUpload)
    await pickFile(wrapper)

    expect(wrapper.emitted('uploaded')).toBeUndefined()
    expect(wrapper.text()).toContain('שגיאה בהעלאת הקובץ')
  })
})
