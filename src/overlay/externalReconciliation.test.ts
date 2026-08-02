import assert from 'node:assert/strict'
import test from 'node:test'
import { reconcileConfirmedExternalSpends } from './externalReconciliation.ts'

const source = `${'a'.repeat(64)}_0`
const spendTxid = 'b'.repeat(64)

test('confirmed external spend submits proof and waits for exact successor', async () => {
  let lookups = 0
  let submitted: readonly number[] = []
  const result = await reconcileConfirmedExternalSpends({
    currentOutpoints: [source],
    async discoverConfirmedSpend() { return { txid: spendTxid, beef: [1, 2, 3] } },
    async submit(beef) { submitted = beef },
    async hasOutput() { lookups += 1; return lookups >= 3 },
    pollAttempts: 3,
    pollIntervalMs: 0,
    sleep: async () => undefined,
  })
  assert.deepEqual(submitted, [1, 2, 3])
  assert.equal(result.submitted, 1)
  assert.deepEqual(result.failures, [])
})

test('already-present and unspent states reconcile idempotently', async () => {
  let submitted = 0
  const result = await reconcileConfirmedExternalSpends({
    currentOutpoints: [source, `${'c'.repeat(64)}_0`],
    async discoverConfirmedSpend(outpoint) {
      return outpoint === source ? { txid: spendTxid, beef: [1] } : null
    },
    async submit() { submitted += 1 },
    async hasOutput() { return true },
  })
  assert.equal(result.alreadyPresent, 1)
  assert.equal(result.noSpend, 1)
  assert.equal(submitted, 0)
})

test('reconciliation outage is reported without aborting other current states', async () => {
  const second = `${'c'.repeat(64)}_0`
  const result = await reconcileConfirmedExternalSpends({
    currentOutpoints: [source, second],
    async discoverConfirmedSpend(outpoint) {
      if (outpoint === source) throw new Error('reader offline')
      return null
    },
    async submit() { throw new Error('not reached') },
    async hasOutput() { return false },
  })
  assert.equal(result.noSpend, 1)
  assert.deepEqual(result.failures, [{ outpoint: source, error: 'reader offline' }])
})

