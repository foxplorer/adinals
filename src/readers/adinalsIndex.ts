import { ADINALS_NAMESPACE } from '../config/environment.ts'

const GORILLAPOOL = 'https://ordinals.gorillapool.io/api'
const PAGE_SIZE = 200
const MAX_PAGES = 100

export type IndexedRecordKind = 'collection' | 'ad' | 'update' | 'decision'

export const INDEXED_SUB_TYPE: Record<IndexedRecordKind, string> = {
  collection: 'collection',
  ad: 'collectionItem',
  update: 'adUpdate',
  decision: 'adDecision',
}

export type IndexedAdinalsRecord = {
  outpoint: string
  origin: string
  owner: string
  signer: string
  spend: string
  height: number | null
  index: number
  map: Record<string, unknown>
  listing: { price: number; seller: string } | null
}

const validSigner = (value: unknown): string => {
  if (!Array.isArray(value)) return ''
  const signature = value.find((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : null
    return record?.valid === true && typeof record.address === 'string'
  }) as { address?: string } | undefined
  return signature?.address?.trim() ?? ''
}

const indexedRow = (value: unknown): IndexedAdinalsRecord | null => {
  const row = value && typeof value === 'object' ? value as Record<string, any> : null
  if (!row) return null
  const originData = row.origin?.data && typeof row.origin.data === 'object' ? row.origin.data : {}
  const list = row.data?.list && typeof row.data.list === 'object' ? row.data.list : null
  const price = Number(list?.price)
  const outpoint = String(row.outpoint ?? row.origin?.outpoint ?? '')
  if (!outpoint) return null
  return {
    outpoint,
    origin: String(row.origin?.outpoint ?? outpoint),
    owner: String(row.owner ?? ''),
    signer: validSigner(originData.sigma),
    spend: String(row.spend ?? ''),
    height: typeof row.height === 'number' ? row.height : null,
    index: Number(row.idx) || 0,
    map: originData.map && typeof originData.map === 'object' ? originData.map : {},
    listing: list && Number.isSafeInteger(price) && price > 0
      ? { price, seller: String(list.seller ?? '') }
      : null,
  }
}

/**
 * GorillaPool is a discovery layer, not an authority. Every row it returns is
 * re-validated locally against the transaction bytes before the application
 * treats it as an Adinals fact; this reader only finds candidates.
 *
 * `mapFilter` narrows the server-side search by top-level MAP fields. Updates
 * and decisions carry `collectionId` at the top level and can be filtered this
 * way; a mint carries it inside `subTypeData`, so mints must be filtered
 * client-side instead.
 */
export async function readIndexedAdinals(
  kind: IndexedRecordKind,
  fetcher: typeof fetch = fetch,
  mapFilter: Record<string, string> = {},
): Promise<IndexedAdinalsRecord[]> {
  const records: IndexedAdinalsRecord[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await fetcher(
      `${GORILLAPOOL}/txos/search?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map: {
            app: ADINALS_NAMESPACE.app,
            type: 'ord',
            subType: INDEXED_SUB_TYPE[kind],
            protocolVersion: '3',
            ...mapFilter,
          },
        }),
      },
    )
    if (!response.ok) throw new Error(`GorillaPool ${kind} search failed: ${response.status}`)
    const rows = await response.json() as unknown
    if (!Array.isArray(rows)) throw new Error('GorillaPool search returned a non-array response.')
    records.push(...rows.map(indexedRow).filter((row): row is IndexedAdinalsRecord => Boolean(row)))
    if (rows.length < PAGE_SIZE) return records
  }
  throw new Error('GorillaPool search exceeded the configured pagination limit.')
}

/**
 * Reads one exact output. This is the endpoint that resolves an Adinals record
 * by origin; the transaction-level inscription endpoint reports a misleading
 * "inscription not found" for records it nonetheless indexes.
 */
export async function readIndexedRecord(
  outpoint: string,
  fetcher: typeof fetch = fetch,
): Promise<IndexedAdinalsRecord | null> {
  const normalized = outpoint.trim().replace('.', '_')
  if (!/^[0-9a-f]{64}_\d+$/i.test(normalized)) throw new Error('A valid outpoint is required.')
  const response = await fetcher(`${GORILLAPOOL}/txos/${encodeURIComponent(normalized)}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GorillaPool outpoint read failed: ${response.status}`)
  const row = indexedRow(await response.json() as unknown)
  return row && row.outpoint ? row : null
}

/**
 * Updates and decisions written by *other* owners against a wallet-owned
 * collection. These can never be found in the creator's own basket, so a
 * creator-approval collection is unreviewable without this query.
 */
export async function readCollectionSubmissions(
  collectionId: string,
  fetcher: typeof fetch = fetch,
): Promise<{ updates: IndexedAdinalsRecord[]; decisions: IndexedAdinalsRecord[] }> {
  const normalized = collectionId.trim().replace('.', '_')
  if (!/^[0-9a-f]{64}_\d+$/i.test(normalized)) throw new Error('A valid collection outpoint is required.')
  const [updates, decisions] = await Promise.all([
    readIndexedAdinals('update', fetcher, { collectionId: normalized }),
    readIndexedAdinals('decision', fetcher, { collectionId: normalized }),
  ])
  return { updates, decisions }
}

/**
 * Every indexed ad claiming membership of one collection. A mint stores its
 * `collectionId` inside `subTypeData`, which the search API does not index as
 * a filterable field, so this narrows client-side after the namespace query.
 */
export async function readCollectionAds(
  collectionId: string,
  fetcher: typeof fetch = fetch,
): Promise<IndexedAdinalsRecord[]> {
  const normalized = collectionId.trim().replace('.', '_')
  const ads = await readIndexedAdinals('ad', fetcher)
  return ads.filter((ad) => {
    const raw = ad.map.subTypeData
    if (raw && typeof raw === 'object') {
      return (raw as { collectionId?: unknown }).collectionId === normalized
    }
    if (typeof raw !== 'string') return false
    try {
      return (JSON.parse(raw) as { collectionId?: unknown }).collectionId === normalized
    } catch {
      return false
    }
  })
}

/** Newest last: by block, then position in it, with mempool after everything. */
export function chainOrder(a: IndexedAdinalsRecord, b: IndexedAdinalsRecord): number {
  const height = (a.height ?? Number.MAX_SAFE_INTEGER) - (b.height ?? Number.MAX_SAFE_INTEGER)
  return height !== 0 ? height : a.index - b.index
}

export async function readIndexedAdinalsSummary(fetcher: typeof fetch = fetch) {
  const [collections, ads, updates, decisions] = await Promise.all([
    readIndexedAdinals('collection', fetcher),
    readIndexedAdinals('ad', fetcher),
    readIndexedAdinals('update', fetcher),
    readIndexedAdinals('decision', fetcher),
  ])
  return { collections, ads, updates, decisions }
}
