import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
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
}
const jsonRes = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
const ImageUploadStub = { name: 'ImageUpload', template: '<button type="button" class="upload" />' }

describe('AdminClubAboutView', () => {
  let router

  beforeEach(async () => {
    vi.resetModules()
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/admin/clubs/:id', component: { template: '<div/>' } },
        { path: '/admin', name: 'admin-home', component: { template: '<div/>' } },
        { path: '/clubs/:clubSlug', name: 'club', component: { template: '<div/>' } },
      ],
    })
  })
  afterEach(() => vi.restoreAllMocks())

  async function mountView(id = 5, putStatus = 200) {
    router.push(`/admin/clubs/${id}`)
    await router.isReady()
    global.fetch = vi.fn((url, options = {}) => {
      if (options.method === 'PUT') return Promise.resolve(jsonRes(putStatus === 200 ? { ...CLUB, ...JSON.parse(options.body) } : {}, putStatus))
      return Promise.resolve(jsonRes([CLUB]))
    })
    const { useAuth } = await import('../composables/useAuth')
    useAuth().user.value = { id: 1, team_ids: null }
    const { default: View } = await import('./AdminClubAboutView.vue')
    const w = mount(View, { global: { plugins: [router], stubs: { ImageUpload: ImageUploadStub } } })
    await flushPromises()
    return w
  }
  const putCall = () => global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT')

  it('loads the club and PUTs the whole block', async () => {
    const w = await mountView()
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
    })
    expect(w.text()).toContain('נשמר')
  })

  it('removes an image and a link before saving', async () => {
    const w = await mountView()
    await w.get('[data-test=remove-image-0]').trigger('click')
    await w.get('[data-test=remove-link-0]').trigger('click')
    await w.get('form').trigger('submit')
    await flushPromises()

    const body = JSON.parse(putCall()[1].body)
    expect(body.about_images).toEqual([])
    expect(body.about_links).toEqual([])
  })

  it('shows an alert when saving fails', async () => {
    const w = await mountView(5, 500)
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.get('[role=alert]').text()).toContain('השמירה נכשלה')
  })

  it('shows not-found for an unknown club id', async () => {
    const w = await mountView(99)
    expect(w.text()).toContain('המועדון לא נמצא')
    expect(w.find('form').exists()).toBe(false)
  })
})
