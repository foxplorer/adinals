import assert from 'node:assert/strict'
import test from 'node:test'
import { createCreativeStore, type Creative } from './creativeStore.ts'

const creative = (outpoint: string, bytes = [1, 2, 3]): Creative => ({
  outpoint,
  contentType: 'image/png',
  bytes,
})

const fakeHandles = () => {
  const materialized: string[] = []
  const released: string[] = []
  let next = 0
  return {
    materialized,
    released,
    materialize: (bytes: number[], contentType: string) => {
      const url = `blob:${next += 1}/${contentType}/${bytes.length}`
      materialized.push(url)
      return url
    },
    release: (url: string) => { released.push(url) },
  }
}

test('a registered creative is materialized once, on first use', () => {
  const handles = fakeHandles()
  const store = createCreativeStore(handles)
  store.register([creative('a_0')])
  assert.equal(handles.materialized.length, 0)

  const url = store.url('a_0')
  assert.equal(url, handles.materialized[0])
  assert.equal(store.url('a_0'), url)
  assert.equal(handles.materialized.length, 1)
})

test('an unknown outpoint has no URL, so the caller falls back', () => {
  const store = createCreativeStore(fakeHandles())
  assert.equal(store.url('missing_0'), '')
})

test('re-registering an immutable outpoint keeps the handle it has', () => {
  const handles = fakeHandles()
  const store = createCreativeStore(handles)
  store.register([creative('a_0')])
  const first = store.url('a_0')
  store.register([creative('a_0')])
  assert.equal(store.url('a_0'), first)
  assert.equal(handles.materialized.length, 1)
  assert.equal(store.size(), 1)
})

test('an empty creative is not retained', () => {
  const store = createCreativeStore(fakeHandles())
  store.register([creative('a_0', []), { outpoint: '', contentType: 'image/png', bytes: [1] }])
  assert.equal(store.size(), 0)
})

test('the oldest creatives are evicted and their handles released', () => {
  const handles = fakeHandles()
  const store = createCreativeStore({ ...handles, capacity: 2 })
  store.register([creative('a_0'), creative('b_0')])
  const first = store.url('a_0')
  store.register([creative('c_0')])

  assert.equal(store.size(), 2)
  assert.equal(store.url('a_0'), '')
  assert.deepEqual(handles.released, [first])
  assert.notEqual(store.url('c_0'), '')
})

test('clearing releases every materialized handle', () => {
  const handles = fakeHandles()
  const store = createCreativeStore(handles)
  store.register([creative('a_0'), creative('b_0')])
  const url = store.url('a_0')
  store.clear()

  assert.equal(store.size(), 0)
  // Only what was materialized can be released; the rest never became a handle.
  assert.deepEqual(handles.released, [url])
  assert.equal(store.url('a_0'), '')
})

test('a store without browser handles degrades to no URL rather than throwing', () => {
  const store = createCreativeStore({ materialize: () => '' })
  store.register([creative('a_0')])
  assert.equal(store.url('a_0'), '')
})
