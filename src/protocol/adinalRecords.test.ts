import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAdinalDecisionMap, buildAdinalMintMap, buildAdinalUpdateMap } from './adinalMetadata.ts'

const C = `${'a'.repeat(64)}_0`
const A = `${'b'.repeat(64)}_0`

test('mint map retains original v3 collectionItem fields', () => {
  const map = buildAdinalMintMap({
    collectionId: C,
    name: 'Banner',
    serial: 2,
    format: 'text',
    text: 'hello',
    maxChars: 20,
    now: new Date('2026-07-31T18:00:00.000Z'),
  })
  assert.equal(map.subType, 'collectionItem')
  assert.equal(map.subTypeData, JSON.stringify({ collectionId: C, mintNumber: 2 }))
  assert.equal(map.protocolVersion, '3')
})

test('update and decision preserve output relationship invariants', () => {
  const update = buildAdinalUpdateMap({
    collectionId: C,
    adOrigin: A,
    adOutpoint: A,
    ownerEpoch: A,
    format: 'text',
    text: 'new creative',
  })
  assert.equal(update.transition, 'spend-linked-self-v1')
  const txid = 'c'.repeat(64)
  const decision = buildAdinalDecisionMap({
    collectionId: C,
    adOrigin: A,
    updateOutpoint: `${txid}_1`,
    adOutpoint: `${txid}_0`,
    ownerEpoch: A,
    verdict: 'approved',
    reasonCode: 'meets-policy',
  })
  assert.equal(decision.transitionTxid, txid)
  assert.throws(() => buildAdinalDecisionMap({
    collectionId: C,
    adOrigin: A,
    updateOutpoint: `${txid}_0`,
    adOutpoint: `${txid}_1`,
    ownerEpoch: A,
    verdict: 'approved',
    reasonCode: '',
  }), /output 1/)
})
