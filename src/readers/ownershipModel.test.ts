import assert from 'node:assert/strict'
import test from 'node:test'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import type { IndexedAdinalsRecord } from './adinalsIndex.ts'
import type { OwnedCustody, OwnedCustodyOutput } from './custodyRouting.ts'
import {
  assembleOwnership,
  emptyIndexSnapshot,
  resolveLiveCreative,
  type AdRevision,
  type IndexSnapshot,
} from './ownershipModel.ts'

const app = ADINALS_NAMESPACE.app
const creator = 'creator-address'
const otherOwner = 'other-owner-address'
const collectionOrigin = `${'a'.repeat(64)}_0`
const adOrigin = `${'b'.repeat(64)}_0`
const updateTxid = 'c'.repeat(64)
const updateRecord = `${updateTxid}_1`
const updateState = `${updateTxid}_0`

const collectionMap = {
  app,
  type: 'ord',
  name: 'Text boards',
  subType: 'collection',
  protocolVersion: '3',
  subTypeData: JSON.stringify({ description: 'boards', quantity: 5 }),
  adMax: '5',
  adApproval: 'creator',
  adFormat: 'text',
  adMaxChars: '280',
  createdAt: '2026-07-28T17:12:16.231Z',
}

const mintMap = {
  app,
  type: 'ord',
  name: 'Ad #1',
  subType: 'collectionItem',
  protocolVersion: '3',
  subTypeData: JSON.stringify({ collectionId: collectionOrigin, mintNumber: 1 }),
  adFormat: 'text',
  adText: 'hello',
  adMaxChars: '280',
  mintedAt: '2026-07-28T17:20:00.000Z',
}

const updateMap = {
  app,
  type: 'ord',
  name: 'Ad update',
  subType: 'adUpdate',
  protocolVersion: '3',
  collectionId: collectionOrigin,
  adOrigin,
  adOutpoint: adOrigin,
  ownerEpoch: adOrigin,
  transition: 'spend-linked-self-v1',
  adFormat: 'text',
  adText: 'revised',
  updatedAt: '2026-07-28T17:30:00.000Z',
}

const custodyOutput = (
  overrides: Partial<OwnedCustodyOutput> & Pick<OwnedCustodyOutput, 'kind' | 'outpoint'>,
): OwnedCustodyOutput => ({
  walletOutpoint: overrides.outpoint.replace('_', '.'),
  txid: overrides.outpoint.split('_')[0] as string,
  vout: Number(overrides.outpoint.split('_')[1]),
  satoshis: 1,
  ownerKeyID: 'owner-key',
  signerKeyID: 'signer-key',
  derivedOwner: creator,
  scriptOwner: creator,
  signer: creator,
  map: null,
  sigmaSource: '',
  stateOutpoint: '',
  recordOutpoint: '',
  listing: null,
  spendable: true,
  tags: [],
  atomicBeef: [],
  errors: [],
  verified: true,
  ...overrides,
})

const custodyOf = (outputs: OwnedCustodyOutput[]): OwnedCustody => ({
  basket: ADINALS_NAMESPACE.basket,
  totalOutputs: outputs.length,
  outputs,
  unrecognized: 0,
  queryError: '',
})

const indexRow = (
  outpoint: string,
  origin: string,
  map: Record<string, unknown>,
  owner: string,
  signer: string,
): IndexedAdinalsRecord => ({
  outpoint,
  origin,
  owner,
  signer,
  spend: '',
  height: 900_000,
  index: 1,
  map,
  listing: null,
})

const ownedCollectionAndMint = () => custodyOf([
  custodyOutput({ kind: 'collection', outpoint: collectionOrigin, map: collectionMap }),
  custodyOutput({ kind: 'mint', outpoint: adOrigin, map: mintMap }),
])

test('a held collection and mint become My Collections and My Ads with no fixed address', () => {
  const model = assembleOwnership(ownedCollectionAndMint(), emptyIndexSnapshot())
  assert.equal(model.collections.length, 1)
  assert.equal(model.collections[0]?.origin, collectionOrigin)
  assert.equal(model.collections[0]?.mine, true)
  assert.equal(model.collections[0]?.valid, true)
  assert.equal(model.collections[0]?.evidence, 'wallet-custody')

  assert.equal(model.ads.length, 1)
  assert.equal(model.ads[0]?.origin, adOrigin)
  assert.equal(model.ads[0]?.collectionId, collectionOrigin)
  assert.equal(model.ads[0]?.valid, true)
  assert.equal(model.ads[0]?.mine, true)
})

test('a basket output spent by another wallet is provenance, not current ownership', () => {
  const buyerState = `${'d'.repeat(64)}_0`
  const snapshot = emptyIndexSnapshot()
  snapshot.chains.set(adOrigin, [adOrigin, buyerState])
  const model = assembleOwnership(ownedCollectionAndMint(), snapshot)

  assert.equal(model.collections.length, 1)
  assert.equal(model.ads.length, 0)
})

test('an exact indexed spend overrides a stale wallet spendable flag', () => {
  const snapshot = emptyIndexSnapshot()
  snapshot.byOutpoint.set(adOrigin, {
    ...indexRow(adOrigin, adOrigin, mintMap, creator, creator),
    spend: 'd'.repeat(64),
  })
  const model = assembleOwnership(ownedCollectionAndMint(), snapshot)

  assert.equal(model.collections.length, 1)
  assert.equal(model.ads.length, 0)
})

test('an explicitly unspendable basket output is not an owned ad', () => {
  const custody = custodyOf([
    custodyOutput({ kind: 'collection', outpoint: collectionOrigin, map: collectionMap }),
    custodyOutput({ kind: 'mint', outpoint: adOrigin, map: mintMap, spendable: false }),
  ])
  assert.equal(assembleOwnership(custody, emptyIndexSnapshot()).ads.length, 0)
})

test('a record that fails local verification is never counted as valid', () => {
  // The wallet says it holds it; the bytes say otherwise. Custody is evidence
  // of holding, not of protocol validity.
  const custody = custodyOf([
    custodyOutput({
      kind: 'collection',
      outpoint: collectionOrigin,
      map: collectionMap,
      verified: false,
      errors: ['record does not lock to the wallet-derived owner'],
    }),
  ])
  const model = assembleOwnership(custody, emptyIndexSnapshot())
  assert.equal(model.collections[0]?.valid, false)
  assert.match(model.collections[0]?.error ?? '', /wallet-derived owner/)
  assert.equal(model.notices.length, 1)
})

test('an update state and its record in one transaction count as one ad', () => {
  const custody = custodyOf([
    custodyOutput({ kind: 'collection', outpoint: collectionOrigin, map: collectionMap }),
    custodyOutput({ kind: 'mint', outpoint: adOrigin, map: mintMap }),
    custodyOutput({
      kind: 'state',
      outpoint: updateState,
      recordOutpoint: updateRecord,
      map: null,
    }),
    custodyOutput({
      kind: 'update',
      outpoint: updateRecord,
      stateOutpoint: updateState,
      map: { ...updateMap, adOrigin },
    }),
  ])
  const model = assembleOwnership(custody, emptyIndexSnapshot())
  // The mint and the update state are the same ad, seen at two locations.
  assert.equal(model.ads.length, 1)
  assert.equal(model.ads[0]?.origin, adOrigin)
})

const thirdPartyUpdateSnapshot = (
  overrides: { decisions?: IndexedAdinalsRecord[]; chain?: string[]; transition?: unknown } = {},
): IndexSnapshot => {
  const snapshot = emptyIndexSnapshot()
  snapshot.byOutpoint.set(adOrigin, indexRow(adOrigin, adOrigin, mintMap, otherOwner, creator))
  snapshot.submissions.set(collectionOrigin, {
    updates: [indexRow(updateRecord, updateRecord, updateMap, otherOwner, otherOwner)],
    decisions: overrides.decisions ?? [],
  })
  snapshot.chains.set(adOrigin, overrides.chain ?? [adOrigin, updateState])
  if (overrides.transition !== null) {
    snapshot.transitions.set(updateRecord, (overrides.transition ?? {
      error: '',
      predecessorOutpoint: adOrigin,
      successorOutpoint: updateState,
      recordOutpoint: updateRecord,
      owner: otherOwner,
    }) as never)
  }
  return snapshot
}

test('discovers another owner’s update to my collection as a pending approval', () => {
  // This update can never appear in the creator's own basket, so it is only
  // reachable through the collectionId index query.
  const custody = custodyOf([
    custodyOutput({ kind: 'collection', outpoint: collectionOrigin, map: collectionMap }),
  ])
  const model = assembleOwnership(custody, thirdPartyUpdateSnapshot())
  assert.equal(model.pendingApprovals.length, 1)
  assert.equal(model.pendingApprovals[0]?.revision.outpoint, updateRecord)
  assert.equal(model.pendingApprovals[0]?.revision.signer, otherOwner)
  assert.equal(model.pendingApprovals[0]?.ad.mine, false)
  assert.equal(model.pendingApprovals[0]?.ad.origin, adOrigin)
})

test('an update already carrying a valid decision is not pending', () => {
  const decision = indexRow(
    `${'d'.repeat(64)}_0`,
    `${'d'.repeat(64)}_0`,
    {
      app,
      type: 'ord',
      name: 'Ad decision',
      subType: 'adDecision',
      protocolVersion: '3',
      collectionId: collectionOrigin,
      adOrigin,
      updateOutpoint: updateRecord,
      adOutpoint: updateState,
      ownerEpoch: adOrigin,
      transitionTxid: updateTxid,
      revisionOutpoint: updateRecord,
      decision: 'approved',
      reasonCode: 'meets-policy',
      decidedAt: '2026-07-28T17:40:00.000Z',
    },
    creator,
    creator,
  )
  const custody = custodyOf([
    custodyOutput({ kind: 'collection', outpoint: collectionOrigin, map: collectionMap }),
  ])
  const model = assembleOwnership(custody, thirdPartyUpdateSnapshot({ decisions: [decision] }))
  assert.equal(model.pendingApprovals.length, 0)
})

test('a creator-signed update is self-approved by address equality, never pending', () => {
  // The original v3 reader publishes a creator's own update without an
  // adDecision. A BRC-100 self-mint must reproduce that exactly.
  const snapshot = thirdPartyUpdateSnapshot()
  snapshot.submissions.set(collectionOrigin, {
    updates: [indexRow(updateRecord, updateRecord, updateMap, creator, creator)],
    decisions: [],
  })
  const custody = custodyOf([
    custodyOutput({ kind: 'collection', outpoint: collectionOrigin, map: collectionMap }),
  ])
  const model = assembleOwnership(custody, snapshot)
  assert.equal(model.pendingApprovals.length, 0)
})

test('an update with no independently proven spend is rejected, not approved', () => {
  // Fail closed: without raw-transaction proof of the spend, the creator must
  // not be shown something to sign.
  const custody = custodyOf([
    custodyOutput({ kind: 'collection', outpoint: collectionOrigin, map: collectionMap }),
  ])
  const model = assembleOwnership(custody, thirdPartyUpdateSnapshot({ transition: null }))
  assert.equal(model.pendingApprovals.length, 0)
})

test('an update outside the reconstructed spend chain is rejected', () => {
  // The chain is rebuilt from the ad's origin. An update naming outpoints that
  // are not on it must not be able to vouch for itself.
  const custody = custodyOf([
    custodyOutput({ kind: 'collection', outpoint: collectionOrigin, map: collectionMap }),
  ])
  const model = assembleOwnership(custody, thirdPartyUpdateSnapshot({ chain: [adOrigin] }))
  assert.equal(model.pendingApprovals.length, 0)
})

test('an open-publishing collection never produces approvals', () => {
  const custody = custodyOf([
    custodyOutput({
      kind: 'collection',
      outpoint: collectionOrigin,
      map: { ...collectionMap, adApproval: 'open' },
    }),
  ])
  const model = assembleOwnership(custody, thirdPartyUpdateSnapshot())
  assert.equal(model.pendingApprovals.length, 0)
})

test('an expired collection stops accepting approvals', () => {
  const custody = custodyOf([
    custodyOutput({
      kind: 'collection',
      outpoint: collectionOrigin,
      map: { ...collectionMap, expiresAt: '2026-07-29T00:00:00.000Z' },
    }),
  ])
  const model = assembleOwnership(
    custody,
    thirdPartyUpdateSnapshot(),
    new Date('2026-07-31T00:00:00.000Z'),
  )
  assert.equal(model.collections[0]?.expired, true)
  assert.equal(model.pendingApprovals.length, 0)
})

test('two mints claiming one slot: the published one wins, the no-send one is a duplicate', () => {
  // Exactly the live case: two creator-signed mints both claiming slot 1. The
  // unconfirmed one has no chain position and must not displace the mined one.
  const noSendMint = `${'d'.repeat(64)}_0`
  const custody = custodyOf([
    custodyOutput({ kind: 'collection', outpoint: collectionOrigin, map: collectionMap }),
    custodyOutput({ kind: 'mint', outpoint: adOrigin, map: mintMap }),
    custodyOutput({ kind: 'mint', outpoint: noSendMint, map: mintMap }),
  ])
  const snapshot = emptyIndexSnapshot()
  snapshot.byOutpoint.set(adOrigin, indexRow(adOrigin, adOrigin, mintMap, creator, creator))

  const model = assembleOwnership(custody, snapshot)
  const published = model.ads.find((ad) => ad.origin === adOrigin)
  const unconfirmed = model.ads.find((ad) => ad.origin === noSendMint)

  assert.equal(published?.serial, 1)
  assert.equal(published?.duplicateSlot, false)
  assert.equal(unconfirmed?.duplicateSlot, true)
  // Both remain visible and manageable: they are real ordinals.
  assert.equal(model.ads.length, 2)
})

test('a single claim to a slot is never marked duplicate', () => {
  const model = assembleOwnership(ownedCollectionAndMint(), emptyIndexSnapshot())
  assert.equal(model.ads[0]?.duplicateSlot, false)
  assert.equal(model.ads[0]?.serial, 1)
})

test('an unheld duplicate discovered in the index still displaces a later local mint', () => {
  // The winning claim need not be in this wallet's basket at all.
  const localMint = `${'e'.repeat(64)}_0`
  const foreignMint = `${'f'.repeat(64)}_0`
  const custody = custodyOf([
    custodyOutput({ kind: 'collection', outpoint: collectionOrigin, map: collectionMap }),
    custodyOutput({ kind: 'mint', outpoint: localMint, map: mintMap }),
  ])
  const snapshot = emptyIndexSnapshot()
  snapshot.ads.set(collectionOrigin, [
    indexRow(foreignMint, foreignMint, mintMap, otherOwner, creator),
  ])

  const model = assembleOwnership(custody, snapshot)
  // The indexed foreign mint has a block height; the local one does not.
  assert.equal(model.ads.find((ad) => ad.origin === localMint)?.duplicateSlot, true)
})

test('an ad whose collection this wallet does not hold is reported, not silently valid', () => {
  const custody = custodyOf([custodyOutput({ kind: 'mint', outpoint: adOrigin, map: mintMap })])
  const model = assembleOwnership(custody, emptyIndexSnapshot())
  assert.equal(model.ads.length, 1)
  assert.equal(model.ads[0]?.valid, false)
  assert.match(model.ads[0]?.error ?? '', /collection for this ad is not held/)
})

const revision = (overrides: Partial<AdRevision> = {}): AdRevision => ({
  outpoint: updateRecord,
  stateOutpoint: updateState,
  signer: otherOwner,
  valid: true,
  error: '',
  evidence: 'public-index',
  selfApproved: false,
  verdict: null,
  decisionOutpoint: '',
  map: { adText: 'revised' },
  ...overrides,
})

test('the mint creative stands until a publishable update replaces it', () => {
  const live = resolveLiveCreative({ adText: 'original', adUrl: 'https://a.example' }, [], 'creator')
  assert.deepEqual(live, { text: 'original', url: 'https://a.example', status: 'live' })
})

test('an unapproved update is pending and does not change what is displayed', () => {
  // The owner should see their change is awaiting review, while viewers keep
  // seeing the approved creative.
  const live = resolveLiveCreative({ adText: 'original' }, [revision()], 'creator')
  assert.equal(live.text, 'original')
  assert.equal(live.status, 'pending')
})

test('an approved update becomes the live creative', () => {
  const live = resolveLiveCreative({ adText: 'original' }, [revision({ verdict: 'approved' })], 'creator')
  assert.equal(live.text, 'revised')
  assert.equal(live.status, 'live')
})

test('a creator-signed update publishes without any decision record', () => {
  const live = resolveLiveCreative({ adText: 'original' }, [revision({ selfApproved: true })], 'creator')
  assert.equal(live.text, 'revised')
  assert.equal(live.status, 'live')
})

test('a rejected update is reported and the previous creative is retained', () => {
  const live = resolveLiveCreative({ adText: 'original' }, [revision({ verdict: 'disapproved' })], 'creator')
  assert.equal(live.text, 'original')
  assert.equal(live.status, 'rejected')
})

test('an open collection publishes any valid update without a decision', () => {
  const live = resolveLiveCreative({ adText: 'original' }, [revision()], 'open')
  assert.equal(live.text, 'revised')
  assert.equal(live.status, 'live')
})

test('invalid updates are skipped entirely when resolving the creative', () => {
  const live = resolveLiveCreative({ adText: 'original' }, [
    revision({ valid: false, verdict: 'approved', map: { adText: 'forged' } }),
  ], 'creator')
  assert.equal(live.text, 'original')
  assert.equal(live.status, 'live')
})

test('the newest publishable update wins over an older one', () => {
  const live = resolveLiveCreative({ adText: 'original' }, [
    revision({ verdict: 'approved', map: { adText: 'first' } }),
    revision({ outpoint: `${'9'.repeat(64)}_1`, verdict: 'approved', map: { adText: 'second' } }),
  ], 'creator')
  assert.equal(live.text, 'second')
})
