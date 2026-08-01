import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyPublicationReconciliation } from './publicationReconciliation.ts'

const ANCHOR = 'a'.repeat(64)
const COLLECTION = 'b'.repeat(64)
const attempt = { anchorTxid: ANCHOR, txid: COLLECTION }
const status = (presence: 'present' | 'absent' | 'unavailable') => ({ presence, detail: presence })
const network = (
  anchor: 'present' | 'absent' | 'unavailable',
  collection: 'present' | 'absent' | 'unavailable',
  indexed: 'present' | 'absent' | 'unavailable' = 'absent',
) => ({
  checkedAt: '2026-07-31T18:00:00.000Z',
  anchor: { txid: ANCHOR, whatsOnChain: status(anchor), gorillaPool: status(anchor) },
  collection: { txid: COLLECTION, whatsOnChain: status(collection), gorillaPool: status(indexed) },
  allReadersAbsent: anchor === 'absent' && collection === 'absent' && indexed === 'absent',
})

test('public child transaction conclusively accepts the exact batch', () => {
  const result = classifyPublicationReconciliation(
    attempt as never,
    { anchor: 'sending', collection: 'sending' },
    network('present', 'present', 'present'),
  )
  assert.equal(result.outcome, 'accepted')
  assert.equal(result.indexerOutcome, 'indexed')
})

test('two wallet accepted statuses resolve before public readers catch up', () => {
  const result = classifyPublicationReconciliation(
    attempt as never,
    { anchor: 'unproven', collection: 'completed' },
    network('absent', 'absent'),
  )
  assert.equal(result.outcome, 'accepted')
})

test('failed wallet plus exact public absence rejects without enabling retry', () => {
  const result = classifyPublicationReconciliation(
    attempt as never,
    { anchor: 'failed', collection: 'nosend' },
    network('absent', 'absent'),
  )
  assert.equal(result.outcome, 'rejected')
})

test('unavailable or incomplete evidence remains uncertain', () => {
  const result = classifyPublicationReconciliation(
    attempt as never,
    { anchor: 'unproven', collection: 'sending' },
    network('present', 'unavailable'),
  )
  assert.equal(result.outcome, 'uncertain')
})
