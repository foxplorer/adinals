import assert from 'node:assert/strict'
import test from 'node:test'
import { OP, P2PKH, PrivateKey, Script, Utils } from '@bsv/sdk'
import { decodeEmbeddedP2PKH, decodeP2PKH } from './scriptTemplates.js'

test('extracts the one executable P2PKH owner from an inscription script', () => {
  const owner = PrivateKey.fromRandom().toPublicKey().toAddress()
  const script = new Script()
  script.writeOpCode(OP.OP_0)
  script.writeOpCode(OP.OP_IF)
  script.writeBin(Utils.toArray('ord'))
  script.writeOpCode(OP.OP_1)
  script.writeBin(Utils.toArray('text/plain'))
  script.writeOpCode(OP.OP_0)
  script.writeBin(new P2PKH().lock(owner).toBinary())
  script.writeOpCode(OP.OP_ENDIF)
  for (const chunk of new P2PKH().lock(owner).chunks) script.chunks.push(chunk)
  script.writeOpCode(OP.OP_RETURN)
  script.writeBin(Utils.toArray('metadata'))

  assert.equal(decodeP2PKH(script), null)
  assert.equal(decodeEmbeddedP2PKH(script)?.address, owner)
})

test('rejects an inscription with multiple executable P2PKH owner locks', () => {
  const first = new P2PKH().lock(PrivateKey.fromRandom().toPublicKey().toAddress())
  const second = new P2PKH().lock(PrivateKey.fromRandom().toPublicKey().toAddress())
  const script = new Script([...first.chunks, ...second.chunks])
  assert.equal(decodeEmbeddedP2PKH(script), null)
})
