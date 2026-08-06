import assert from 'node:assert/strict'
import test from 'node:test'
import type { AdinalsStorageLike, AdmittedOutputRecord } from './AdinalsStorage.js'
import {
  arcIngest,
  arcIngestUrl,
  backfillPositions,
  pacedFetcher,
  type ChainPosition,
  type ProofIngest
} from './positionBackfill.js'

const accepted: ProofIngest = async () => true
const position = (blockHeight: number, transactionIndex?: number): ChainPosition => ({
  blockHeight,
  ...(transactionIndex === undefined ? {} : { transactionIndex }),
  merklePathHex: 'fe40aa0e000802'
})

/** Only the two methods the backfill uses; the rest of the interface is unused. */
class PositionStorage {
  readonly rows: AdmittedOutputRecord[]
  readonly writes: Array<{ outpoint: string, annotations: Partial<AdmittedOutputRecord> }> = []

  constructor (rows: AdmittedOutputRecord[]) {
    this.rows = rows
  }

  async findAllRecords (): Promise<AdmittedOutputRecord[]> {
    return this.rows
  }

  async annotateOutput (
    txid: string,
    outputIndex: number,
    annotations: Partial<AdmittedOutputRecord>
  ): Promise<void> {
    this.writes.push({ outpoint: `${txid}_${outputIndex}`, annotations })
  }
}

const row = (
  txid: string,
  outputIndex: number,
  blockHeight?: number
): AdmittedOutputRecord => ({
  txid,
  outputIndex,
  atomicBEEF: [1],
  admittedAt: new Date('2026-08-05T23:22:42.000Z'),
  recordType: 'listing',
  ...(blockHeight === undefined ? {} : { blockHeight })
})

const storageOf = (rows: AdmittedOutputRecord[]): {
  storage: AdinalsStorageLike
  writes: PositionStorage['writes']
} => {
  const storage = new PositionStorage(rows)
  return { storage: storage as unknown as AdinalsStorageLike, writes: storage.writes }
}

test('a mined row admitted from the mempool gains its position', async () => {
  const { storage, writes } = storageOf([row('a'.repeat(64), 0)])
  const report = await backfillPositions(storage, async () => position(961_040, 20_323), accepted)

  assert.deepEqual(report, { scanned: 1, positioned: 1, unresolved: [], failed: [] })
  assert.equal(writes.length, 1)
  assert.deepEqual(writes[0]?.annotations, { blockHeight: 961_040, transactionIndex: 20_323 })
})

test('a row that already carries a height is never read or written', async () => {
  const { storage, writes } = storageOf([row('a'.repeat(64), 0, 961_014)])
  let reads = 0
  const report = await backfillPositions(storage, async () => {
    reads += 1
    return position(961_040)
  }, accepted)

  assert.deepEqual(report, { scanned: 1, positioned: 0, unresolved: [], failed: [] })
  assert.equal(reads, 0)
  assert.equal(writes.length, 0)
})

test('outputs of one transaction share a single position read', async () => {
  const txid = 'b'.repeat(64)
  const { storage, writes } = storageOf([row(txid, 0), row(txid, 1)])
  let reads = 0
  await backfillPositions(storage, async () => {
    reads += 1
    return position(961_029)
  }, accepted)

  assert.equal(reads, 1)
  assert.equal(writes.length, 2)
})

/**
 * The ordinary reason a position is unavailable: the transaction really is in
 * the mempool. It is reported, not treated as a fault, and the next run
 * resolves it once a block carries it.
 */
test('an unproven transaction is left for the next run', async () => {
  const { storage, writes } = storageOf([row('c'.repeat(64), 0)])
  const report = await backfillPositions(storage, async () => null, accepted)

  assert.deepEqual(report.unresolved, [`${'c'.repeat(64)}_0`])
  assert.equal(report.positioned, 0)
  assert.equal(writes.length, 0)
})

test('a reader that throws never fails the run', async () => {
  const { storage } = storageOf([row('d'.repeat(64), 0)])
  const report = await backfillPositions(storage, async () => {
    throw new Error('WhatsOnChain is unavailable')
  }, accepted)

  assert.equal(report.positioned, 0)
  assert.equal(report.unresolved.length, 1)
})

test('a position without a leaf offset still records its height', async () => {
  const { storage, writes } = storageOf([row('e'.repeat(64), 0)])
  await backfillPositions(storage, async () => position(961_040), accepted)

  assert.deepEqual(writes[0]?.annotations, { blockHeight: 961_040 })
})

/**
 * A row that cannot be written is reported and stepped over. Aborting would
 * cost every row behind it a whole sweep interval for one bad document.
 */
test('a failed write never stops the rows behind it', async () => {
  const rows = [row('f'.repeat(64), 0), row('e'.repeat(64), 0)]
  const storage = {
    async findAllRecords () { return rows },
    async annotateOutput (txid: string) {
      if (txid.startsWith('f')) throw new Error('document too large')
    }
  } as unknown as AdinalsStorageLike

  const report = await backfillPositions(storage, async () => position(961_040), accepted)
  assert.equal(report.positioned, 1)
  assert.equal(report.failed.length, 1)
  assert.match(report.failed[0] ?? '', /document too large/)
})

test('requests are spaced under the reader’s rate limit', async () => {
  const waits: number[] = []
  let clock = 0
  const paced = pacedFetcher(
    async () => new Response('ok'),
    {
      minIntervalMs: 400,
      sleep: async (milliseconds) => { waits.push(milliseconds); clock += milliseconds },
      now: () => clock
    }
  )

  await paced('https://example.test/one')
  await paced('https://example.test/two')
  await paced('https://example.test/three')

  // The first request goes immediately; each one after waits out the interval.
  assert.deepEqual(waits, [400, 400])
})

/**
 * A refusal is indistinguishable from "not mined yet" once it reaches the
 * caller, so it must be waited out here rather than reported as an absence.
 */
test('a rate-limited request is retried rather than treated as unmined', async () => {
  const statuses = [429, 429, 200]
  let sent = 0
  const paced = pacedFetcher(
    async () => new Response('ok', { status: statuses[sent++] ?? 200 }),
    { minIntervalMs: 0, backoffMs: [1, 2], sleep: async () => {}, now: () => 0 }
  )

  const response = await paced('https://example.test/beef')
  assert.equal(response.status, 200)
  assert.equal(sent, 3)
})

test('a refusal that outlasts every retry is returned rather than looping', async () => {
  let sent = 0
  const paced = pacedFetcher(
    async () => { sent += 1; return new Response('no', { status: 429 }) },
    { minIntervalMs: 0, backoffMs: [1], sleep: async () => {}, now: () => 0 }
  )

  assert.equal((await paced('https://example.test/beef')).status, 429)
  assert.equal(sent, 2)
})

/**
 * The repair that matters: a lookup answer is hydrated from the engine's stored
 * BEEF, so a proof that never reaches the engine repairs nothing a reader sees.
 */
test('the proof is handed to the engine once per transaction', async () => {
  const txid = 'a'.repeat(64)
  const { storage } = storageOf([row(txid, 0), row(txid, 1)])
  const ingests: string[] = []
  await backfillPositions(storage, async () => position(961_040), async (id, proven) => {
    ingests.push(`${id}:${proven.merklePathHex}`)
    return true
  })

  assert.deepEqual(ingests, [`${txid}:fe40aa0e000802`])
})

test('a proof the node refuses leaves the row unpositioned', async () => {
  const { storage, writes } = storageOf([row('b'.repeat(64), 0)])
  const report = await backfillPositions(storage, async () => position(961_040), async () => false)

  assert.equal(report.positioned, 0)
  assert.equal(writes.length, 0)
  assert.match(report.failed[0] ?? '', /refused the merkle proof/)
})

test('the ingest route comes from the address the deployment was given', () => {
  // What LARS and CARS both set, so neither needs configuring.
  assert.equal(
    arcIngestUrl({ HOSTING_URL: 'https://backend.example.projects.babbage.systems/' }),
    'https://backend.example.projects.babbage.systems/arc-ingest'
  )
  // A node started without one still reaches the route it serves itself.
  assert.equal(arcIngestUrl({ PORT: '8080' }), 'http://127.0.0.1:8080/arc-ingest')
  assert.equal(
    arcIngestUrl({
      ADINALS_ARC_INGEST_URL: 'https://node.test/arc-ingest',
      HOSTING_URL: 'https://ignored.test',
      PORT: '8080'
    }),
    'https://node.test/arc-ingest'
  )
})

/** 202 is the route acknowledging a status with no proof attached. */
test('only an accepted proof counts as ingested', async () => {
  const statuses = [200, 202, 400]
  const results: boolean[] = []
  for (const status of statuses) {
    const ingest = arcIngest('https://node.test/arc-ingest', async () => new Response('', { status }))
    results.push(await ingest('c'.repeat(64), position(961_040)))
  }
  assert.deepEqual(results, [true, false, false])
})
