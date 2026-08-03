import assert from 'node:assert/strict'
import test from 'node:test'
import { mapWithConcurrency, readOverlayNamespace } from './overlayNamespace.ts'
import type { CollectionView } from './overlayViewModel.ts'

const origin = (seed: string) => `${seed.repeat(64).slice(0, 64)}_0`
const FIRST = origin('a')
const SECOND = origin('b')

const view = (collectionOrigin: string, ads: number): CollectionView => ({
  collection: {
    origin: collectionOrigin,
    name: 'Collection',
    description: '',
    creator: '1Creator',
    max: 5,
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
    origin: `${collectionOrigin}-ad-${index}`,
    collectionId: collectionOrigin,
  })) as CollectionView['ads'],
})

test('a namespace that resolves completely is rendered from the overlay', async () => {
  const result = await readOverlayNamespace({
    listCollections: async () => [FIRST, SECOND],
    readCollection: async (target) => view(target, target === FIRST ? 2 : 3),
  })
  assert.equal(result.status, 'rendered')
  assert.equal(result.namespace?.collections.length, 2)
  assert.equal(result.namespace?.ads.length, 5)
  assert.deepEqual(result.origins, [FIRST, SECOND])
})

test('a node that lists nothing is unknown rather than an empty namespace', async () => {
  const result = await readOverlayNamespace({
    listCollections: async () => [],
    readCollection: async () => null,
  })
  assert.equal(result.status, 'empty')
  assert.equal(result.namespace, null)
})

test('one unresolved collection falls back whole rather than hiding it', async () => {
  const result = await readOverlayNamespace({
    listCollections: async () => [FIRST, SECOND],
    readCollection: async (target) => (target === FIRST ? view(target, 2) : null),
  })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.namespace, null)
  assert.match(result.errors[0] ?? '', /could not resolve/)
})

test('a failed listing falls back and retains its cause', async () => {
  const result = await readOverlayNamespace({
    listCollections: async () => { throw new Error('overlay is down') },
    readCollection: async () => null,
  })
  assert.equal(result.status, 'unavailable')
  assert.deepEqual(result.errors, ['overlay is down'])
})

test('a failed projection falls back rather than dropping its collection', async () => {
  const result = await readOverlayNamespace({
    listCollections: async () => [FIRST],
    readCollection: async () => { throw new Error('projection failed') },
  })
  assert.equal(result.status, 'unavailable')
  assert.deepEqual(result.errors, ['projection failed'])
})

test('a slow namespace is abandoned rather than holding the application open', async () => {
  const result = await readOverlayNamespace({
    listCollections: async () => [FIRST],
    readCollection: () => new Promise(() => {}),
    timeoutMs: 20,
  })
  assert.equal(result.status, 'unavailable')
  assert.match(result.errors[0] ?? '', /timed out after 20ms/)
})

test('no configured overlay reads nothing at all', async () => {
  let called = false
  const result = await readOverlayNamespace({
    enabled: false,
    listCollections: async () => { called = true; return [FIRST] },
    readCollection: async () => null,
  })
  assert.equal(result.status, 'disabled')
  assert.equal(called, false)
})

test('collections are read in parallel without exceeding the limit', async () => {
  const origins = Array.from({ length: 9 }, (_, index) => `${index}`)
  let inFlight = 0
  let peak = 0
  const seen: string[] = []
  const results = await mapWithConcurrency(origins, 4, async (item) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 1))
    inFlight -= 1
    seen.push(item)
    return Number(item)
  })
  assert.equal(peak, 4)
  assert.equal(seen.length, 9)
  // Results stay in the order of their inputs regardless of completion order.
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8])
})
