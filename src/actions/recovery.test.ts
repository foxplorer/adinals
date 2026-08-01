import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { parseCollectionOutpoint } from './recoveryOutpoint.ts'

const txid = 'ab'.repeat(32)

test('normalizes ordinal and BRC-100 wallet outpoint forms', () => {
  assert.deepEqual(parseCollectionOutpoint(`${txid}_7`), {
    txid,
    vout: 7,
    ordinal: `${txid}_7`,
    wallet: `${txid}.7`,
  })
  assert.deepEqual(parseCollectionOutpoint(`${txid}.7`), {
    txid,
    vout: 7,
    ordinal: `${txid}_7`,
    wallet: `${txid}.7`,
  })
})

test('rejects ambiguous recovery targets', () => {
  assert.throws(() => parseCollectionOutpoint('not-an-outpoint'), /64-hex-txid/)
  assert.throws(() => parseCollectionOutpoint(`${txid}_-1`), /64-hex-txid/)
})

test('recovery source is read-only', async () => {
  const source = await readFile(new URL('./recovery.ts', import.meta.url), 'utf8')
  for (const method of ['createAction', 'signAction', 'abortAction', 'internalizeAction']) {
    assert.equal(new RegExp(`wallet\\.${method}\\s*\\(`).test(source), false)
  }
  assert.equal(/sendWith\s*:/.test(source), false)
})
