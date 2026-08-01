import assert from 'node:assert/strict'
import test from 'node:test'
import type { IndexedAdinalsRecord } from './adinalsIndex.ts'
import { reconstructChains } from './adinalsChain.ts'

const origin = `${'a'.repeat(64)}_0`
const listingTxid = 'b'.repeat(64)
const purchaseTxid = 'c'.repeat(64)

const row = (
  outpoint: string,
  overrides: Partial<IndexedAdinalsRecord> = {},
): IndexedAdinalsRecord => ({
  outpoint,
  origin,
  owner: 'seller',
  signer: 'creator',
  spend: '',
  height: 900_000,
  index: 1,
  map: {},
  listing: null,
  ...overrides,
})

test('follows the spend chain from the origin rather than sorting by height', () => {
  // Every mempool row reports height null and index 0, so ties are meaningless.
  const rows = [
    row(`${purchaseTxid}_0`, { owner: 'buyer', height: null, index: 0 }),
    row(origin, { spend: listingTxid }),
    row(`${listingTxid}_0`, {
      spend: purchaseTxid,
      listing: { price: 1000, seller: 'seller' },
      owner: '',
      height: null,
      index: 0,
    }),
  ]
  const chains = reconstructChains(rows)
  const chain = chains.get(origin)
  assert.ok(chain)
  assert.deepEqual(chain.ownershipOutpoints, [
    origin,
    `${listingTxid}_0`,
    `${purchaseTxid}_0`,
  ])
  assert.equal(chain.current.outpoint, `${purchaseTxid}_0`)
  assert.equal(chain.current.owner, 'buyer')
})

test('a listing does not transfer ownership until a purchase does', () => {
  const rows = [
    row(origin, { spend: listingTxid }),
    row(`${listingTxid}_0`, { listing: { price: 1000, seller: 'seller' }, owner: '' }),
  ]
  const chain = reconstructChains(rows).get(origin)
  assert.equal(chain?.current.outpoint, `${listingTxid}_0`)
  assert.equal(chain?.current.owner, 'seller')
  assert.ok(chain?.current.listing)
})

test('stops cleanly on a truncated or self-referential chain', () => {
  const dangling = reconstructChains([row(origin, { spend: 'd'.repeat(64) })])
  assert.deepEqual(dangling.get(origin)?.ownershipOutpoints, [origin])

  const looping = reconstructChains([
    row(origin, { spend: origin.split('_')[0] as string }),
  ])
  assert.deepEqual(looping.get(origin)?.ownershipOutpoints, [origin])
})

test('keeps separate origins in separate chains', () => {
  const other = `${'e'.repeat(64)}_0`
  const chains = reconstructChains([
    row(origin),
    row(other, { origin: other }),
  ])
  assert.equal(chains.size, 2)
  assert.deepEqual(chains.get(other)?.ownershipOutpoints, [other])
})
