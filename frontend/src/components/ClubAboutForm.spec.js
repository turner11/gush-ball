import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CLUB = {
  id: 5,
  name: 'מכבי',
  name_en: 'Maccabi',
  ibasketball_url: null,
  about_title: 'כותרת',
  about_title_en: null,
  about: 'טקסט',
  about_en: null,
  about_images: [{ url: 'https://cdn.example.com/a.jpg', title: 'תמונה', title_en: null }],
  about_links: [{ label: 'אתר', label_en: null, url: 'https://club.example.com/' }],
  officials: [{ name: 'דני', position: 'יו״ר', image_url: null, about: null }],
}
const jsonRes = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
const ImageUploadStub = { name: 'ImageUpload', template: '<button type="button" class="upload" />' }

describe('ClubAboutForm', () => {
  afterEach(() => vi.restoreAllMocks())

  async function mountForm(putStatus = 200) {
    global.fetch = vi.fn((url, options = {}) =>
      Promise.resolve(jsonRes(putStatus === 200 ? { ...CLUB, ...JSON.parse(options.body) } : {}, putStatus)),
    )
    const { default: Form } = await import('./ClubAboutForm.vue')
    const w = mount(Form, { props: { club: CLUB }, global: { stubs: { ImageUpload: ImageUploadStub } } })
    await flushPromises()
    return w
  }
  const putCall = () => global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT')

  it('PUTs the whole block', async () => {
    const w = await mountForm()
    await w.get('#club-about-title').setValue('כותרת חדשה')
    await w.get('#club-about').setValue('')
    await w.get('[data-test=add-link]').trigger('click')
    await w.get('#link-label-1').setValue('פייסבוק')
    await w.get('#link-url-1').setValue('https://facebook.com/gush')
    w.findComponent({ name: 'ImageUpload' }).vm.$emit('uploaded', 'https://cdn.example.com/b.jpg')
    await flushPromises()
    await w.get('form').trigger('submit')
    await flushPromises()

    const [url, options] = putCall()
    expect(url).toBe('/api/clubs/5/about')
    expect(JSON.parse(options.body)).toEqual({
      about_title: 'כותרת חדשה',
      about_title_en: null,
      about: null,
      about_en: null,
      about_images: [
        { url: 'https://cdn.example.com/a.jpg', title: 'תמונה', title_en: null },
        { url: 'https://cdn.example.com/b.jpg', title: null, title_en: null },
      ],
      about_links: [
        { label: 'אתר', label_en: null, url: 'https://club.example.com/' },
        { label: 'פייסבוק', label_en: null, url: 'https://facebook.com/gush' },
      ],
      officials: [{ name: 'דני', position: 'יו״ר', image_url: null, about: null }],
    })
    expect(w.text()).toContain('נשמר')
  })

  it('removes an image and a link before saving', async () => {
    const w = await mountForm()
    await w.get('[data-test=remove-image-0]').trigger('click')
    await w.get('[data-test=remove-link-0]').trigger('click')
    await w.get('form').trigger('submit')
    await flushPromises()

    const body = JSON.parse(putCall()[1].body)
    expect(body.about_images).toEqual([])
    expect(body.about_links).toEqual([])
  })

  it('adds, uploads a photo for, reorders and saves officials', async () => {
    const w = await mountForm()
    await w.get('[data-test=add-official]').trigger('click')
    await w.get('#official-name-1').setValue('רונית')
    await w.get('#official-position-1').setValue('מזכירה')
    const uploads = w.findAllComponents({ name: 'ImageUpload' })
    uploads.at(-1).vm.$emit('uploaded', 'https://cdn.example.com/o.jpg')
    await flushPromises()
    await w.get('[aria-label="הזזה למעלה 2"]').trigger('click')
    await w.get('form').trigger('submit')
    await flushPromises()

    expect(JSON.parse(putCall()[1].body).officials).toEqual([
      { name: 'רונית', position: 'מזכירה', image_url: 'https://cdn.example.com/o.jpg', about: null },
      { name: 'דני', position: 'יו״ר', image_url: null, about: null },
    ])
  })

  it('removes an official', async () => {
    const w = await mountForm()
    await w.get('[data-test=remove-official-0]').trigger('click')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(JSON.parse(putCall()[1].body).officials).toEqual([])
  })

  it('shows an alert when saving fails', async () => {
    const w = await mountForm(500)
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.get('[role=alert]').text()).toContain('השמירה נכשלה')
  })

  it('emits saved with the server club', async () => {
    const w = await mountForm()
    await w.get('#club-about-title').setValue('חדש')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.emitted('saved')[0][0]).toEqual({ ...CLUB, ...JSON.parse(putCall()[1].body) })
  })

  it('cancel emits cancel', async () => {
    const w = await mountForm()
    await w.findAll('button').find((b) => b.text() === 'ביטול').trigger('click')
    expect(w.emitted('cancel')).toHaveLength(1)
  })
})
