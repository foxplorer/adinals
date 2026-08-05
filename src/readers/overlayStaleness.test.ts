import assert from 'node:assert/strict'
import test from 'node:test'
import { overlayHeadsWithSuccessors } from './overlayStaleness.ts'
import type { Ad } from './collectionViewModel.ts'
import type { Row } from './productCatalog.ts'

const ad = (origin: string, outpoint: string): Ad => ({
  origin,
  outpoint,
  collectionId: 'collection_0',
  owner: 'seller',
  ownerEpoch: origin,
  serial: 3,
  name: 'Ad #3',
  format: 'text',
  mintText: '',
  mintContentUrl: '',
  mintUrl: '',
  mintedAt: '',
  height: 961_016,
  listing: null,
  originHeight: 961_016,
  originIdx: 0,
  fromCreator: true,
  invalidReason: '',
  duplicateSlot: false,
  updates: [],
  liveText: '',
  liveContentUrl: '',
  liveUrl: '',
  status: 'live',
  marketEvents: [],
  indexPending: false,
})

const row = (origin: string, ownershipOutpoints: string[]): Row => ({
  outpoint: ownershipOutpoints[ownershipOutpoints.length - 1] ?? origin,
  origin,
  owner: 'buyer',
  height: null,
  idx: 0,
  originHeight: 961_016,
  originIdx: 0,
  spend: '',
  listing: null,
  map: {},
  signer: '',
  marketEvents: [],
  ownershipOutpoints,
  chainIncomplete: false,
})

test('a listing the indexer has seen sold is reported as behind', () => {
  const behind = overlayHeadsWithSuccessors(
    [ad('mint_0', 'listing_0')],
    [row('mint_0', ['mint_0', 'listing_0', 'purchase_0', 'update_0'])],
  )
  assert.deepEqual(behind, ['mint_0'])
})

test('the head the indexer also considers current is not behind', () => {
  const behind = overlayHeadsWithSuccessors(
    [ad('mint_0', 'listing_0')],
    [row('mint_0', ['mint_0', 'listing_0'])],
  )
  assert.deepEqual(behind, [])
})

/**
 * The state immediately after publishing: the overlay was told directly and the
 * indexer has not caught up. Falling back here would replace fresh evidence
 * with stale evidence, which is the failure this check exists to prevent.
 */
test('a record the indexer has not seen yet is never treated as behind', () => {
  const behind = overlayHeadsWithSuccessors(
    [ad('mint_0', 'listing_0')],
    [row('mint_0', ['mint_0'])],
  )
  assert.deepEqual(behind, [])
})

test('an ad the overlay never rendered is left to the reader that has it', () => {
  const behind = overlayHeadsWithSuccessors(
    [ad('mint_0', 'mint_0')],
    [row('other_0', ['other_0', 'sold_0'])],
  )
  assert.deepEqual(behind, [])
})
