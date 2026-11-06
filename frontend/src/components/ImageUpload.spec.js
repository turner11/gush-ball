import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function pickFile(wrapper, names = ['a.png']) {
  const input = wrapper.find('input[type="file"]')
  const files = names.map((name) => new File(['a'], name, { type: 'image/png' }))
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
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

  it('tells the user to try again later on a 429', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => {
        throw new Error('no body')
      },
    })

    const { default: ImageUpload } = await import('./ImageUpload.vue')
    const wrapper = mount(ImageUpload)
    await pickFile(wrapper)

    expect(wrapper.text()).toContain('יותר מדי ניסיונות, נסו שוב מאוחר יותר')
  })

  it('forwards the accept prop and defaults to images', async () => {
    const { default: ImageUpload } = await import('./ImageUpload.vue')
    expect(mount(ImageUpload).find('input').attributes('accept')).toBe('image/*')
    const wrapper = mount(ImageUpload, { props: { accept: 'application/pdf' } })
    expect(wrapper.find('input').attributes('accept')).toBe('application/pdf')
  })

  const upload = (status, url) => ({ ok: status < 400, status, statusText: 'x', json: async () => (status < 400 ? { url } : {}) })

  it('uploads every selected file in order and emits each url when multiple', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(upload(200, 'u1')).mockResolvedValueOnce(upload(200, 'u2'))
    const { default: ImageUpload } = await import('./ImageUpload.vue')
    const wrapper = mount(ImageUpload, { props: { multiple: true } })
    expect(wrapper.find('input').attributes('multiple')).toBeDefined()
    await pickFile(wrapper, ['a.png', 'b.png'])

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('uploaded')).toEqual([['u1'], ['u2']])
    expect(mount(ImageUpload).find('input').attributes('multiple')).toBeUndefined()
  })

  it('keeps the successes and names the failed files', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(upload(200, 'u1')).mockResolvedValueOnce(upload(502)).mockResolvedValueOnce(upload(200, 'u3'))
    const { default: ImageUpload } = await import('./ImageUpload.vue')
    const wrapper = mount(ImageUpload, { props: { multiple: true } })
    await pickFile(wrapper, ['a.png', 'b.png', 'c.png'])

    expect(wrapper.emitted('uploaded')).toEqual([['u1'], ['u3']])
    expect(wrapper.text()).toContain('לא הועלו 1 מתוך 3')
    expect(wrapper.text()).toContain('b.png')
  })

  it('stops at a 429 and counts the rest as not uploaded', async () => {
    global.fetch = vi.fn().mockResolvedValue(upload(429))
    const { default: ImageUpload } = await import('./ImageUpload.vue')
    const wrapper = mount(ImageUpload, { props: { multiple: true } })
    await pickFile(wrapper, ['a.png', 'b.png', 'c.png'])

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('יותר מדי ניסיונות, נסו שוב מאוחר יותר')
    expect(wrapper.text()).toContain('לא הועלו 3 מתוך 3')
  })
})
