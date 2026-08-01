import assert from 'node:assert/strict'
import test from 'node:test'
import type { WalletInterface } from '@bsv/sdk'
import type { OwnershipModel } from '../readers/ownershipModel.ts'
import {
  createConnectedLabKeys,
  ownsAd,
  ownsCollection,
  ownsListing,
  productOwnershipEffect,
  rememberOwnedAd,
} from './productOwnership.ts'

const collection = `${'a'.repeat(64)}_0`
const origin = `${'b'.repeat(64)}_0`
const listing = `${'c'.repeat(64)}_0`

const custody = {
  kind: 'listing',
  outpoint: listing,
  walletOutpoint: listing.replace('_', '.'),
  txid: 'c'.repeat(64),
  vout: 0,
  satoshis: 1,
  ownerKeyID: 'ad-owner-key',
  signerKeyID: 'ad-signer-key',
  derivedOwner: '1Owner',
  scriptOwner: '1Owner',
  signer: '',
  map: null,
  sigmaSource: '',
  stateOutpoint: '',
  recordOutpoint: '',
  listing: { price: 1000, seller: '1Owner' },
  spendable: true,
  tags: [],
  atomicBeef: [1, 2, 3],
  errors: [],
  verified: true,
} as const

test('product ownership uses basket routes rather than one permanent address', () => {
  const model = {
    collections: [{
      origin: collection,
      custody: { ...custody, kind: 'collection', outpoint: collection, ownerKeyID: 'creator-key' },
    }],
    ads: [{ origin, currentOutpoint: listing, listed: custody.listing, custody }],
    pendingApprovals: [],
    custody: { basket: 'test', totalOutputs: 2, outputs: [], unrecognized: 0, queryError: '' },
    notices: [],
  } as unknown as OwnershipModel
  const keys = createConnectedLabKeys(
    {} as WalletInterface,
    { identityKey: 'identity', basket: 'test' },
    model,
  )
  assert.equal(ownsCollection(keys, collection), true)
  assert.equal(ownsAd(keys, origin), true)
  assert.equal(ownsAd(keys, origin, '1Owner'), true)
  assert.equal(ownsAd(keys, origin, '1Buyer'), false)
  assert.equal(ownsAd(keys, listing.replace('_', '.')), true)
  assert.equal(ownsListing(keys, listing), true)
  assert.equal(keys.collectionRoutes.get(collection)?.keyID, 'creator-key')
  assert.equal(keys.outputRoutes.get(listing)?.atomicBeef.length, 3)
})

test('a purchased state route is linked to the permanent ad origin immediately', () => {
  const purchased = `${'d'.repeat(64)}_0`
  const purchasedOrigin = `${'e'.repeat(64)}_0`
  const keys = createConnectedLabKeys(
    {} as WalletInterface,
    { identityKey: 'buyer', basket: 'test' },
    null,
  )
  keys.outputRoutes.set(purchased, {
    ...custody,
    kind: 'state',
    outpoint: purchased,
    listing: null,
    tags: [],
    atomicBeef: [1, 2, 3],
    errors: [],
  })

  assert.equal(rememberOwnedAd(keys, purchasedOrigin, purchased), true)
  assert.equal(ownsAd(keys, purchasedOrigin), true)
  assert.equal(ownsAd(keys, purchasedOrigin, '1Owner'), true)
  assert.equal(ownsAd(keys, purchasedOrigin, '1Seller'), false)
  assert.equal(keys.outputRoutes.get(purchasedOrigin)?.outpoint, purchased)
})

test('a creator decision records authority without claiming ad custody', () => {
  assert.deepEqual(productOwnershipEffect('decision'), {
    linkAdOrigin: false,
    storeCustodyRoute: false,
  })
  assert.equal(productOwnershipEffect('purchase').storeCustodyRoute, true)
  assert.equal(productOwnershipEffect('update').linkAdOrigin, true)
})
