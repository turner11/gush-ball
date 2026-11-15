import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import VideoSegmentFields from './VideoSegmentFields.vue'

const mountFields = (modelValue) => mount(VideoSegmentFields, { props: { modelValue, id: 'seg' } })
const type = async (w, sel, text) => {
  const input = w.find(sel)
  input.element.value = text
  await input.trigger('change')
}

describe('VideoSegmentFields', () => {
  it('is hidden for non-YouTube and empty urls', () => {
    expect(mountFields('https://vimeo.com/1').find('input').exists()).toBe(false)
    expect(mountFields('').find('input').exists()).toBe(false)
  })
  it('prefills from t=', () => {
    expect(mountFields('https://youtu.be/xyz?t=760').find('#seg-start').element.value).toBe('12:40')
  })
  it('emits the url with t and end', async () => {
    const w = mountFields('https://youtu.be/xyz')
    await type(w, '#seg-start', '1:30')
    const url = w.emitted('update:modelValue')[0][0]
    expect(url).toContain('t=90')
    await w.setProps({ modelValue: url })
    await type(w, '#seg-end', '2:10')
    expect(w.emitted('update:modelValue')[1][0]).toContain('end=130')
  })
  it('rejects junk and end before start', async () => {
    const w = mountFields('https://youtu.be/xyz?t=90')
    await type(w, '#seg-end', 'abc')
    expect(w.find('.error-text').exists()).toBe(true)
    await type(w, '#seg-end', '1:00')
    expect(w.find('.error-text').exists()).toBe(true)
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})
