import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyLifecyclePublicationReconciliation } from './lifecyclePublicationReconciliation.ts'

const ANCHOR = 'a'.repeat(64)
const MINT = 'b'.repeat(64)
const attempt = { primaryTxid: MINT, txids: [ANCHOR, MINT] }
const entry = (txid: string, woc: 'present' | 'absent' | 'unavailable', gp: 'present' | 'absent' | 'unavailable' = 'absent') => ({
  txid,
  whatsOnChain: { presence: woc, detail: woc },
  gorillaPool: { presence: gp, detail: gp },
})

test('public primary or all accepted wallet statuses close lifecycle publication', () => {
  assert.equal(classifyLifecyclePublicationReconciliation(attempt, { [ANCHOR]: 'sending', [MINT]: 'sending' }, [entry(ANCHOR, 'present'), entry(MINT, 'present', 'present')]).outcome, 'accepted')
  assert.equal(classifyLifecyclePublicationReconciliation(attempt, { [ANCHOR]: 'unproven', [MINT]: 'completed' }, [entry(ANCHOR, 'absent'), entry(MINT, 'absent')]).outcome, 'accepted')
})

test('failed plus full absence rejects while incomplete evidence stays uncertain', () => {
  assert.equal(classifyLifecyclePublicationReconciliation(attempt, { [ANCHOR]: 'failed', [MINT]: 'nosend' }, [entry(ANCHOR, 'absent'), entry(MINT, 'absent')]).outcome, 'rejected')
  assert.equal(classifyLifecyclePublicationReconciliation(attempt, { [ANCHOR]: 'sending', [MINT]: 'sending' }, [entry(ANCHOR, 'unavailable'), entry(MINT, 'absent')]).outcome, 'uncertain')
})
