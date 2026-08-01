import assert from 'node:assert/strict'
import test from 'node:test'
import type { AdmittedOutputRecord } from './AdinalsStorage.js'
import { resolveMintWinners } from './mintResolution.js'

const collection = (
  overrides: Partial<AdmittedOutputRecord> = {}
): AdmittedOutputRecord => ({
  txid: 'a'.repeat(64),
  outputIndex: 0,
  atomicBEEF: [],
  admittedAt: new Date(0),
  recordType: 'collection',
  signerAddress: 'creator',
  map: {
    app: 'adinals',
    type: 'ord',
    name: 'Collection',
    subType: 'collection',
    protocolVersion: '3',
    subTypeData: JSON.stringify({ description: '', quantity: 2 }),
    adMax: '2',
    adApproval: 'creator',
    adFormat: 'text',
    adMaxChars: '16',
    createdAt: '2026-08-01T19:00:00.000Z'
  },
  ...overrides
})

const mint = (
  txid: string,
  slot: number,
  overrides: Partial<AdmittedOutputRecord> = {}
): AdmittedOutputRecord => ({
  txid,
  outputIndex: 0,
  atomicBEEF: [],
  admittedAt: new Date(0),
  recordType: 'collectionItem',
  signerAddress: 'creator',
  map: {
    app: 'adinals',
    type: 'ord',
    name: `Ad #${slot}`,
    subType: 'collectionItem',
    protocolVersion: '3',
    subTypeData: JSON.stringify({
      collectionId: `${'a'.repeat(64)}_0`,
      mintNumber: slot
    }),
    adFormat: 'text',
    adText: 'hello',
    adMaxChars: '16',
    mintedAt: '2026-08-01T19:01:00.000Z'
  },
  ...overrides
})

test('resolves a creator-signed mint matching permanent collection rules', () => {
  const candidate = mint('b'.repeat(64), 1, {
    blockHeight: 10,
    transactionIndex: 2
  })
  assert.deepEqual(resolveMintWinners([collection(), candidate]), [candidate])
})

test('rejects wrong creator, format, and out-of-capacity candidates', () => {
  assert.deepEqual(resolveMintWinners([
    collection(),
    mint('b'.repeat(64), 1, { signerAddress: 'attacker' }),
    mint('c'.repeat(64), 1, { map: { ...mint('c'.repeat(64), 1).map!, adFormat: 'image' } }),
    mint('d'.repeat(64), 3)
  ]), [])
})

test('earliest confirmed duplicate wins deterministic chain order', () => {
  const later = mint('c'.repeat(64), 1, { blockHeight: 12, transactionIndex: 1 })
  const earlier = mint('b'.repeat(64), 1, { blockHeight: 11, transactionIndex: 9 })
  assert.deepEqual(resolveMintWinners([collection(), later, earlier]), [earlier])
})

test('multiple unconfirmed duplicate claims remain quarantined', () => {
  assert.deepEqual(resolveMintWinners([
    collection(),
    mint('b'.repeat(64), 1),
    mint('c'.repeat(64), 1)
  ]), [])
})
