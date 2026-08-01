import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BSM,
  BigNumber,
  OP,
  P2PKH,
  PrivateKey,
  Script,
  Signature,
  Transaction,
  Utils
} from '@bsv/sdk'
import AdinalsTopicManager from './AdinalsTopicManager.js'
import { sigmaMessageHash } from '../protocol/recordEnvelope.js'

const productionRecordBeef = (
  map: Record<string, string>,
  content = map.name,
  contentType = 'text/plain;charset=utf-8'
): number[] => {
  const signer = PrivateKey.fromRandom()
  const anchor = new Transaction()
  anchor.addOutput({
    satoshis: 200,
    lockingScript: new P2PKH().lock(signer.toPublicKey().toAddress())
  })

  const unsigned = new Script()
  unsigned.writeOpCode(OP.OP_0)
  unsigned.writeOpCode(OP.OP_IF)
  unsigned.writeBin(Utils.toArray('ord'))
  unsigned.writeOpCode(OP.OP_1)
  unsigned.writeBin(Utils.toArray(contentType))
  unsigned.writeOpCode(OP.OP_0)
  unsigned.writeBin(Utils.toArray(content))
  unsigned.writeOpCode(OP.OP_ENDIF)
  for (const chunk of new P2PKH().lock(signer.toPublicKey().toAddress()).chunks) {
    unsigned.chunks.push(chunk)
  }
  unsigned.writeOpCode(OP.OP_RETURN)
  unsigned.writeBin(Utils.toArray('1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5'))
  unsigned.writeBin(Utils.toArray('SET'))
  for (const [key, value] of Object.entries(map)) {
    unsigned.writeBin(Utils.toArray(key))
    unsigned.writeBin(Utils.toArray(value))
  }

  const messageHash = sigmaMessageHash(unsigned, {
    txid: anchor.id('hex'),
    vout: 0
  })
  const directHash = BSM.magicHash(messageHash)
  const signature = BSM.sign(messageHash, signer, 'raw') as Signature
  const recovery = signature.CalculateRecoveryFactor(
    signer.toPublicKey(),
    new BigNumber(directHash)
  )
  const sigma = new Script()
  sigma.writeBin(Utils.toArray('|'))
  sigma.writeBin(Utils.toArray('SIGMA'))
  sigma.writeBin(Utils.toArray('BSM'))
  sigma.writeBin(Utils.toArray(signer.toPublicKey().toAddress()))
  sigma.writeBin(signature.toCompact(recovery, true) as number[])
  sigma.writeBin(Utils.toArray('0'))
  const signed = Script.fromBinary(unsigned.toBinary().concat(sigma.toBinary()))

  const tx = new Transaction()
  tx.addInput({
    sourceTransaction: anchor,
    sourceOutputIndex: 0,
    unlockingScript: new Script(),
    sequence: 0xffffffff
  })
  tx.addOutput({ satoshis: 1, lockingScript: signed })
  return tx.toBEEF()
}

const productionCollectionBeef = (
  overrides: Record<string, string> = {}
): number[] => productionRecordBeef({
    app: 'adinals',
    type: 'ord',
    name: 'Overlay test collection',
    subType: 'collection',
    protocolVersion: '3',
    subTypeData: JSON.stringify({ description: 'Synthetic vector', quantity: 2 }),
    adMax: '2',
    adApproval: 'creator',
    adContentPolicy: 'family-friendly',
    adFormat: 'text',
    adMaxChars: '32',
    createdAt: '2026-08-01T19:00:00.000Z',
    ...overrides
  })

const productionMintBeef = (
  overrides: Record<string, string> = {}
): number[] => productionRecordBeef({
  app: 'adinals',
  type: 'ord',
  name: 'Ad #1',
  subType: 'collectionItem',
  protocolVersion: '3',
  subTypeData: JSON.stringify({
    collectionId: `${'a'.repeat(64)}_0`,
    mintNumber: 1
  }),
  adFormat: 'text',
  adText: 'hello agents',
  adMaxChars: '32',
  adUrl: 'https://example.com/',
  mintedAt: '2026-08-01T19:01:00.000Z',
  ...overrides
})

test('malformed BEEF fails closed', async () => {
  const manager = new AdinalsTopicManager()
  assert.deepEqual(await manager.identifyAdmissibleOutputs([0, 1, 2, 3], []), {
    outputsToAdmit: [],
    coinsToRetain: []
  })
})

test('an unrelated valid transaction is not admitted', async () => {
  const privateKey = PrivateKey.fromRandom()
  const tx = new Transaction()
  tx.addOutput({
    satoshis: 1,
    lockingScript: new P2PKH().lock(privateKey.toPublicKey().toAddress())
  })

  const manager = new AdinalsTopicManager()
  await assert.rejects(
    manager.identifyAdmissibleOutputs(tx.toBEEF(), []),
    /no admissible Adinals evidence/
  )
})

test('topical predecessors are retained even when no successor is admitted', async () => {
  const privateKey = PrivateKey.fromRandom()
  const source = new Transaction()
  source.addOutput({
    satoshis: 1,
    lockingScript: new P2PKH().lock(privateKey.toPublicKey().toAddress())
  })
  const tx = new Transaction()
  tx.addInput({
    sourceTransaction: source,
    sourceOutputIndex: 0,
    unlockingScript: new Script()
  })
  tx.addOutput({
    satoshis: 2,
    lockingScript: new Script()
  })
  const manager = new AdinalsTopicManager()
  assert.deepEqual(
    await manager.identifyAdmissibleOutputs(tx.toBEEF(), [0]),
    { outputsToAdmit: [], coinsToRetain: [0] }
  )
})

test('a topical spend without its source transaction is refused for an enriched retry', async () => {
  const tx = new Transaction()
  tx.addInput({
    sourceTXID: 'a'.repeat(64),
    sourceOutputIndex: 0,
    unlockingScript: new Script()
  })
  tx.addOutput({ satoshis: 1, lockingScript: new Script() })
  await assert.rejects(
    new AdinalsTopicManager().identifyAdmissibleOutputs(tx.toBEEF(), [0]),
    /missing its source transaction/
  )
})

test('an input-0-linked one-satoshi P2PKH transfer is admitted', async () => {
  const oldOwner = PrivateKey.fromRandom()
  const newOwner = PrivateKey.fromRandom()
  const source = new Transaction()
  source.addOutput({
    satoshis: 1,
    lockingScript: new P2PKH().lock(oldOwner.toPublicKey().toAddress())
  })
  const tx = new Transaction()
  tx.addInput({
    sourceTransaction: source,
    sourceOutputIndex: 0,
    unlockingScript: new Script()
  })
  tx.addOutput({
    satoshis: 1,
    lockingScript: new P2PKH().lock(newOwner.toPublicKey().toAddress())
  })
  assert.deepEqual(
    await new AdinalsTopicManager().identifyAdmissibleOutputs(tx.toBEEF(), [0]),
    { outputsToAdmit: [0], coinsToRetain: [0] }
  )
})

test('a signed production collection with valid permanent rules is admitted', async () => {
  const manager = new AdinalsTopicManager()
  assert.deepEqual(
    await manager.identifyAdmissibleOutputs(productionCollectionBeef(), []),
    { outputsToAdmit: [0], coinsToRetain: [] }
  )
})

test('a large inscribed collection is parsed without overflowing the argument stack', async () => {
  const beef = productionRecordBeef({
    app: 'adinals',
    type: 'ord',
    name: 'Large image collection',
    subType: 'collection',
    protocolVersion: '3',
    subTypeData: JSON.stringify({ description: 'Large cover vector', quantity: 2 }),
    adMax: '2',
    adApproval: 'creator',
    adFormat: 'image',
    adImageProfile: 'image-2x1-v1',
    createdAt: '2026-08-01T19:00:00.000Z'
  }, 'x'.repeat(150_000), 'image/png')

  assert.deepEqual(
    await new AdinalsTopicManager().identifyAdmissibleOutputs(beef, []),
    { outputsToAdmit: [0], coinsToRetain: [] }
  )
})

test('wrong namespace and invalid collection rules fail closed', async () => {
  const manager = new AdinalsTopicManager()
  await assert.rejects(
    manager.identifyAdmissibleOutputs(
      productionCollectionBeef({ app: 'not-adinals' }),
      []
    ),
    /no admissible Adinals evidence/
  )
  await assert.rejects(
    manager.identifyAdmissibleOutputs(
      productionCollectionBeef({ adMax: '0' }),
      []
    ),
    /no admissible Adinals evidence/
  )
})

test('a signed locally valid mint candidate is admitted', async () => {
  const manager = new AdinalsTopicManager()
  assert.deepEqual(
    await manager.identifyAdmissibleOutputs(productionMintBeef(), []),
    { outputsToAdmit: [0], coinsToRetain: [] }
  )
})

test('malformed mint candidates fail closed', async () => {
  const manager = new AdinalsTopicManager()
  await assert.rejects(
    manager.identifyAdmissibleOutputs(
      productionMintBeef({ adUrl: 'javascript:alert(1)' }),
      []
    ),
    /no admissible Adinals evidence/
  )
  await assert.rejects(
    manager.identifyAdmissibleOutputs(
      productionMintBeef({ adMaxChars: '2' }),
      []
    ),
    /no admissible Adinals evidence/
  )
})

test('a locally coherent signed decision candidate is admitted', async () => {
  const transitionTxid = 'b'.repeat(64)
  const manager = new AdinalsTopicManager()
  const decision = {
    app: 'adinals',
    type: 'ord',
    name: 'Ad decision',
    subType: 'adDecision',
    protocolVersion: '3',
    collectionId: `${'a'.repeat(64)}_0`,
    adOrigin: `${'c'.repeat(64)}_0`,
    updateOutpoint: `${transitionTxid}_1`,
    revisionOutpoint: `${transitionTxid}_1`,
    adOutpoint: `${transitionTxid}_0`,
    ownerEpoch: `${'d'.repeat(64)}_0`,
    transitionTxid,
    decision: 'approved',
    reasonCode: 'approved',
    decidedAt: '2026-08-01T19:02:00.000Z'
  }
  assert.deepEqual(
    await manager.identifyAdmissibleOutputs(productionRecordBeef(decision), []),
    { outputsToAdmit: [0], coinsToRetain: [] }
  )
  await assert.rejects(
    manager.identifyAdmissibleOutputs(
      productionRecordBeef({ ...decision, adOutpoint: `${'e'.repeat(64)}_0` }),
      []
    ),
    /no admissible Adinals evidence/
  )
})

test('metadata reports lifecycle admission as the latest enabled gate', async () => {
  const metadata = await new AdinalsTopicManager().getMetaData()
  assert.match(metadata.shortDescription, /lifecycle successors/)
  assert.match(metadata.version ?? '', /lifecycle-admission/)
})
