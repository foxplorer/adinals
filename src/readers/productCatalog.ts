/**
 * Read and derive Adinals records.
 *
 * The active writer is `adLabKeys.ts`: it creates one transaction per record
 * and appends one standard SIGMA signature. MAP contains only protocol data—no
 * second `sig` or `signer` field. This reader accepts a record identity only
 * from a SIGMA entry that GorillaPool has cryptographically marked valid.
 */
import { Script, Utils } from '@bsv/sdk'
import {
  ADINALS_PROTOCOL_VERSION,
  ADINALS_SUB_TYPE,
} from '../protocol/records.ts'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import {
  parseProtocolOutpoint,
  validateSpendLinkedRecord,
  type SpendLinkedRecordProof,
} from '../protocol/transitions.ts'
import { readRawTransaction } from './rawTransactions.ts'

export const APP = ADINALS_NAMESPACE.app

export const GORILLAPOOL = 'https://ordinals.gorillapool.io/api'
export const CONTENT = 'https://ordinals.gorillapool.io/content'
export const WOC = 'https://api.whatsonchain.com/v1/bsv/main'
export const MARKET = 'https://1sat.market/outpoint'
const SEARCH_PAGE_SIZE = 200
const MAX_SEARCH_PAGES = 1_000

/**
 * The namespace every record is written under and every query filters on.
 *
 * The permanent production name is versioned by `protocolVersion`. Records
 * written under the previous rehearsal name remain public but are intentionally
 * invisible here; breaking future rules must use a later protocol version rather
 * than reinterpret version 3 records.
 */
export type RecordKind = 'collection' | 'ad' | 'update' | 'approval'

/** MAP `subType` per kind. `collection`/`collectionItem` are the values that make
 *  wallets and markets render the thing as a collection, so they are kept. */
export const SUB_TYPE: Record<RecordKind, string> = {
  collection: ADINALS_SUB_TYPE.collection,
  ad: ADINALS_SUB_TYPE.ad,
  update: ADINALS_SUB_TYPE.update,
  approval: ADINALS_SUB_TYPE.decision,
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

/**
 * Hand a txid to GorillaPool and verify the exact output becomes readable.
 *
 * GorillaPool indexes what it is told about or what a block confirms — so
 * without this a user writes a record and sees nothing for ten minutes.
 * Retried, because the first attempt often lands before the transaction has
 * propagated far enough for the indexer to fetch it.
 */
const indexerSubmissions = new Map<string, Promise<IndexerSubmissionOutcome>>()

type IndexerSubmissionOptions = {
  fetcher?: typeof fetch
  retryDelaysMs?: readonly number[]
  settleDelayMs?: number
  sleep?: (delayMs: number) => Promise<void>
}

/**
 * The outcome of asking GorillaPool to index a broadcast transaction.
 *
 * `awaiting-index` is routine rather than a fault: the submission was accepted
 * and the record simply is not public yet. GorillaPool often withholds a record
 * until its transaction confirms, and the retry window here is around thirty
 * seconds against a roughly ten-minute block interval. `unavailable` is the
 * genuine failure, where no submission was accepted at all.
 */
export type IndexerSubmissionOutcome = 'indexed' | 'awaiting-index' | 'unavailable'

export function submitToIndexer(
  txid: string,
  outpoint: string,
  options: IndexerSubmissionOptions = {},
): Promise<IndexerSubmissionOutcome> {
  const parsed = parseProtocolOutpoint(outpoint)
  if (!/^[0-9a-f]{64}$/i.test(txid) || !parsed || parsed.txid !== txid.toLowerCase()) {
    return Promise.resolve('unavailable')
  }
  const fetcher = options.fetcher ?? fetch
  const retryDelaysMs = options.retryDelaysMs ?? [0, 3_000, 8_000, 20_000]
  const settleDelayMs = options.settleDelayMs ?? 1_000
  const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)))
  const requestSignal = () => typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(20_000)
    : undefined
  const lookupUrl = `${GORILLAPOOL}/txos/${parsed.normalized}`
  const isIndexed = async (): Promise<boolean> => {
    try {
      return (await fetcher(lookupUrl, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: requestSignal(),
      })).ok
    } catch {
      return false
    }
  }

  // A writer submits as soon as broadcast succeeds and the UI waits on the same
  // work before reloading. Share that work so those two guarantees do not turn
  // into two independent retry loops hitting GorillaPool for the same txid.
  const existing = indexerSubmissions.get(parsed.normalized)
  if (existing) return existing

  const submission = (async (): Promise<IndexerSubmissionOutcome> => {
    if (await isIndexed()) return 'indexed'
    let accepted = false
    for (const delay of retryDelaysMs) {
      if (delay) await sleep(delay)
      try {
        const response = await fetcher(`${GORILLAPOOL}/tx/${txid}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: requestSignal(),
        })
        // HTTP 204 means only that GorillaPool accepted the request. It can do
        // so before its transaction source has propagated, so never treat the
        // POST itself as proof that public lookup is ready.
        if (!response.ok) continue
        accepted = true
        if (settleDelayMs) await sleep(settleDelayMs)
        if (await isIndexed()) return 'indexed'
      } catch {
        // Not visible yet — the next attempt decides.
      }
    }
    // An accepted submission that is not yet public is the ordinary case for an
    // unconfirmed transaction, and must not read as a failed one.
    return accepted ? 'awaiting-index' : 'unavailable'
  })().finally(() => indexerSubmissions.delete(parsed.normalized))

  indexerSubmissions.set(parsed.normalized, submission)
  return submission
}

/** Whether the network has seen a transaction — asked of WhatsOnChain, which
 *  watches the mempool, not of GorillaPool, which only knows what it was told. */
export async function seenOnNetwork(txid: string): Promise<'confirmed' | 'mempool' | 'unknown'> {
  try {
    const response = await fetch(`${WOC}/tx/hash/${txid}`, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) return 'unknown'
    const tx = (await response.json()) as { confirmations?: number; blockheight?: number }
    return tx.blockheight || (tx.confirmations ?? 0) > 0 ? 'confirmed' : 'mempool'
  } catch {
    return 'unknown'
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type Row = {
  outpoint: string
  origin: string
  /** Current controlling address. While listed, this remains the pre-lock owner
   *  so their existing updates stay live until an actual purchase changes it. */
  owner: string
  height: number | null
  idx: number
  /** Chain position of the immutable origin, retained across later transfers. */
  originHeight: number | null
  originIdx: number
  /** Txid that spends this output, when the indexer has followed it. */
  spend: string
  /** Present while the output sits in a marketplace lock. */
  listing: { price: number; seller: string } | null
  /** As the indexer returned it: some values arrive parsed, not as written. */
  map: Record<string, unknown>
  /** Address from a valid SIGMA signature — '' when absent or invalid. */
  signer: string
  /** Derived from this origin's spend chain; these are transactions, not new MAP records. */
  marketEvents: MarketEvent[]
  /** Every one-satoshi location on the indexed origin spend chain, oldest first. */
  ownershipOutpoints: string[]
  /** The indexer reports a spend txid but has not returned that successor row. */
  chainIncomplete: boolean
}

export type MarketEvent = {
  kind: 'listed' | 'purchased' | 'delisted' | 'transferred'
  outpoint: string
  previousOwner: string
  owner: string
  price: number | null
  height: number | null
  idx: number
}

function validSigmaSigner(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const signature = value.find(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      (entry as { valid?: unknown }).valid === true &&
      typeof (entry as { address?: unknown }).address === 'string'
  ) as { address?: string } | undefined
  return signature?.address?.trim() ?? ''
}

function mapIndexerRow(row: Record<string, any>): Row {
  const originData = (row.origin?.data ?? {}) as Record<string, unknown>
  const map = (originData.map ?? {}) as Record<string, unknown>
  const outpoint = String(row.outpoint ?? row.origin?.outpoint ?? '')
  const origin = String(row.origin?.outpoint ?? row.outpoint ?? '')
  const height = typeof row.height === 'number' ? row.height : null
  const idx = Number(row.idx) || 0
  return {
    listing: readListing(row.data?.list),
    // Where the record lives now — what a spend or a sale would touch.
    outpoint,
    // Its permanent identity, and what other records reference.
    origin,
    owner: String(row.owner ?? ''),
    height,
    idx,
    originHeight: outpoint === origin ? height : null,
    originIdx: outpoint === origin ? idx : 0,
    spend: String(row.spend ?? ''),
    map,
    signer: validSigmaSigner(originData.sigma),
    marketEvents: [],
    ownershipOutpoints: [outpoint],
    chainIncomplete: false,
  }
}

/** Read one exact public outpoint for direct collection-ID opening. */
export async function readRecord(outpoint: string): Promise<Row | null> {
  const response = await fetch(`${GORILLAPOOL}/txos/${encodeURIComponent(outpoint)}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GorillaPool outpoint read failed: ${response.status}`)
  const row = mapIndexerRow((await response.json()) as Record<string, any>)
  return row.outpoint ? row : null
}

/** Every record of one kind in the namespace, newest last. */
export async function readRecords(kind: RecordKind, filter: Record<string, string> = {}) {
  const rows: Array<Record<string, any>> = []
  for (let page = 0; page < MAX_SEARCH_PAGES; page += 1) {
    const offset = page * SEARCH_PAGE_SIZE
    const response = await fetch(
      `${GORILLAPOOL}/txos/search?limit=${SEARCH_PAGE_SIZE}&offset=${offset}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map: {
            app: ADINALS_NAMESPACE.app,
            type: 'ord',
            subType: SUB_TYPE[kind],
            protocolVersion: ADINALS_PROTOCOL_VERSION,
            ...filter,
          },
        }),
      }
    )
    if (!response.ok) throw new Error(`GorillaPool search failed: ${response.status}`)
    const next: unknown = await response.json()
    if (!Array.isArray(next)) throw new Error('GorillaPool search returned a non-array response')
    rows.push(...next as Array<Record<string, any>>)
    if (next.length < SEARCH_PAGE_SIZE) break
    if (page === MAX_SEARCH_PAGES - 1) {
      throw new Error('GorillaPool search exceeded the supported pagination window')
    }
  }

  const mapped = rows
    .map(mapIndexerRow)
    .filter((row) => row.outpoint)
    .sort(chainOrder)

  // One record per origin. Confirmed rows can be ordered by block position, but
  // every mempool row has height=null and idx=0. Sorting those ties made an old
  // listing sometimes overwrite its already-indexed purchase. Follow the
  // indexer's explicit spend chain instead: mint -> listing -> purchase.
  const histories = new Map<string, Row[]>()
  for (const row of mapped) {
    const key = row.origin || row.outpoint
    histories.set(key, [...(histories.get(key) ?? []), row])
  }

  return [...histories.values()].map((history) => {
    const origin = history.find((row) => row.outpoint === row.origin) ?? history[0] as Row
    const byTxid = new Map(
      history.map((row) => [row.outpoint.split(/[._]/)[0] ?? '', row] as const)
    )
    let current = origin
    const chain = [origin]
    const visited = new Set<string>()
    while (current.spend && !visited.has(current.outpoint)) {
      visited.add(current.outpoint)
      const nextRow = byTxid.get(current.spend)
      if (!nextRow) break
      // Listing is not a sale. Preserve the prior owner until a purchase moves
      // the ordinal to a normal output with its buyer as owner.
      const next = nextRow.listing && current.owner
        ? { ...nextRow, owner: current.owner }
        : nextRow
      chain.push(next)
      current = next
    }

    const marketEvents: MarketEvent[] = []
    for (let index = 1; index < chain.length; index += 1) {
      const previous = chain[index - 1] as Row
      const next = chain[index] as Row
      if (next.listing) {
        marketEvents.push({
          kind: 'listed',
          outpoint: next.outpoint,
          previousOwner: previous.owner,
          owner: previous.owner,
          price: next.listing.price,
          height: next.height,
          idx: next.idx,
        })
      } else if (previous.listing) {
        const purchased = Boolean(
          previous.owner && next.owner && previous.owner !== next.owner
        )
        marketEvents.push({
          kind: purchased ? 'purchased' : 'delisted',
          outpoint: next.outpoint,
          previousOwner: previous.owner,
          owner: next.owner || previous.owner,
          price: previous.listing.price,
          height: next.height,
          idx: next.idx,
        })
      } else if (previous.owner && next.owner && previous.owner !== next.owner) {
        marketEvents.push({
          kind: 'transferred',
          outpoint: next.outpoint,
          previousOwner: previous.owner,
          owner: next.owner,
          price: null,
          height: next.height,
          idx: next.idx,
        })
      }
    }
    return {
      ...current,
      originHeight: origin.originHeight,
      originIdx: origin.originIdx,
      marketEvents,
      ownershipOutpoints: chain.map((item) => item.outpoint),
      chainIncomplete: Boolean(current.spend && !byTxid.has(current.spend)),
    }
  })
}

/**
 * GorillaPool discovers the record and supplies parsed MAP/SIGMA metadata. The
 * browser independently checks the spend-linked version 3 authority envelope
 * from immutable raw transactions before the record can affect display state.
 */
export async function proveSpendLinkedRecord(
  recordOutpoint: string,
  predecessorOutpoint: string,
): Promise<SpendLinkedRecordProof> {
  const record = parseProtocolOutpoint(recordOutpoint)
  const predecessor = parseProtocolOutpoint(predecessorOutpoint)
  if (!record || !predecessor) {
    return {
      error: 'malformed transition outpoint',
      predecessorOutpoint,
      successorOutpoint: '',
      recordOutpoint,
      owner: '',
    }
  }

  try {
    const [transaction, predecessorTransaction] = await Promise.all([
      readRawTransaction(record.txid),
      readRawTransaction(predecessor.txid),
    ])
    return validateSpendLinkedRecord(
      transaction,
      predecessorTransaction,
      predecessor.normalized,
      record.normalized,
    )
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      predecessorOutpoint: predecessor.normalized,
      successorOutpoint: '',
      recordOutpoint: record.normalized,
      owner: '',
    }
  }
}

/**
 * Read a listing, decoding who gets paid.
 *
 * `payout` is base64 of a serialized output — eight bytes of value then the
 * script — not an address. Comparing it to an address never matches, which in the
 * previous implementation meant a seller was shown a "buy" button on their own
 * listing.
 */
function readListing(list: unknown): { price: number; seller: string } | null {
  const record = list as { price?: unknown; payout?: unknown } | undefined
  if (!record || typeof record.price !== 'number') return null

  let seller = ''
  if (typeof record.payout === 'string') {
    try {
      const reader = new Utils.Reader(Utils.toArray(record.payout, 'base64'))
      reader.readUInt64LEBn()
      const script = Script.fromBinary(reader.read(reader.readVarIntNum()))
      const hash = script.chunks[2]?.data
      if (script.chunks.length === 5 && hash?.length === 20) seller = Utils.toBase58Check(hash)
    } catch {
      // Unreadable payout — the price still stands, the seller is unknown.
    }
  }

  return { price: record.price, seller }
}

/** Newest last: by block, then position in it, with mempool after everything. */
export function chainOrder(a: Row, b: Row): number {
  const height = (a.height ?? Number.MAX_SAFE_INTEGER) - (b.height ?? Number.MAX_SAFE_INTEGER)
  return height !== 0 ? height : a.idx - b.idx
}
