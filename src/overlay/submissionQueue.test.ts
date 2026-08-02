import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deliverOverlaySubmission,
  retryPendingOverlaySubmissions,
  type OverlaySubmission,
  type OverlaySubmissionStore,
} from './submissionQueue.ts'

const TXID = 'a'.repeat(64)
const record = (overrides: Partial<OverlaySubmission> = {}): OverlaySubmission => ({
  format: 'adinals-overlay-submission-v1',
  key: `${TXID}_0`,
  txid: TXID,
  outpoints: [`${TXID}_0`],
  atomicBeef: [1, 2, 3],
  topic: 'tm_adinals',
  status: 'provisional',
  attempts: 0,
  createdAt: '2026-08-02T12:00:00.000Z',
  updatedAt: '2026-08-02T12:00:00.000Z',
  nextRetryAt: '',
  error: '',
  ...overrides,
})

const memoryStore = (pending: OverlaySubmission[] = []) => {
  const writes: OverlaySubmission[] = []
  const store: OverlaySubmissionStore = {
    async put(value) { writes.push(structuredClone(value)) },
    async listPending() { return pending },
  }
  return { store, writes }
}

test('delayed exact lookup advances provisional submission to indexed', async () => {
  const { store, writes } = memoryStore()
  let lookupCalls = 0
  const result = await deliverOverlaySubmission(record(), {
    store,
    client: {
      async submit() { return {} },
      async hasOutput() { lookupCalls += 1; return lookupCalls >= 3 },
    },
    pollAttempts: 3,
    pollIntervalMs: 0,
    sleep: async () => undefined,
  })
  assert.equal(result.status, 'indexed')
  assert.equal(result.attempts, 1)
  assert.equal(lookupCalls, 3)
  assert.equal(writes.some((write) => write.status === 'provisional'), true)
  assert.equal(writes.at(-1)?.status, 'indexed')
})

test('overlay outage after wallet broadcast is retained for retry and never thrown', async () => {
  const { store, writes } = memoryStore()
  const result = await deliverOverlaySubmission(record(), {
    store,
    client: {
      async submit() { throw new Error('fetch failed') },
      async hasOutput() { return false },
    },
    now: () => new Date('2026-08-02T12:00:00.000Z'),
  })
  assert.equal(result.status, 'retrying')
  assert.match(result.error, /fetch failed/)
  assert.equal(result.nextRetryAt, '2026-08-02T12:00:02.000Z')
  assert.equal(writes.at(-1)?.status, 'retrying')
})

test('semantic overlay rejection becomes failed rather than an endless retry', async () => {
  const { store } = memoryStore()
  const result = await deliverOverlaySubmission(record(), {
    store,
    client: {
      async submit() { throw new Error('transaction rejected as invalid') },
      async hasOutput() { return false },
    },
  })
  assert.equal(result.status, 'failed')
  assert.equal(result.nextRetryAt, '')
})

test('startup retry processes only due queued submissions', async () => {
  const due = record({ status: 'retrying', nextRetryAt: '2026-08-02T11:59:59.000Z' })
  const later = record({ key: `${TXID}_1`, outpoints: [`${TXID}_1`], nextRetryAt: '2026-08-02T12:00:01.000Z' })
  const { store } = memoryStore([due, later])
  let submissions = 0
  await retryPendingOverlaySubmissions({
    store,
    client: {
      async submit() { submissions += 1; return {} },
      async hasOutput() { return true },
    },
    now: () => new Date('2026-08-02T12:00:00.000Z'),
    pollAttempts: 1,
  })
  assert.equal(submissions, 1)
})

