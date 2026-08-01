import assert from 'node:assert/strict'
import test from 'node:test'
import { lifecyclePublicationTxids, validateLifecyclePublicationReadiness } from './publishLifecycle.ts'

const ANCHOR = 'a'.repeat(64)
const MINT = 'b'.repeat(64)
const UPDATE = 'c'.repeat(64)
const DECISION = 'd'.repeat(64)
const absent = (txid: string) => ({
  txid,
  whatsOnChain: { presence: 'absent', detail: 'absent' },
  gorillaPool: { presence: 'absent', detail: 'absent' },
})
const mint = {
  kind: 'mint', status: 'rehearsed', broadcast: false, txid: MINT, anchorTxid: ANCHOR,
} as Parameters<typeof lifecyclePublicationTxids>[0]
const update = {
  kind: 'update', status: 'rehearsed', broadcast: false, txid: UPDATE,
} as Parameters<typeof lifecyclePublicationTxids>[0]

test('anchor-backed records publish as pairs and spend transitions publish alone', () => {
  assert.deepEqual(lifecyclePublicationTxids(mint), [ANCHOR, MINT])
  assert.deepEqual(lifecyclePublicationTxids({ ...mint, kind: 'decision', txid: DECISION } as never), [ANCHOR, DECISION])
  assert.deepEqual(lifecyclePublicationTxids(update), [UPDATE])
  for (const kind of ['listing', 'purchase', 'cancel'] as const) {
    assert.deepEqual(lifecyclePublicationTxids({ ...update, kind } as never), [UPDATE])
  }
})

test('lifecycle readiness requires fresh exact nosend and public absence evidence', () => {
  const preflight = {
    checkedAt: '2026-07-31T20:00:00.000Z', txids: [ANCHOR, MINT],
    walletStatuses: { [ANCHOR]: 'nosend', [MINT]: 'nosend' },
    network: [absent(ANCHOR), absent(MINT)], allReadersAbsent: true,
  } as Parameters<typeof validateLifecyclePublicationReadiness>[1]
  assert.doesNotThrow(() => validateLifecyclePublicationReadiness(mint, preflight, new Date('2026-07-31T20:01:00.000Z')))
  assert.throws(() => validateLifecyclePublicationReadiness(mint, { ...preflight, walletStatuses: { ...preflight.walletStatuses, [MINT]: 'sending' } }, new Date('2026-07-31T20:01:00.000Z')), /nosend/)
  assert.throws(() => validateLifecyclePublicationReadiness(mint, { ...preflight, allReadersAbsent: false }, new Date('2026-07-31T20:01:00.000Z')), /public reader/)
  assert.throws(() => validateLifecyclePublicationReadiness(mint, preflight, new Date('2026-07-31T20:02:00.001Z')), /stale/)
})
