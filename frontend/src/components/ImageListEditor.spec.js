import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ImageListEditor from './ImageListEditor.vue'

const list = [{ url: 'https://cdn/a.jpg', title: 'A', title_en: '' }]
const mountIt = () => mount(ImageListEditor, { props: { modelValue: list }, global: { stubs: { ImageUpload: { name: 'ImageUpload', template: '<i />' } } } })
const last = (w) => w.emitted('update:modelValue').at(-1)[0]

describe('ImageListEditor', () => {
  it('adds an uploaded image', () => {
    const w = mountIt()
    w.findComponent({ name: 'ImageUpload' }).vm.$emit('uploaded', 'https://cdn/b.jpg')
    expect(last(w)).toEqual([...list, { url: 'https://cdn/b.jpg', title: '', title_en: '' }])
  })

  it('edits a row', async () => {
    const w = mountIt()
    await w.find('#image-title-en-0').setValue('Hi')
    expect(last(w)).toEqual([{ ...list[0], title_en: 'Hi' }])
  })

  it('removes a row', async () => {
    const w = mountIt()
    await w.find('[data-test="remove-image-0"]').trigger('click')
    expect(last(w)).toEqual([])
  })
})
