import { Beef, MerklePath } from '@bsv/sdk'
import type { AdinalsStorageLike, AdmittedOutputRecord } from './AdinalsStorage.js'

/**
 * Gives mined records the proof they were admitted without.
 *
 * Everything this application publishes is submitted the moment it broadcasts,
 * so every record enters the topic unconfirmed. Nothing then tells the node it
 * was mined: the engine returns early for a transaction it has already applied
 * — `doesAppliedTransactionExist` runs before the topic manager or any lookup
 * service — so resubmitting the same transaction with its proof attached is a
 * no-op, and the `LookupService` interface has no height-update callback.
 * Records therefore stay "unconfirmed" to every reader for as long as the node
 * holds them.
 *
 * The repair goes to the engine, not to this service's own rows. A lookup
 * answer is hydrated from the engine's stored BEEF (`Engine.loadOutputWithBEEF`)
 * and every reader takes a record's height from the merkle path inside it, so a
 * height written beside the evidence would be a height nobody reads. The
 * engine's `handleNewMerkleProof` is reachable over the node's own `/arc-ingest`
 * route, which is the same path a broadcaster's callback would take.
 *
 * Position is display metadata — no admission, classification, or ownership
 * decision consults it — so a proof is accepted here on two independent
 * readers agreeing rather than a header chain this service does not have: the
 * proof must commit to the exact transaction, and the height it proves must
 * match the height an unrelated indexer reports.
 */
export type ChainPosition = {
  blockHeight: number
  transactionIndex?: number
  /** The BUMP proving the transaction, as the ingest route expects it. */
  merklePathHex: string
}

export type ChainPositionReader = (
  txid: string,
  outputIndex: number
) => Promise<ChainPosition | null>

/** Hands one proof to the engine. Answers whether the engine accepted it. */
export type ProofIngest = (txid: string, position: ChainPosition) => Promise<boolean>

export type PositionBackfillReport = {
  scanned: number
  positioned: number
  /** Transactions no reader could prove yet, which is ordinarily the mempool. */
  unresolved: string[]
  /** Rows whose repair failed, with the reason, one line each. */
  failed: string[]
}

const WHATSONCHAIN = 'https://api.whatsonchain.com/v1/bsv/main'
const GORILLAPOOL = 'https://ordinals.gorillapool.io/api'

/**
 * WhatsOnChain allows three requests a second. A repair has no deadline, so it
 * stays comfortably under rather than discovering the limit: a refusal here
 * looks exactly like "not mined yet" and would postpone the row for a whole
 * sweep.
 */
const REQUEST_INTERVAL_MS = 400
const RATE_LIMIT_BACKOFF_MS = [1_000, 4_000, 12_000] as const

export type PacedFetcher = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Spaces requests and waits out a refusal.
 *
 * The pacing state belongs to one fetcher, which is built once per sweep, so
 * every request a sweep makes queues behind the last one it made.
 */
export const pacedFetcher = (
  fetcher: typeof fetch = fetch,
  options: {
    minIntervalMs?: number
    backoffMs?: readonly number[]
    sleep?: (milliseconds: number) => Promise<void>
    now?: () => number
  } = {}
): PacedFetcher => {
  const minIntervalMs = options.minIntervalMs ?? REQUEST_INTERVAL_MS
  const backoffMs = options.backoffMs ?? RATE_LIMIT_BACKOFF_MS
  const sleep = options.sleep ??
    (async (milliseconds: number) => { await new Promise((resolve) => setTimeout(resolve, milliseconds)) })
  const now = options.now ?? Date.now
  // No request has been made, so the first one owes no interval.
  let previous = Number.NEGATIVE_INFINITY
  let queue: Promise<Response> = Promise.resolve(new Response())

  const send = async (url: string, init?: RequestInit): Promise<Response> => {
    for (let attempt = 0; ; attempt += 1) {
      const wait = previous + minIntervalMs - now()
      if (wait > 0) await sleep(wait)
      previous = now()
      const response = await fetcher(url, init)
      if (response.status !== 429 || attempt >= backoffMs.length) return response
      await sleep(backoffMs[attempt] ?? 0)
    }
  }

  return async (url, init) => {
    // Serialized, because two concurrent callers reading the same timestamp
    // would both decide they were clear to send.
    queue = queue.then(() => send(url, init), () => send(url, init))
    return await queue
  }
}

/** The position a BUMP proves for one transaction, or null when it proves none. */
export const positionFromBeef = (beef: Beef, txid: string): ChainPosition | null => {
  const entry = beef.findTxid(txid)
  if (entry?.bumpIndex === undefined) return null
  const bump: MerklePath | undefined = beef.bumps[entry.bumpIndex]
  const leaf = bump?.path[0]?.find((node) => node.hash === txid)
  if (!bump || !leaf) return null
  try {
    // Proves the path commits to this exact transaction rather than merely
    // arriving alongside it.
    bump.computeRoot(txid)
  } catch {
    return null
  }
  return {
    blockHeight: bump.blockHeight,
    ...(leaf.offset === undefined ? {} : { transactionIndex: leaf.offset }),
    merklePathHex: bump.toHex()
  }
}

/**
 * Reads a transaction's proof from WhatsOnChain and confirms the height it
 * proves against GorillaPool before it is believed.
 */
export const readChainPosition = (
  fetcher: PacedFetcher = pacedFetcher()
): ChainPositionReader => async (txid, outputIndex) => {
  const proof = await fetcher(`${WHATSONCHAIN}/tx/${txid}/beef`)
  if (!proof.ok) return null
  const proven = positionFromBeef(
    Beef.fromString((await proof.text()).trim().replace(/^"|"$/g, ''), 'hex'),
    txid
  )
  if (!proven) return null

  // The outpoint endpoint, because `/tx/{txid}` answers in raw bytes whatever
  // the request asks for, and a height nobody parsed would corroborate nothing.
  const corroboration = await fetcher(`${GORILLAPOOL}/txos/${txid}_${outputIndex}?script=false`, {
    headers: { Accept: 'application/json' }
  })
  if (!corroboration.ok) return null
  const reported = (await corroboration.json()) as { height?: unknown }
  return reported.height === proven.blockHeight ? proven : null
}

/**
 * The node's own proof ingest route, which is how a proof reaches the engine.
 *
 * `HOSTING_URL` is the address LARS and CARS give a deployment for itself, so
 * the route needs no configuration in either. The loopback fallback covers a
 * node started without it, and `ADINALS_ARC_INGEST_URL` overrides both — a URL
 * this cannot reach is the one failure that leaves every record unconfirmed
 * while looking like a quiet mempool.
 */
export const arcIngestUrl = (environment: NodeJS.ProcessEnv = process.env): string => {
  if (environment.ADINALS_ARC_INGEST_URL) return environment.ADINALS_ARC_INGEST_URL
  const hosting = environment.HOSTING_URL?.trim().replace(/\/+$/, '')
  return hosting
    ? `${hosting}/arc-ingest`
    : `http://127.0.0.1:${environment.PORT ?? '8080'}/arc-ingest`
}

export const arcIngest = (
  url: string = arcIngestUrl(),
  fetcher: typeof fetch = fetch
): ProofIngest => async (txid, position) => {
  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txid,
      merklePath: position.merklePathHex,
      blockHeight: position.blockHeight
    })
  })
  // The route answers 202 for a status update carrying no proof, which is not
  // this repair succeeding.
  return response.status === 200
}

const outpoint = (record: Pick<AdmittedOutputRecord, 'txid' | 'outputIndex'>): string =>
  `${record.txid}_${record.outputIndex}`

/**
 * Idempotent: a row that already carries a height is never read, ingested, or
 * written, so a second run costs one scan and no requests.
 */
export const backfillPositions = async (
  storage: AdinalsStorageLike,
  readPosition: ChainPositionReader,
  ingestProof: ProofIngest
): Promise<PositionBackfillReport> => {
  const records = await storage.findAllRecords()
  const missing = records.filter((record) => record.blockHeight === undefined)
  const report: PositionBackfillReport = {
    scanned: records.length,
    positioned: 0,
    unresolved: [],
    failed: []
  }

  // One proof per transaction, however many of its outputs were admitted: the
  // engine updates every output of a transaction from one ingest.
  const positions = new Map<string, ChainPosition | null>()
  const ingested = new Set<string>()
  for (const record of missing) {
    if (!positions.has(record.txid)) {
      positions.set(
        record.txid,
        await readPosition(record.txid, record.outputIndex).catch(() => null)
      )
    }
    const position = positions.get(record.txid) ?? null
    if (!position) {
      // A transaction still in the mempool is the ordinary reason, and is not a
      // fault: the next sweep resolves it once a block carries it.
      report.unresolved.push(outpoint(record))
      continue
    }

    // One row that cannot be repaired must not cost every row behind it a
    // sweep interval. The reason is reported per row, because "some rows
    // failed" is not something anyone can act on.
    try {
      if (!ingested.has(record.txid)) {
        if (!await ingestProof(record.txid, position)) {
          throw new Error('the node refused the merkle proof')
        }
        ingested.add(record.txid)
      }
      // Kept beside the evidence as well: projections order decisions by chain
      // position, and that derivation reads these rows rather than the engine's.
      await storage.annotateOutput(record.txid, record.outputIndex, {
        blockHeight: position.blockHeight,
        ...(position.transactionIndex === undefined
          ? {}
          : { transactionIndex: position.transactionIndex })
      })
      report.positioned += 1
    } catch (error: unknown) {
      report.failed.push(
        `${outpoint(record)}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  return report
}
