import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyPublicationError,
  classifyPublicationResponse,
  publishRecoveredCollection,
  validatePublicationReadiness,
} from './publishCollection.ts'
import type { OverlaySubmission } from '../overlay/submissionQueue.ts'

const ANCHOR = 'a'.repeat(64)
const COLLECTION = 'b'.repeat(64)
const candidate = {
  valid: true,
  actionStatus: 'nosend',
  anchorActionStatus: 'nosend',
  txid: COLLECTION,
  anchorTxid: ANCHOR,
} as Parameters<typeof validatePublicationReadiness>[0]
const preflight = {
  checkedAt: '2026-07-30T19:20:00.000Z',
  allReadersAbsent: true,
  anchor: { txid: ANCHOR },
  collection: { txid: COLLECTION },
} as Parameters<typeof validatePublicationReadiness>[1]

test('publication readiness requires a fresh exact absent preflight', () => {
  assert.doesNotThrow(() => validatePublicationReadiness(candidate, preflight, new Date('2026-07-30T19:21:00.000Z')))
  assert.throws(
    () => validatePublicationReadiness(candidate, preflight, new Date('2026-07-30T19:23:00.001Z')),
    /stale/,
  )
  assert.throws(
    () => validatePublicationReadiness(candidate, { ...preflight, allReadersAbsent: false }, new Date('2026-07-30T19:21:00.000Z')),
    /Every configured public reader/,
  )
})

test('exact unproven sendWith results mean wallet broadcast acceptance', () => {
  const result = classifyPublicationResponse([ANCHOR, COLLECTION], {
    sendWithResults: [
      { txid: ANCHOR, status: 'unproven' },
      { txid: COLLECTION, status: 'unproven' },
    ],
  })
  assert.equal(result.outcome, 'accepted')
})

test('missing or sending batch results are uncertain', () => {
  assert.equal(classifyPublicationResponse([ANCHOR, COLLECTION], {
    sendWithResults: [{ txid: ANCHOR, status: 'unproven' }],
  }).outcome, 'uncertain')
  assert.equal(classifyPublicationResponse([ANCHOR, COLLECTION], {
    sendWithResults: [
      { txid: ANCHOR, status: 'unproven' },
      { txid: COLLECTION, status: 'sending' },
    ],
  }).outcome, 'uncertain')
})

test('review errors distinguish rejection, acceptance, and ambiguity', () => {
  assert.equal(classifyPublicationError({
    reviewActionResults: [{ txid: COLLECTION, status: 'invalidTx' }],
  }).outcome, 'rejected')
  assert.equal(classifyPublicationError({
    reviewActionResults: [
      { txid: ANCHOR, status: 'success' },
      { txid: COLLECTION, status: 'success' },
    ],
  }).outcome, 'accepted')
  assert.equal(classifyPublicationError(new Error('timeout')).outcome, 'uncertain')
})

test('overlay outage cannot turn an accepted wallet broadcast into publication failure', async () => {
  const writes: OverlaySubmission[] = []
  const result = await publishRecoveredCollection(
    {
      createAction: async () => ({
        txid: COLLECTION,
        sendWithResults: [
          { txid: ANCHOR, status: 'unproven' },
          { txid: COLLECTION, status: 'unproven' },
        ],
      }),
    },
    {
      ...candidate,
      outpoint: `${COLLECTION}_0`,
      atomicBeef: [1, 2, 3],
    } as Parameters<typeof publishRecoveredCollection>[1],
    { ...preflight, checkedAt: new Date().toISOString() },
    {
      store: {
        async put(record) { writes.push(structuredClone(record)) },
        async listPending() { return [] },
      },
      client: {
        async submit() { throw new Error('overlay offline') },
        async hasOutput() { return false },
      },
    },
  )
  assert.equal(result.outcome, 'accepted')
  assert.equal(result.overlaySubmission?.status, 'retrying')
  assert.equal(writes.at(-1)?.status, 'retrying')
})
