import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Script, Transaction, Utils } from '@bsv/sdk'
import {
  inspectAdinalsRecordScript,
  inspectAdinalsTransactionOutput
} from './recordEnvelope.js'

type PublicFixture = {
  anchorTxid: string
  map: Record<string, string>
  verification: { signerAddress: string }
  atomicBeef: { data: string }
}

const fixture = async (): Promise<PublicFixture> => JSON.parse(
  await readFile(
    '../tests/fixtures/collections/published-mainnet-yours-446af364.json',
    'utf8'
  )
) as PublicFixture

test('independently verifies the public signed v3 envelope', async () => {
  const stored = await fixture()
  const tx = Transaction.fromBEEF(Utils.toArray(stored.atomicBeef.data, 'base64'))
  const record = inspectAdinalsTransactionOutput(
    tx,
    0,
    'adinals-brc100-test'
  )

  assert.equal(record.valid, true, record.errors.join(', '))
  assert.equal(record.subType, 'collection')
  assert.equal(record.signerAddress, stored.verification.signerAddress)
  assert.deepEqual(record.map, stored.map)
})

test('the development fixture is not admitted to the production namespace', async () => {
  const stored = await fixture()
  const tx = Transaction.fromBEEF(Utils.toArray(stored.atomicBeef.data, 'base64'))
  const record = inspectAdinalsTransactionOutput(tx, 0)
  assert.equal(record.valid, false)
  assert.ok(record.errors.includes('app mismatch'))
})

test('changing signed record bytes invalidates SIGMA', async () => {
  const stored = await fixture()
  const tx = Transaction.fromBEEF(Utils.toArray(stored.atomicBeef.data, 'base64'))
  const scriptBytes = tx.outputs[0].lockingScript.toBinary()
  const needle = Utils.toArray('sdfgsdfg')
  const offset = scriptBytes.findIndex((_, index) =>
    needle.every((byte, inner) => scriptBytes[index + inner] === byte)
  )
  assert.ok(offset >= 0)
  scriptBytes[offset] = (scriptBytes[offset] as number) ^ 1

  const record = inspectAdinalsRecordScript(
    Script.fromBinary(scriptBytes),
    { txid: stored.anchorTxid, vout: 0 },
    'adinals-brc100-test'
  )
  assert.equal(record.valid, false)
  assert.ok(record.errors.includes('SIGMA signature is invalid'))
})
