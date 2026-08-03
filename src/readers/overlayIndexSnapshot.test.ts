import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addOverlayEvidenceToSnapshot,
  snapshotCoverage,
} from './overlayIndexSnapshot.ts'
import { emptyIndexSnapshot } from './ownershipModel.ts'
import type { EvidenceRecord } from './overlayViewModel.ts'

const COLLECTION = `${'a'.repeat(64)}_0`
const MINT = `${'b'.repeat(64)}_0`
const UPDATE_TX = 'c'.repeat(64)
const UPDATE_STATE = `${UPDATE_TX}_0`
const UPDATE_RECORD = `${UPDATE_TX}_1`
const DECISION = `${'d'.repeat(64)}_0`
const CREATOR = '1Creator'
const OWNER = '1Owner'

const record = (
  overrides: Partial<EvidenceRecord> & Pick<EvidenceRecord, 'outpoint' | 'recordType'>,
): EvidenceRecord => ({
  map: null,
  signer: '',
  owner: OWNER,
  listing: null,
  height: 900_000,
  index: 1,
  predecessor: '',
  ...overrides,
})

const evidence = (): EvidenceRecord[] => [
  record({ outpoint: COLLECTION, recordType: 'collection', signer: CREATOR, owner: CREATOR }),
  record({ outpoint: MINT, recordType: 'collectionItem', signer: CREATOR, map: { name: 'Slot one' } }),
  record({ outpoint: UPDATE_STATE, recordType: 'state', predecessor: MINT }),
  record({
    outpoint: UPDATE_RECORD,
    recordType: 'adUpdate',
    signer: OWNER,
    predecessor: MINT,
    map: { adOrigin: MINT, adOutpoint: MINT },
  }),
  record({ outpoint: DECISION, recordType: 'adDecision', signer: CREATOR, map: { updateOutpoint: UPDATE_RECORD } }),
]

test('a collection becomes an index snapshot the ownership model can read', () => {
  const snapshot = addOverlayEvidenceToSnapshot(emptyIndexSnapshot(), COLLECTION, evidence())

  assert.equal(snapshot.byOutpoint.get(COLLECTION)?.signer, CREATOR)
  assert.equal(snapshot.byOutpoint.get(MINT)?.map.name, 'Slot one')
  assert.equal(snapshot.ads.get(COLLECTION)?.length, 1)
  assert.equal(snapshot.submissions.get(COLLECTION)?.updates.length, 1)
  assert.equal(snapshot.submissions.get(COLLECTION)?.decisions.length, 1)
})

test('every state on the chain carries the ad origin it belongs to', () => {
  const snapshot = addOverlayEvidenceToSnapshot(emptyIndexSnapshot(), COLLECTION, evidence())
  assert.deepEqual(snapshot.chains.get(MINT), [MINT, UPDATE_STATE])
  assert.equal(snapshot.byOutpoint.get(UPDATE_STATE)?.origin, MINT)
  assert.equal(snapshot.byOutpoint.get(MINT)?.origin, MINT)
})

test('a spent output names the transaction that spent it', () => {
  const snapshot = addOverlayEvidenceToSnapshot(emptyIndexSnapshot(), COLLECTION, evidence())
  // The overlay states which output a record spent; the index states the reverse.
  assert.equal(snapshot.byOutpoint.get(MINT)?.spend, UPDATE_TX)
  assert.equal(snapshot.byOutpoint.get(UPDATE_STATE)?.spend, '')
})

test('an update carries a spend-linked proof taken from the same evidence', () => {
  const snapshot = addOverlayEvidenceToSnapshot(emptyIndexSnapshot(), COLLECTION, evidence())
  const proof = snapshot.transitions.get(UPDATE_RECORD)
  assert.equal(proof?.error, '')
  assert.equal(proof?.predecessorOutpoint, MINT)
  assert.equal(proof?.successorOutpoint, UPDATE_STATE)
  assert.equal(proof?.owner, OWNER)
})

test('an update whose successor is absent is unproven rather than assumed', () => {
  const partial = evidence().filter((entry) => entry.outpoint !== UPDATE_STATE)
  const snapshot = addOverlayEvidenceToSnapshot(emptyIndexSnapshot(), COLLECTION, partial)
  assert.match(snapshot.transitions.get(UPDATE_RECORD)?.error ?? '', /missing from the overlay evidence/)
})

test('several collections merge into one index', () => {
  const other = `${'e'.repeat(64)}_0`
  const snapshot = addOverlayEvidenceToSnapshot(emptyIndexSnapshot(), COLLECTION, evidence())
  addOverlayEvidenceToSnapshot(snapshot, other, [
    record({ outpoint: other, recordType: 'collection', signer: CREATOR, owner: CREATOR }),
  ])
  assert.equal(snapshot.byOutpoint.has(COLLECTION), true)
  assert.equal(snapshot.byOutpoint.has(other), true)
  assert.equal(snapshot.ads.get(other)?.length, 0)
})

test('coverage names what the overlay is missing rather than answering partially', () => {
  const snapshot = addOverlayEvidenceToSnapshot(emptyIndexSnapshot(), COLLECTION, evidence())
  assert.deepEqual(snapshotCoverage(snapshot, [MINT, UPDATE_STATE]), { covered: true, missing: [] })

  const absent = `${'9'.repeat(64)}_0`
  const result = snapshotCoverage(snapshot, [MINT, absent])
  assert.equal(result.covered, false)
  assert.deepEqual(result.missing, [absent])
})
