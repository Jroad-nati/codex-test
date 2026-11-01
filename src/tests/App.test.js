import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.vue'

const key = 'little-list-tasks-v1'
const samples = () => [
  { id: 1, todo: 'Read a book', completed: false },
  { id: 2, todo: 'Drink water', completed: true }
]
const response = data => ({ ok: true, json: async () => data })
let wrapper
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ todos: samples() })))
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })
async function open() { wrapper = mount(App); await flushPromises(); return wrapper }
const findButton = text => wrapper.findAll('button').find(button => button.text() === text)

describe('Little List', () => {
  it('shows loading until sample tasks arrive and stores the result', async () => {
    let resolve
    fetch.mockImplementation(() => new Promise(done => { resolve = done }))
    wrapper = mount(App)
    expect(wrapper.text()).toContain('Loading your sample tasks')
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    resolve(response({ todos: samples() }))
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith('https://dummyjson.com/todos/user/1', {})
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(wrapper.text()).toContain('1 task left')
    expect(JSON.parse(localStorage.getItem(key))).toEqual(samples())
  })

  it('rejects blank input and blocks duplicate submissions while adding', async () => {
    await open()
    await wrapper.get('input').setValue('   ')
    await wrapper.get('form').trigger('submit')
    expect(fetch).toHaveBeenCalledTimes(1)
    let resolve
    fetch.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    await wrapper.get('input').setValue(' New task ')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][0]).toBe('https://dummyjson.com/todos/add')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ todo: 'New task', completed: false, userId: 1 })
    resolve(response({ id: 255 }))
    await flushPromises()
    expect(wrapper.text()).toContain('New task')
    const created = JSON.parse(localStorage.getItem(key)).at(-1)
    expect(created.id).toMatch(/^local-/)
    expect(created.local).toBe(true)
    expect(wrapper.get('input').element.value).toBe('')
  })

  it('updates and deletes server tasks and persists the changes', async () => {
    await open()
    await wrapper.get('[role="checkbox"]').trigger('click')
    await flushPromises()
    expect(fetch.mock.calls[1][1].method).toBe('PUT')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ completed: true })
    expect(wrapper.get('[role="checkbox"]').attributes('aria-checked')).toBe('true')
    await wrapper.get('[aria-label="Delete: Read a book"]').trigger('click')
    await flushPromises()
    expect(fetch.mock.calls[2]).toEqual(['https://dummyjson.com/todos/1', { method: 'DELETE' }])
    expect(JSON.parse(localStorage.getItem(key))).toHaveLength(1)
  })

  it('filters active and completed tasks and shows the empty state', async () => {
    await open()
    await findButton('Active').trigger('click')
    expect(wrapper.findAll('li')).toHaveLength(1)
    expect(wrapper.text()).toContain('Read a book')
    await findButton('Completed').trigger('click')
    expect(wrapper.findAll('li')).toHaveLength(1)
    expect(wrapper.text()).toContain('Drink water')
    await wrapper.get('[aria-label="Delete: Drink water"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('No completed tasks yet')
    await findButton('All').trigger('click')
    expect(wrapper.findAll('li')).toHaveLength(1)
  })

  it('restores saved tasks and handles local tasks without API requests', async () => {
    localStorage.setItem(key, JSON.stringify([{ id: 'local-abc', todo: 'Local task', completed: false, local: true }]))
    await open()
    expect(fetch).not.toHaveBeenCalled()
    await wrapper.get('[role="checkbox"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('0 tasks left')
    wrapper.unmount()
    await open()
    expect(wrapper.get('[role="checkbox"]').attributes('aria-checked')).toBe('true')
    await wrapper.get('[aria-label="Delete: Local task"]').trigger('click')
    await flushPromises()
    expect(fetch).not.toHaveBeenCalled()
    expect(localStorage.getItem(key)).toBe('[]')
    wrapper.unmount()
    await open()
    expect(fetch).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('A fresh start')
  })

  it('shows load errors and retries successfully', async () => {
    fetch.mockRejectedValueOnce(new Error('offline'))
    await open()
    expect(wrapper.get('[role="alert"]').text()).toContain('couldn’t load')
    await findButton('Try again').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('preserves text when adding fails and retries', async () => {
    await open()
    fetch.mockResolvedValueOnce({ ok: false })
    await wrapper.get('input').setValue('Keep this')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('input').element.value).toBe('Keep this')
    expect(wrapper.findAll('li')).toHaveLength(2)
    await findButton('Try again').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('li')).toHaveLength(3)
  })

  it.each(['update', 'delete'])('keeps tasks unchanged on failed %s and supports retry', async action => {
    await open()
    fetch.mockRejectedValueOnce(new Error('offline'))
    const selector = action === 'update' ? '[role="checkbox"]' : '[aria-label="Delete: Read a book"]'
    await wrapper.get(selector).trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(`couldn’t ${action}`)
    expect(JSON.parse(localStorage.getItem(key))).toEqual(samples())
    await findButton('Try again').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(action === 'delete' ? wrapper.findAll('li').length : JSON.parse(localStorage.getItem(key))[0].completed).toBe(action === 'delete' ? 1 : true)
  })

  it('blocks duplicate updates while a request is pending', async () => {
    await open()
    let resolve
    fetch.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    await wrapper.get('[role="checkbox"]').trigger('click')
    await wrapper.get('[role="checkbox"]').trigger('click')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[aria-label="Delete: Read a book"]').attributes('disabled')).toBeDefined()
    resolve(response({}))
    await flushPromises()
    expect(wrapper.text()).toContain('0 tasks left')
  })

  it('recovers from invalid saved data', async () => {
    localStorage.setItem(key, 'invalid json')
    await open()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('li')).toHaveLength(2)
  })

  it('warns if browser storage cannot save changes', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    await open()
    expect(wrapper.text()).toContain('Browser storage is unavailable or full')
    expect(wrapper.findAll('li')).toHaveLength(2)
    spy.mockRestore()
  })
})
