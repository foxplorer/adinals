import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveCollectionView, type EvidenceRecord } from './overlayViewModel.ts'

const CREATOR = '1CreatorAddressAAAAAAAAAAAAAAAAAAA'
const OWNER = '1OwnerAddressAAAAAAAAAAAAAAAAAAAAA'
const BUYER = '1BuyerAddressAAAAAAAAAAAAAAAAAAAAA'
const COLLECTION = `${'a'.repeat(64)}_0`
const MINT = `${'b'.repeat(64)}_0`
const UPDATE_TX = 'c'.repeat(64)
const UPDATE_STATE = `${UPDATE_TX}_0`
const UPDATE_RECORD = `${UPDATE_TX}_1`
const DECISION = `${'d'.repeat(64)}_0`
const LISTING = `${'e'.repeat(64)}_0`
const PURCHASE = `${'f'.repeat(64)}_0`

const record = (overrides: Partial<EvidenceRecord> & Pick<EvidenceRecord, 'outpoint' | 'recordType'>): EvidenceRecord => ({
  map: null,
  signer: '',
  owner: OWNER,
  listing: null,
  height: 900_000,
  index: 1,
  predecessor: '',
  ...overrides,
})

const collectionRecord = (map: Record<string, string> = {}): EvidenceRecord => record({
  outpoint: COLLECTION,
  recordType: 'collection',
  signer: CREATOR,
  owner: CREATOR,
  map: {
    app: 'adinals',
    type: 'ord',
    subType: 'collection',
    protocolVersion: '3',
    name: 'Billboards',
    adMax: '2',
    adFormat: 'text',
    adApproval: 'creator',
    adMaxChars: '40',
    adPlacement: 'Website',
    createdAt: '2026-01-01T00:00:00.000Z',
    subTypeData: JSON.stringify({ description: 'Finite slots', quantity: 2 }),
    ...map,
  },
})

const mintRecord = (overrides: Record<string, string> = {}, outpoint = MINT): EvidenceRecord => record({
  outpoint,
  recordType: 'collectionItem',
  signer: CREATOR,
  owner: OWNER,
  height: 900_001,
  index: 2,
  map: {
    app: 'adinals',
    type: 'ord',
    subType: 'collectionItem',
    protocolVersion: '3',
    name: 'Slot one',
    adFormat: 'text',
    adText: 'Original creative',
    adUrl: 'https://example.com/one',
    adMaxChars: '40',
    mintedAt: '2026-01-02T00:00:00.000Z',
    subTypeData: JSON.stringify({ collectionId: COLLECTION, mintNumber: 1 }),
    ...overrides,
  },
})

/** An update spends the current state at input 0 and records itself at output 1. */
const updateRecords = (
  predecessor: string,
  signer: string,
  ownerEpoch: string,
  map: Record<string, string> = {},
): EvidenceRecord[] => [
  record({
    outpoint: UPDATE_STATE,
    recordType: 'state',
    owner: signer,
    predecessor,
    height: 900_004,
    index: 5,
  }),
  record({
    outpoint: UPDATE_RECORD,
    recordType: 'adUpdate',
    signer,
    owner: signer,
    predecessor,
    height: 900_004,
    index: 5,
    map: {
      app: 'adinals',
      type: 'ord',
      subType: 'adUpdate',
      protocolVersion: '3',
      name: 'Slot one',
      collectionId: COLLECTION,
      adOrigin: MINT,
      adOutpoint: predecessor,
      ownerEpoch,
      transition: 'spend-linked-self-v1',
      adFormat: 'text',
      adText: 'Replacement creative',
      adUrl: 'https://example.com/next',
      updatedAt: '2026-01-03T00:00:00.000Z',
      ...map,
    },
  }),
]

const decisionRecord = (verdict: 'approved' | 'disapproved', ownerEpoch: string, outpoint = DECISION): EvidenceRecord =>
  record({
    outpoint,
    recordType: 'adDecision',
    signer: CREATOR,
    owner: CREATOR,
    height: 900_005,
    index: 6,
    map: {
      app: 'adinals',
      type: 'ord',
      subType: 'adDecision',
      protocolVersion: '3',
      name: 'Slot one',
      collectionId: COLLECTION,
      adOrigin: MINT,
      updateOutpoint: UPDATE_RECORD,
      adOutpoint: UPDATE_STATE,
      ownerEpoch,
      transitionTxid: UPDATE_TX,
      decision: verdict,
      reasonCode: '',
      decidedAt: '2026-01-04T00:00:00.000Z',
    },
  })

test('a collection with one mint renders its MAP fields and chain position', () => {
  const view = deriveCollectionView([collectionRecord(), mintRecord()], COLLECTION)
  assert.ok(view)
  assert.equal(view.collection.name, 'Billboards')
  assert.equal(view.collection.description, 'Finite slots')
  assert.equal(view.collection.creator, CREATOR)
  assert.equal(view.collection.max, 2)
  assert.equal(view.collection.maxChars, 40)
  assert.equal(view.collection.placement, 'Website')
  assert.equal(view.collection.expired, false)
  assert.equal(view.ads.length, 1)

  const ad = view.ads[0]!
  assert.equal(ad.origin, MINT)
  assert.equal(ad.outpoint, MINT)
  assert.equal(ad.name, 'Slot one')
  assert.equal(ad.serial, 1)
  assert.equal(ad.mintText, 'Original creative')
  assert.equal(ad.mintUrl, 'https://example.com/one')
  assert.equal(ad.mintedAt, '2026-01-02T00:00:00.000Z')
  assert.equal(ad.originHeight, 900_001)
  assert.equal(ad.originIdx, 2)
  assert.equal(ad.fromCreator, true)
  assert.equal(ad.invalidReason, '')
  assert.equal(ad.liveText, 'Original creative')
  assert.equal(ad.status, 'live')
  assert.deepEqual(ad.marketEvents, [])
  assert.equal(ad.indexPending, false)
})

test('evidence for another collection produces no view', () => {
  assert.equal(deriveCollectionView([mintRecord()], COLLECTION), null)
  assert.equal(deriveCollectionView([], COLLECTION), null)
})

test('an expired collection renders as expired without losing its ads', () => {
  const view = deriveCollectionView(
    [collectionRecord({ expiresAt: '2026-02-01T00:00:00.000Z' }), mintRecord()],
    COLLECTION,
    new Date('2026-03-01T00:00:00.000Z'),
  )
  assert.equal(view?.collection.expired, true)
  assert.equal(view?.ads.length, 1)
})

test('an unreviewed update is pending and leaves the mint creative live', () => {
  const view = deriveCollectionView(
    [collectionRecord(), mintRecord(), ...updateRecords(MINT, OWNER, MINT)],
    COLLECTION,
  )
  const ad = view?.ads[0]
  assert.equal(ad?.updates.length, 1)
  const update = ad!.updates[0]!
  assert.equal(update.outpoint, UPDATE_RECORD)
  assert.equal(update.adOutpoint, UPDATE_STATE)
  assert.equal(update.invalidReason, '')
  assert.equal(update.valid, true)
  assert.equal(update.signer, OWNER)
  assert.equal(update.createdAt, '2026-01-03T00:00:00.000Z')
  assert.equal(update.verdict, undefined)
  assert.equal(ad?.status, 'pending')
  assert.equal(ad?.liveText, 'Original creative')
  assert.equal(ad?.outpoint, UPDATE_STATE)
})

test('an approved update publishes its creative and carries the verdict', () => {
  const view = deriveCollectionView(
    [
      collectionRecord(),
      mintRecord(),
      ...updateRecords(MINT, OWNER, MINT),
      decisionRecord('approved', MINT),
    ],
    COLLECTION,
  )
  const ad = view?.ads[0]
  assert.equal(ad?.updates[0]?.verdict, 'approved')
  assert.equal(ad?.updates[0]?.verdictOutpoint, DECISION)
  assert.equal(ad?.updates[0]?.verdictAt, '2026-01-04T00:00:00.000Z')
  assert.equal(ad?.status, 'live')
  assert.equal(ad?.liveText, 'Replacement creative')
  assert.equal(ad?.liveUrl, 'https://example.com/next')
})

test('a disapproved update is rejected and the mint creative stays live', () => {
  const view = deriveCollectionView(
    [
      collectionRecord(),
      mintRecord(),
      ...updateRecords(MINT, OWNER, MINT),
      decisionRecord('disapproved', MINT),
    ],
    COLLECTION,
  )
  assert.equal(view?.ads[0]?.status, 'rejected')
  assert.equal(view?.ads[0]?.liveText, 'Original creative')
})

test('conflicting creator verdicts fail closed rather than choosing one', () => {
  const view = deriveCollectionView(
    [
      collectionRecord(),
      mintRecord(),
      ...updateRecords(MINT, OWNER, MINT),
      decisionRecord('approved', MINT),
      decisionRecord('disapproved', MINT, `${'9'.repeat(64)}_0`),
    ],
    COLLECTION,
  )
  assert.equal(view?.ads[0]?.updates[0]?.verdict, 'conflicted')
  assert.equal(view?.ads[0]?.status, 'rejected')
  assert.equal(view?.ads[0]?.liveText, 'Original creative')
})

test('an open collection publishes an owner update with no decision record', () => {
  const view = deriveCollectionView(
    [
      collectionRecord({ adApproval: 'open' }),
      mintRecord(),
      ...updateRecords(MINT, OWNER, MINT),
    ],
    COLLECTION,
  )
  assert.equal(view?.ads[0]?.status, 'live')
  assert.equal(view?.ads[0]?.liveText, 'Replacement creative')
})

test('a sale moves the owner, opens a new epoch, and invalidates the seller update', () => {
  const listing = record({
    outpoint: LISTING,
    recordType: 'listing',
    owner: OWNER,
    listing: { price: 5_000, seller: OWNER },
    predecessor: MINT,
    height: 900_002,
    index: 3,
  })
  const purchase = record({
    outpoint: PURCHASE,
    recordType: 'state',
    owner: BUYER,
    predecessor: LISTING,
    height: 900_003,
    index: 4,
  })
  const view = deriveCollectionView(
    [
      collectionRecord(),
      mintRecord(),
      listing,
      purchase,
      // Signed by the previous owner against the pre-sale epoch.
      ...updateRecords(MINT, OWNER, MINT),
    ],
    COLLECTION,
  )
  const ad = view?.ads[0]
  assert.equal(ad?.owner, BUYER)
  assert.equal(ad?.ownerEpoch, PURCHASE)
  assert.equal(ad?.outpoint, PURCHASE)
  assert.deepEqual(ad?.marketEvents.map((event) => event.kind), ['listed', 'purchased'])
  assert.equal(ad?.marketEvents[1]?.price, 5_000)
  assert.equal(ad?.updates[0]?.valid, false)
  assert.equal(ad?.liveText, 'Original creative')
})

test('a listed ad keeps its pre-lock owner and reports its price', () => {
  const view = deriveCollectionView(
    [
      collectionRecord(),
      mintRecord(),
      record({
        outpoint: LISTING,
        recordType: 'listing',
        owner: OWNER,
        listing: { price: 5_000, seller: OWNER },
        predecessor: MINT,
        height: 900_002,
        index: 3,
      }),
    ],
    COLLECTION,
  )
  assert.equal(view?.ads[0]?.owner, OWNER)
  assert.deepEqual(view?.ads[0]?.listing, { price: 5_000, seller: OWNER })
})

test('an update whose successor state is missing is unproven rather than live', () => {
  const [, updateRecord] = updateRecords(MINT, OWNER, MINT)
  const view = deriveCollectionView(
    [collectionRecord(), mintRecord(), updateRecord!],
    COLLECTION,
  )
  const update = view?.ads[0]?.updates[0]
  assert.equal(update?.valid, false)
  assert.equal(update?.invalidReason, 'update successor state is missing from the overlay evidence')
  assert.equal(view?.ads[0]?.liveText, 'Original creative')
})

test('a mint signed by someone other than the creator is not from the creator', () => {
  const view = deriveCollectionView(
    [collectionRecord(), { ...mintRecord(), signer: BUYER }],
    COLLECTION,
  )
  assert.equal(view?.ads[0]?.fromCreator, false)
  assert.equal(view?.ads[0]?.invalidReason, 'invalid creator signature')
})

test('a later claim on an occupied slot is marked duplicate', () => {
  const contested = `${'1'.repeat(64)}_0`
  const later = { ...mintRecord({}, contested), height: 900_010, index: 9 }
  const view = deriveCollectionView([collectionRecord(), later, mintRecord()], COLLECTION)
  const byOrigin = new Map(view?.ads.map((ad) => [ad.origin, ad]))
  assert.equal(byOrigin.get(MINT)?.duplicateSlot, false)
  assert.equal(byOrigin.get(contested)?.duplicateSlot, true)
})

test('ads are ordered by collection slot', () => {
  const second = `${'1'.repeat(64)}_0`
  const view = deriveCollectionView(
    [
      collectionRecord(),
      mintRecord({ subTypeData: JSON.stringify({ collectionId: COLLECTION, mintNumber: 2 }) }, second),
      mintRecord(),
    ],
    COLLECTION,
  )
  assert.deepEqual(view?.ads.map((ad) => ad.serial), [1, 2])
  assert.deepEqual(view?.ads.map((ad) => ad.origin), [MINT, second])
})
