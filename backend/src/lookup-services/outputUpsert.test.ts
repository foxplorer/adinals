import assert from 'node:assert/strict'
import test from 'node:test'
import { outputUpsert, type AdmittedOutputRecord } from './AdinalsStorage.js'

const admitted = (
  position: Partial<Pick<AdmittedOutputRecord, 'blockHeight' | 'transactionIndex'>> = {}
): AdmittedOutputRecord => ({
  txid: 'a'.repeat(64),
  outputIndex: 0,
  atomicBEEF: [1, 2, 3],
  admittedAt: new Date('2026-08-05T23:22:42.000Z'),
  recordType: 'listing',
  ...position
})

test('a mempool admission records no position', () => {
  const update = outputUpsert(admitted())
  assert.equal(update.$set, undefined)
  assert.equal('blockHeight' in update.$setOnInsert, false)
  assert.equal(update.$setOnInsert.recordType, 'listing')
})

/**
 * The row this repairs: admitted from the mempool, mined later, and resubmitted
 * with the proof. Without `$set` the height would stay absent forever and every
 * reader built on it would keep calling a mined transaction unconfirmed.
 */
test('a proven resubmission fills in the position of an existing row', () => {
  const update = outputUpsert(admitted({ blockHeight: 961_040, transactionIndex: 20_323 }))
  assert.deepEqual(update.$set, { blockHeight: 961_040, transactionIndex: 20_323 })
  assert.equal('blockHeight' in update.$setOnInsert, false)
  assert.equal('transactionIndex' in update.$setOnInsert, false)
})

test('no field is written by both halves of the update', () => {
  const update = outputUpsert(admitted({ blockHeight: 961_040 }))
  const insertKeys = new Set(Object.keys(update.$setOnInsert))
  for (const key of Object.keys(update.$set ?? {})) {
    assert.equal(insertKeys.has(key), false, `${key} would conflict`)
  }
})
