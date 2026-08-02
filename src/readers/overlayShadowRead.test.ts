import assert from 'node:assert/strict'
import test from 'node:test'
import type { LifecycleProjection, PublicLifecycleProjection } from '../overlay/lifecycleParity.ts'
import { readOverlayShadowComparison } from './overlayShadowRead.ts'

const origin = `${'ab'.repeat(32)}_0`
const adOrigin = `${'cd'.repeat(32)}_0`

const collection = {
  origin,
  creator: '1CreatorAddress',
  capacity: 10,
  approval: 'creator' as const,
  format: 'text' as const,
  expiresAt: null,
  displayEligible: true,
}

const ad = {
  origin: adOrigin,
  slot: 1,
  currentOutpoint: `${'ef'.repeat(32)}_0`,
  owner: '1OwnerAddress',
  ownerEpoch: adOrigin,
  ownershipOutpoints: [adOrigin],
  listing: null,
  proposalStatus: 'live' as const,
  creative: { kind: 'text' as const, text: 'live copy', contentHash: '', sourceOutpoint: adOrigin },
}

const reference = (): PublicLifecycleProjection => ({ collection, ads: [ad] })
const overlay = (): LifecycleProjection => ({ collection, ads: [ad] })

test('an agreeing overlay is recorded as a match', async () => {
  const result = await readOverlayShadowComparison(origin, {
    overlay: async () => overlay(),
    reference: async () => reference(),
    endpoint: 'https://overlay.example',
  })
  assert.equal(result.status, 'match')
  assert.deepEqual(result.errors, [])
  assert.equal(result.endpoint, 'https://overlay.example')
  assert.equal(result.origin, origin)
})

test('a disagreeing overlay is recorded with the exact differences', async () => {
  const result = await readOverlayShadowComparison(origin, {
    overlay: async () => ({
      collection: { ...collection, capacity: 11 },
      ads: [{ ...ad, owner: '1DifferentOwner' }],
    }),
    reference: async () => reference(),
  })
  assert.equal(result.status, 'diverged')
  assert.ok(result.errors.length >= 2)
  assert.ok(result.errors.some((error) => error.includes('capacity')))
})

test('an unreachable reference is reported without blaming the overlay', async () => {
  let overlayCalls = 0
  const result = await readOverlayShadowComparison(origin, {
    overlay: async () => { overlayCalls += 1; return overlay() },
    reference: async () => { throw new Error('reader 503') },
  })
  assert.equal(result.status, 'reference-unavailable')
  assert.deepEqual(result.errors, ['reader 503'])
  assert.equal(overlayCalls, 0)
})

test('an unreachable overlay is recorded, not thrown', async () => {
  const result = await readOverlayShadowComparison(origin, {
    overlay: async () => { throw new Error('overlay 502') },
    reference: async () => reference(),
  })
  assert.equal(result.status, 'overlay-unavailable')
  assert.match(result.errors[0] ?? '', /overlay 502/)
})

test('a slow overlay times out into an observation', async () => {
  const result = await readOverlayShadowComparison(origin, {
    overlay: () => new Promise(() => {}),
    reference: async () => reference(),
    timeoutMs: 25,
  })
  assert.equal(result.status, 'overlay-unavailable')
  assert.match(result.errors[0] ?? '', /timed out/)
  assert.ok(result.durationMs >= 25)
})

test('a slow reference times out without consulting the overlay', async () => {
  let overlayCalls = 0
  const result = await readOverlayShadowComparison(origin, {
    overlay: async () => { overlayCalls += 1; return overlay() },
    reference: () => new Promise(() => {}),
    timeoutMs: 25,
  })
  assert.equal(result.status, 'reference-unavailable')
  assert.equal(overlayCalls, 0)
})
