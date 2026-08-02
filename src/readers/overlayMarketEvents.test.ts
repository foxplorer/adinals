import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveMarketEvents, type ChainState } from './overlayMarketEvents.ts'

const SELLER = '1SellerAddress'
const BUYER = '1BuyerAddress'
const PRICE = 7

let position = 0
const state = (overrides: Partial<ChainState> & Pick<ChainState, 'recordType' | 'owner'>): ChainState => ({
  outpoint: `${String(position).padStart(2, '0').repeat(32)}_0`,
  listing: null,
  height: 960_000 + (position += 1),
  index: position,
  ...overrides,
})

const mint = () => state({ recordType: 'collectionItem', owner: SELLER })
const listed = () => state({ recordType: 'listing', owner: SELLER, listing: { price: PRICE, seller: SELLER } })
const owned = (owner: string) => state({ recordType: 'state', owner })

test('a mint alone has no market history', () => {
  assert.deepEqual(deriveMarketEvents([mint()]), [])
})

test('spending a state into a lock is a listing at its price', () => {
  const events = deriveMarketEvents([mint(), listed()])
  assert.equal(events.length, 1)
  assert.equal(events[0]?.kind, 'listed')
  assert.equal(events[0]?.price, PRICE)
  assert.equal(events[0]?.owner, SELLER)
})

test('spending a lock to another owner is a purchase at the listed price', () => {
  const events = deriveMarketEvents([mint(), listed(), owned(BUYER)])
  assert.deepEqual(events.map((event) => event.kind), ['listed', 'purchased'])
  const purchase = events[1]
  assert.equal(purchase?.previousOwner, SELLER)
  assert.equal(purchase?.owner, BUYER)
  assert.equal(purchase?.price, PRICE)
})

test('spending a lock back to its seller is a delisting and moves no money', () => {
  const events = deriveMarketEvents([mint(), listed(), owned(SELLER)])
  assert.deepEqual(events.map((event) => event.kind), ['listed', 'delisted'])
  assert.equal(events[1]?.price, null)
  assert.equal(events[1]?.owner, SELLER)
})

test('a direct change of owner is a transfer', () => {
  const events = deriveMarketEvents([mint(), owned(BUYER)])
  assert.deepEqual(events.map((event) => event.kind), ['transferred'])
  assert.equal(events[0]?.previousOwner, SELLER)
  assert.equal(events[0]?.price, null)
})

test('an update keeps the owner and is not a market event', () => {
  assert.deepEqual(deriveMarketEvents([mint(), owned(SELLER)]), [])
})

test('a relisting after a sale reports the new seller', () => {
  const buyerListing = state({
    recordType: 'listing',
    owner: BUYER,
    listing: { price: 12, seller: BUYER },
  })
  const events = deriveMarketEvents([mint(), listed(), owned(BUYER), buyerListing])
  assert.deepEqual(events.map((event) => event.kind), ['listed', 'purchased', 'listed'])
  assert.equal(events[2]?.owner, BUYER)
  assert.equal(events[2]?.price, 12)
})

test('each event carries the chain position of its own transaction', () => {
  const events = deriveMarketEvents([mint(), listed(), owned(BUYER)])
  assert.ok(events.every((event) => typeof event.height === 'number' && event.height > 960_000))
  assert.ok(events[0]!.height! < events[1]!.height!)
})
