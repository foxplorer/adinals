import assert from 'node:assert/strict'
import test from 'node:test'
import { OP, P2PKH, PrivateKey, Script, Utils } from '@bsv/sdk'
import { decodeEmbeddedP2PKHScript, decodeOrdLockScript, decodeP2PKHScript } from './scriptTemplates.ts'

test('native script decoder distinguishes direct and embedded P2PKH custody', () => {
  const owner = PrivateKey.fromRandom().toAddress()
  const lock = new P2PKH().lock(owner)
  assert.equal(decodeP2PKHScript(lock)?.address, owner)

  const inscription = new Script()
  inscription.writeOpCode(OP.OP_0)
  inscription.writeOpCode(OP.OP_IF)
  inscription.writeBin(Utils.toArray('ord'))
  inscription.writeBin(lock.toBinary())
  inscription.writeOpCode(OP.OP_ENDIF)
  for (const chunk of lock.chunks) inscription.chunks.push(chunk)
  assert.equal(decodeEmbeddedP2PKHScript(inscription)?.address, owner)
  assert.equal(decodeP2PKHScript(inscription), null)
})

test('native OrdLock decoder rejects unrelated scripts', () => {
  assert.equal(decodeOrdLockScript(new P2PKH().lock(PrivateKey.fromRandom().toAddress())), null)
})

