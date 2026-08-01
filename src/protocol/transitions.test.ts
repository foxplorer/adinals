import assert from 'node:assert/strict'
import test from 'node:test'
import { parseProtocolOutpoint } from './transitions.ts'

test('transition outpoints normalize wallet and ordinal separators', () => {
  const txid = 'a'.repeat(64)
  assert.deepEqual(parseProtocolOutpoint(`${txid}.1`), { txid, vout: 1, normalized: `${txid}_1` })
  assert.deepEqual(parseProtocolOutpoint(`${txid}_0`), { txid, vout: 0, normalized: `${txid}_0` })
  assert.equal(parseProtocolOutpoint('invalid'), null)
})
