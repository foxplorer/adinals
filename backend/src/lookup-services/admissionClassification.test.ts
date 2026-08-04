import assert from 'node:assert/strict'
import test from 'node:test'
import { P2PKH, PrivateKey, Script, Transaction } from '@bsv/sdk'
import {
  classifyAgainstPredecessor,
  listingAnnotations,
  predecessorOutpointOf,
  recordScope,
  type PredecessorFacts
} from './admissionClassification.js'

const seller = PrivateKey.fromRandom()
const buyer = PrivateKey.fromRandom()
const sellerAddress = seller.toAddress()
const buyerAddress = buyer.toAddress()

const PREDECESSOR_TXID = 'a'.repeat(64)

/** A transaction spending the named outpoint at input 0, with no ancestry. */
const spendOf = (
  outpoint: string,
  outputs: Array<{ script: Script; satoshis: number }>,
  unlocking?: Script
): Transaction => {
  const tx = new Transaction()
  tx.addInput({
    sourceTXID: outpoint.slice(0, 64),
    sourceOutputIndex: Number(outpoint.slice(65)),
    ...(unlocking ? { unlockingScript: unlocking } : { unlockingScript: new Script([]) })
  })
  for (const output of outputs) {
    tx.addOutput({ lockingScript: output.script, satoshis: output.satoshis })
  }
  return tx
}

const p2pkh = (address: string): Script => new P2PKH().lock(address)

const statePredecessor = (overrides: Partial<PredecessorFacts> = {}): PredecessorFacts => ({
  txid: PREDECESSOR_TXID,
  outputIndex: 0,
  recordType: 'state',
  ownerAddress: sellerAddress,
  collectionId: 'c'.repeat(64) + '_0',
  adOrigin: 'd'.repeat(64) + '_0',
  ...overrides
})

test('input 0 gives the predecessor outpoint without any ancestry', () => {
  const tx = spendOf(`${PREDECESSOR_TXID}_0`, [{ script: p2pkh(buyerAddress), satoshis: 1 }])
  assert.equal(tx.inputs[0]?.sourceTransaction, undefined)
  assert.equal(predecessorOutpointOf(tx), `${PREDECESSOR_TXID}_0`)
})

test('a new-owner successor is a transfer and inherits the ad scope', () => {
  const predecessor = statePredecessor()
  const tx = spendOf(`${PREDECESSOR_TXID}_0`, [{ script: p2pkh(buyerAddress), satoshis: 1 }])
  const result = classifyAgainstPredecessor(tx, predecessor)
  assert.equal(result?.kind, 'transfer')
  assert.equal(result?.ownerAddress, buyerAddress)
  assert.equal(result?.collectionId, predecessor.collectionId)
  assert.equal(result?.adOrigin, predecessor.adOrigin)
  assert.equal(result?.predecessorOutpoint, `${PREDECESSOR_TXID}_0`)
})

test('a transaction that does not spend the named predecessor is refused', () => {
  const tx = spendOf(`${'b'.repeat(64)}_0`, [{ script: p2pkh(buyerAddress), satoshis: 1 }])
  assert.equal(classifyAgainstPredecessor(tx, statePredecessor()), null)
})

test('a successor that is not a one-satoshi output is refused', () => {
  const tx = spendOf(`${PREDECESSOR_TXID}_0`, [{ script: p2pkh(buyerAddress), satoshis: 1000 }])
  assert.equal(classifyAgainstPredecessor(tx, statePredecessor()), null)
})

test('a predecessor with no retained owner cannot be classified', () => {
  const predecessor = statePredecessor({ ownerAddress: undefined })
  const tx = spendOf(`${PREDECESSOR_TXID}_0`, [{ script: p2pkh(buyerAddress), satoshis: 1 }])
  assert.equal(classifyAgainstPredecessor(tx, predecessor), null)
})

test('a listing predecessor missing its retained terms is refused rather than guessed', () => {
  const predecessor = statePredecessor({
    recordType: 'listing',
    priceSatoshis: 5000
    // listingPayoutScript and listingSuffix absent
  })
  const tx = spendOf(`${PREDECESSOR_TXID}_0`, [{ script: p2pkh(buyerAddress), satoshis: 1 }])
  assert.equal(classifyAgainstPredecessor(tx, predecessor), null)
})

test('a cancellation returns the ad to the seller', () => {
  const predecessor = statePredecessor({
    recordType: 'listing',
    ownerAddress: sellerAddress,
    priceSatoshis: 5000,
    listingPayoutScript: Buffer.from(p2pkh(sellerAddress).toBinary()).toString('hex'),
    // A suffix the unlocking script below deliberately does not contain.
    listingSuffix: 'deadbeef'
  })
  const tx = spendOf(
    `${PREDECESSOR_TXID}_0`,
    [{ script: p2pkh(sellerAddress), satoshis: 1 }],
    new Script([])
  )
  const result = classifyAgainstPredecessor(tx, predecessor)
  assert.equal(result?.kind, 'cancellation')
  assert.equal(result?.ownerAddress, sellerAddress)
})

test('a seller-path spend paying someone else is refused', () => {
  const predecessor = statePredecessor({
    recordType: 'listing',
    ownerAddress: sellerAddress,
    priceSatoshis: 5000,
    listingPayoutScript: Buffer.from(p2pkh(sellerAddress).toBinary()).toString('hex'),
    listingSuffix: 'deadbeef'
  })
  const tx = spendOf(
    `${PREDECESSOR_TXID}_0`,
    [{ script: p2pkh(buyerAddress), satoshis: 1 }],
    new Script([])
  )
  assert.equal(classifyAgainstPredecessor(tx, predecessor), null)
})

test('a purchase must reproduce the retained payout exactly', () => {
  const payout = p2pkh(sellerAddress)
  const suffixHex = 'aabbcc'
  const predecessor = statePredecessor({
    recordType: 'listing',
    ownerAddress: sellerAddress,
    priceSatoshis: 5000,
    listingPayoutScript: Buffer.from(payout.toBinary()).toString('hex'),
    listingSuffix: suffixHex
  })
  const unlocking = Script.fromBinary([0xaa, 0xbb, 0xcc])

  const correct = spendOf(
    `${PREDECESSOR_TXID}_0`,
    [
      { script: p2pkh(buyerAddress), satoshis: 1 },
      { script: payout, satoshis: 5000 }
    ],
    unlocking
  )
  const result = classifyAgainstPredecessor(correct, predecessor)
  assert.equal(result?.kind, 'purchase')
  assert.equal(result?.ownerAddress, buyerAddress)

  const underpaid = spendOf(
    `${PREDECESSOR_TXID}_0`,
    [
      { script: p2pkh(buyerAddress), satoshis: 1 },
      { script: payout, satoshis: 4999 }
    ],
    unlocking
  )
  assert.equal(classifyAgainstPredecessor(underpaid, predecessor), null)

  const wrongPayee = spendOf(
    `${PREDECESSOR_TXID}_0`,
    [
      { script: p2pkh(buyerAddress), satoshis: 1 },
      { script: p2pkh(buyerAddress), satoshis: 5000 }
    ],
    unlocking
  )
  assert.equal(classifyAgainstPredecessor(wrongPayee, predecessor), null)
})

test('listing annotations round trip the terms a later spend needs', () => {
  const nonListing = listingAnnotations(p2pkh(sellerAddress))
  assert.equal(nonListing, null)
})

test('an immutable record takes its scope from its own MAP envelope', () => {
  const collectionOutpoint = `${'c'.repeat(64)}_0`
  assert.deepEqual(
    recordScope('collection', collectionOutpoint, { app: 'adinals' }),
    { collectionId: collectionOutpoint }
  )

  const mintOutpoint = `${'e'.repeat(64)}_0`
  assert.deepEqual(
    recordScope('collectionItem', mintOutpoint, {
      subTypeData: JSON.stringify({ collectionId: collectionOutpoint, mintNumber: 1 })
    }),
    { collectionId: collectionOutpoint, adOrigin: mintOutpoint }
  )

  assert.deepEqual(
    recordScope('adUpdate', `${'f'.repeat(64)}_1`, {
      collectionId: collectionOutpoint,
      adOrigin: mintOutpoint
    }),
    { collectionId: collectionOutpoint, adOrigin: mintOutpoint }
  )

  // A malformed mint still scopes to itself rather than to a guessed collection.
  assert.deepEqual(
    recordScope('collectionItem', mintOutpoint, { subTypeData: 'not json' }),
    { adOrigin: mintOutpoint }
  )

  // A bare state output names neither, and must inherit instead.
  assert.deepEqual(recordScope('state', `${'a'.repeat(64)}_0`, undefined), {})
})
