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

test('a batch the wallet still holds as no-send closes rather than stranding', () => {
  // A preflight that throws writes the attempt record before the wallet is ever
  // called, so the batch stays nosend forever. Without this it can never reach
  // a terminal state: nosend is neither accepted nor failed.
  const result = classifyLifecyclePublicationReconciliation(
    attempt,
    { [ANCHOR]: 'nosend', [MINT]: 'nosend' },
    [entry(ANCHOR, 'absent'), entry(MINT, 'absent')],
  )
  assert.equal(result.outcome, 'rejected')
  assert.match(result.message, /never published/)
})

test('no-send only closes when every reader agrees the batch is absent', () => {
  // An unreachable reader is not evidence of absence — that is the failure that
  // produced the stranded attempt in the first place.
  assert.equal(classifyLifecyclePublicationReconciliation(attempt, { [ANCHOR]: 'nosend', [MINT]: 'nosend' }, [entry(ANCHOR, 'unavailable'), entry(MINT, 'unavailable')]).outcome, 'uncertain')
  assert.equal(classifyLifecyclePublicationReconciliation(attempt, { [ANCHOR]: 'nosend', [MINT]: 'nosend' }, [entry(ANCHOR, 'absent'), entry(MINT, 'absent', 'unavailable')]).outcome, 'uncertain')
  // A partially sent batch is a real unknown and must stay one.
  assert.equal(classifyLifecyclePublicationReconciliation(attempt, { [ANCHOR]: 'sending', [MINT]: 'nosend' }, [entry(ANCHOR, 'absent'), entry(MINT, 'absent')]).outcome, 'uncertain')
})

test('public presence still outranks a no-send wallet status', () => {
  // If the transaction is on the network, how the wallet describes it is beside
  // the point. Closing this as never-published would invite a second send.
  assert.equal(classifyLifecyclePublicationReconciliation(attempt, { [ANCHOR]: 'nosend', [MINT]: 'nosend' }, [entry(ANCHOR, 'absent'), entry(MINT, 'present')]).outcome, 'accepted')
})
