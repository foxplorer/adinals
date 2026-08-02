import assert from 'node:assert/strict'
import test from 'node:test'
import { P2PKH, PrivateKey, Script, Transaction } from '@bsv/sdk'
import type { AdmittedOutputRecord } from './AdinalsStorage.js'
import {
  resolveAdCurrent,
  resolveAdHistory,
  resolveCollectionLiveEvidence,
  resolveCollectionProjectionEvidence,
  resolvePendingDecisionEvidence
} from './lifecycleResolution.js'

const creator = PrivateKey.fromRandom()
const buyer = PrivateKey.fromRandom()
const creatorAddress = creator.toPublicKey().toAddress()
const buyerAddress = buyer.toPublicKey().toAddress()

const mintTx = new Transaction()
mintTx.addOutput({
  satoshis: 1,
  lockingScript: new P2PKH().lock(creatorAddress)
})

const transferTx = new Transaction()
transferTx.addInput({
  sourceTransaction: mintTx,
  sourceOutputIndex: 0,
  unlockingScript: new Script()
})
transferTx.addOutput({
  satoshis: 1,
  lockingScript: new P2PKH().lock(buyerAddress)
})

const updateTx = new Transaction()
updateTx.addInput({
  sourceTransaction: transferTx,
  sourceOutputIndex: 0,
  unlockingScript: new Script()
})
updateTx.addOutput({
  satoshis: 1,
  lockingScript: new P2PKH().lock(buyerAddress)
})
updateTx.addOutput({ satoshis: 1, lockingScript: new Script() })

const collectionTxid = 'a'.repeat(64)
const collectionId = `${collectionTxid}_0`
const origin = `${mintTx.id('hex')}_0`
const ownerEpoch = `${transferTx.id('hex')}_0`
const updateOutpoint = `${updateTx.id('hex')}_1`

const base = (
  txid: string,
  outputIndex: number,
  atomicBEEF: number[]
): AdmittedOutputRecord => ({
  txid,
  outputIndex,
  atomicBEEF,
  admittedAt: new Date('2026-08-01T00:00:00.000Z')
})

const records = (): AdmittedOutputRecord[] => [
  {
    ...base(collectionTxid, 0, mintTx.toBEEF()),
    recordType: 'collection',
    signerAddress: creatorAddress,
    map: {
      subType: 'collection',
      adFormat: 'text',
      adApproval: 'creator',
      adMax: '1',
      adMaxChars: '16'
    }
  },
  {
    ...base(mintTx.id('hex'), 0, mintTx.toBEEF()),
    recordType: 'collectionItem',
    signerAddress: creatorAddress,
    ownerAddress: creatorAddress,
    spentByTxid: transferTx.id('hex'),
    map: {
      subType: 'collectionItem',
      subTypeData: JSON.stringify({ collectionId, mintNumber: 1 }),
      adFormat: 'text',
      adMaxChars: '16',
      adText: 'mint'
    }
  },
  {
    ...base(transferTx.id('hex'), 0, transferTx.toBEEF()),
    recordType: 'state',
    ownerAddress: buyerAddress,
    spentByTxid: updateTx.id('hex')
  },
  {
    ...base(updateTx.id('hex'), 0, updateTx.toBEEF()),
    recordType: 'state',
    ownerAddress: buyerAddress
  },
  {
    ...base(updateTx.id('hex'), 1, updateTx.toBEEF()),
    recordType: 'adUpdate',
    signerAddress: buyerAddress,
    map: {
      subType: 'adUpdate',
      collectionId,
      adOrigin: origin,
      adOutpoint: ownerEpoch,
      ownerEpoch,
      transition: 'spend-linked-self-v1',
      adFormat: 'text',
      adText: 'updated'
    }
  },
  {
    ...base('b'.repeat(64), 0, mintTx.toBEEF()),
    recordType: 'adDecision',
    signerAddress: creatorAddress,
    map: {
      subType: 'adDecision',
      collectionId,
      adOrigin: origin,
      updateOutpoint,
      revisionOutpoint: updateOutpoint,
      transitionTxid: updateTx.id('hex'),
      adOutpoint: `${updateTx.id('hex')}_0`,
      ownerEpoch,
      decision: 'approved'
    }
  }
]

test('resolves a transfer, update, and creator decision by exact spend links', () => {
  const history = resolveAdHistory(records(), origin)
  assert.ok(history)
  assert.equal(history.current.txid, updateTx.id('hex'))
  assert.equal(history.currentOwner, buyerAddress)
  assert.equal(history.ownerEpoch, ownerEpoch)
  assert.deepEqual(history.states.map((record) => `${record.txid}_${record.outputIndex}`), [
    origin,
    ownerEpoch,
    `${updateTx.id('hex')}_0`
  ])
  assert.deepEqual(history.updates.map((record) => `${record.txid}_${record.outputIndex}`), [
    updateOutpoint
  ])
  assert.equal(history.decisions.length, 1)
  const current = resolveAdCurrent(history, new Date('2026-08-01T00:00:00.000Z'))
  assert.equal(`${current.creative.txid}_${current.creative.outputIndex}`, updateOutpoint)
  assert.equal(current.decision?.map?.decision, 'approved')
  assert.equal(current.displayEligible, true)
})

test('quarantines conflicting creator verdicts for one update', () => {
  const candidates = records()
  candidates.push({
    ...candidates.at(-1) as AdmittedOutputRecord,
    txid: 'c'.repeat(64),
    map: { ...candidates.at(-1)?.map, decision: 'disapproved' } as Record<string, string>
  })
  const history = resolveAdHistory(candidates, origin)
  assert.ok(history)
  assert.equal(history.decisions.length, 0)
  assert.equal(resolveAdCurrent(history).creative.recordType, 'collectionItem')
})

test('an open collection does not require a creator decision', () => {
  const candidates = records().filter((record) => record.recordType !== 'adDecision')
  const collection = candidates.find((record) => record.recordType === 'collection')
  assert.ok(collection?.map)
  collection.map.adApproval = 'open'
  const history = resolveAdHistory(candidates, origin)
  assert.ok(history)
  assert.equal(resolveAdCurrent(history).creative.recordType, 'adUpdate')
})

test('a disapproved reviewed update leaves the mint creative live', () => {
  const candidates = records()
  const decision = candidates.find((record) => record.recordType === 'adDecision')
  assert.ok(decision?.map)
  decision.map.decision = 'disapproved'
  const history = resolveAdHistory(candidates, origin)
  assert.ok(history)
  assert.equal(history.decisions.length, 1)
  assert.equal(resolveAdCurrent(history).creative.recordType, 'collectionItem')
})

test('a later ownership epoch resets live creative to the mint', () => {
  const candidates = records()
  const nextOwner = PrivateKey.fromRandom()
  const nextOwnerAddress = nextOwner.toPublicKey().toAddress()
  const postUpdateState = candidates.find((record) =>
    record.txid === updateTx.id('hex') && record.outputIndex === 0
  )
  assert.ok(postUpdateState)
  const sale = new Transaction()
  sale.addInput({
    sourceTransaction: updateTx,
    sourceOutputIndex: 0,
    unlockingScript: new Script()
  })
  sale.addOutput({
    satoshis: 1,
    lockingScript: new P2PKH().lock(nextOwnerAddress)
  })
  postUpdateState.spentByTxid = sale.id('hex')
  candidates.push({
    ...base(sale.id('hex'), 0, sale.toBEEF()),
    recordType: 'state',
    ownerAddress: nextOwnerAddress
  })
  const history = resolveAdHistory(candidates, origin)
  assert.ok(history)
  assert.equal(history.ownerEpoch, `${sale.id('hex')}_0`)
  assert.equal(history.currentOwner, nextOwnerAddress)
  assert.equal(resolveAdCurrent(history).creative.recordType, 'collectionItem')
})

test('expiration ends display eligibility without deleting current state', () => {
  const candidates = records()
  const collection = candidates.find((record) => record.recordType === 'collection')
  assert.ok(collection?.map)
  collection.map.expiresAt = '2026-08-02T00:00:00.000Z'
  const history = resolveAdHistory(candidates, origin)
  assert.ok(history)
  const current = resolveAdCurrent(history, new Date('2026-08-03T00:00:00.000Z'))
  assert.equal(current.displayEligible, false)
  assert.equal(current.creative.recordType, 'adUpdate')
})

test('collection live evidence contains the complete verifiable current chain', () => {
  const evidence = resolveCollectionLiveEvidence(
    records(),
    collectionId,
    new Date('2026-08-01T00:00:00.000Z')
  )
  assert.deepEqual(evidence.map((record) => `${record.txid}_${record.outputIndex}`), [
    collectionId,
    origin,
    ownerEpoch,
    `${updateTx.id('hex')}_0`,
    updateOutpoint,
    `${'b'.repeat(64)}_0`
  ])
})

test('projection evidence keeps an expired collection that live evidence drops', () => {
  const candidates = records()
  const collection = candidates.find((record) => record.recordType === 'collection')
  assert.ok(collection?.map)
  collection.map.expiresAt = '2026-08-02T00:00:00.000Z'
  const after = new Date('2026-08-03T00:00:00.000Z')

  // Display eligibility ends at expiry, so live evidence returns the collection
  // alone while a projection still has to describe every ad it contains.
  assert.deepEqual(
    resolveCollectionLiveEvidence(candidates, collectionId, after)
      .map((record) => `${record.txid}_${record.outputIndex}`),
    [collectionId]
  )
  const projection = resolveCollectionProjectionEvidence(candidates, collectionId)
    .map((record) => `${record.txid}_${record.outputIndex}`)
  assert.equal(projection[0], collectionId)
  assert.ok(projection.includes(origin))
  assert.ok(projection.includes(updateOutpoint))
  assert.ok(projection.length > 1)
})

test('projection evidence is independent of the moment it is asked', () => {
  const first = resolveCollectionProjectionEvidence(records(), collectionId)
  const second = resolveCollectionProjectionEvidence(records(), collectionId)
  assert.deepEqual(
    first.map((record) => `${record.txid}_${record.outputIndex}`),
    second.map((record) => `${record.txid}_${record.outputIndex}`)
  )
})

test('an unknown collection projects nothing rather than guessing', () => {
  assert.deepEqual(resolveCollectionProjectionEvidence(records(), `${'f'.repeat(64)}_0`), [])
})

test('pending decision evidence includes undecided current-epoch owner updates only', () => {
  const undecided = records().filter((record) => record.recordType !== 'adDecision')
  const pending = resolvePendingDecisionEvidence(
    undecided,
    creatorAddress,
    new Date('2026-08-01T00:00:00.000Z')
  )
  assert.deepEqual(pending.map((record) => `${record.txid}_${record.outputIndex}`), [
    collectionId,
    origin,
    ownerEpoch,
    `${updateTx.id('hex')}_0`,
    updateOutpoint
  ])
  assert.deepEqual(resolvePendingDecisionEvidence(records(), creatorAddress), [])
})
