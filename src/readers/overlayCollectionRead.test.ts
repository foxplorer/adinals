import assert from 'node:assert/strict'
import test from 'node:test'
import { readOverlayCollectionSource } from './overlayCollectionRead.ts'
import type { CollectionView } from './overlayViewModel.ts'

const ORIGIN = `${'a'.repeat(64)}_0`
const ENDPOINT = 'https://overlay.example'

const view = (ads: number): CollectionView => ({
  collection: {
    origin: ORIGIN,
    name: 'Billboards',
    description: '',
    creator: '1Creator',
    max: 2,
    approval: 'creator',
    contentPolicy: 'family-friendly',
    format: 'text',
    imageProfile: '',
    maxChars: 40,
    placement: '',
    expiresAt: '',
    expired: false,
    height: 900_000,
  },
  ads: Array.from({ length: ads }, (_, index) => ({
    origin: `${String(index).repeat(64)}_0`,
  })) as CollectionView['ads'],
})

test('a complete answer is rendered from the overlay', async () => {
  const result = await readOverlayCollectionSource(ORIGIN, {
    read: async () => view(2),
    endpoint: ENDPOINT,
  })
  assert.equal(result.status, 'rendered')
  assert.equal(result.view?.ads.length, 2)
  assert.deepEqual(result.errors, [])
  assert.equal(result.endpoint, ENDPOINT)
})

test('a node that knows nothing falls back rather than rendering an empty collection', async () => {
  const result = await readOverlayCollectionSource(ORIGIN, {
    read: async () => null,
    endpoint: ENDPOINT,
  })
  assert.equal(result.status, 'empty')
  assert.equal(result.view, null)
})

test('a collection held without any mint is treated as incomplete', async () => {
  const result = await readOverlayCollectionSource(ORIGIN, {
    read: async () => view(0),
    endpoint: ENDPOINT,
  })
  assert.equal(result.status, 'empty')
  assert.equal(result.view, null)
})

test('a failed read falls back and retains its cause', async () => {
  const result = await readOverlayCollectionSource(ORIGIN, {
    read: async () => { throw new Error('overlay is down') },
    endpoint: ENDPOINT,
  })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.view, null)
  assert.deepEqual(result.errors, ['overlay is down'])
})

test('a slow read is abandoned rather than holding the view open', async () => {
  const result = await readOverlayCollectionSource(ORIGIN, {
    read: () => new Promise(() => {}),
    endpoint: ENDPOINT,
    timeoutMs: 20,
  })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.view, null)
  assert.match(result.errors[0] ?? '', /timed out after 20ms/)
})

test('no configured endpoint reads nothing at all', async () => {
  let called = false
  const result = await readOverlayCollectionSource(ORIGIN, {
    read: async () => { called = true; return view(2) },
  })
  assert.equal(result.status, 'disabled')
  assert.equal(result.view, null)
  assert.equal(called, false)
})
