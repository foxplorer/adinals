const WOC = 'https://api.whatsonchain.com/v1/bsv/main'
const GORILLAPOOL = 'https://ordinals.gorillapool.io/api'

export type ReaderPresence = 'present' | 'absent' | 'unavailable'

export type ReaderStatus = {
  presence: ReaderPresence
  detail: string
}

export type TransactionNetworkStatus = {
  txid: string
  whatsOnChain: ReaderStatus
  gorillaPool: ReaderStatus
}

export type CollectionNetworkPreflight = {
  checkedAt: string
  anchor: TransactionNetworkStatus
  collection: TransactionNetworkStatus
  allReadersAbsent: boolean
}

const validateTxid = (txid: string): string => {
  const normalized = txid.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error('Network status requires a 64-character transaction ID.')
  return normalized
}

const timeoutSignal = (): AbortSignal | undefined =>
  typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(15_000)
    : undefined

async function readWhatsOnChain(txid: string, fetcher: typeof fetch): Promise<ReaderStatus> {
  try {
    const response = await fetcher(`${WOC}/tx/hash/${txid}`, { signal: timeoutSignal() })
    if (response.status === 404) return { presence: 'absent', detail: 'Transaction not found' }
    if (!response.ok) return { presence: 'unavailable', detail: `HTTP ${response.status}` }
    const body = await response.json() as { confirmations?: number; blockheight?: number }
    const confirmed = Boolean(body.blockheight || (body.confirmations ?? 0) > 0)
    return { presence: 'present', detail: confirmed ? 'Confirmed' : 'Seen in mempool' }
  } catch (error) {
    return {
      presence: 'unavailable',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

async function readGorillaPool(txid: string, fetcher: typeof fetch, indexedOutpoint?: string): Promise<ReaderStatus> {
  try {
    // Origin indexing is output-specific. The transaction-level inscription
    // endpoint can say "not found" while the exact txo is already indexed.
    const endpoint = indexedOutpoint
      ? `${GORILLAPOOL}/txos/${indexedOutpoint.replace('.', '_')}`
      : `${GORILLAPOOL}/inscriptions/txid/${txid}`
    const response = await fetcher(endpoint, {
      headers: { Accept: 'application/json' },
      signal: timeoutSignal(),
    })
    if (response.status === 404) return { presence: 'absent', detail: 'Transaction not indexed' }
    if (!response.ok) return { presence: 'unavailable', detail: `HTTP ${response.status}` }
    const body = (await response.text()).trim()
    if (!body || body === '[]' || body === 'null') {
      return { presence: 'absent', detail: 'No indexed inscription returned' }
    }
    return { presence: 'present', detail: 'Inscription indexed' }
  } catch (error) {
    return {
      presence: 'unavailable',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function readTransactionNetworkStatus(
  requestedTxid: string,
  fetcher: typeof fetch = fetch,
  indexedOutpoint?: string,
): Promise<TransactionNetworkStatus> {
  const txid = validateTxid(requestedTxid)
  const [whatsOnChain, gorillaPool] = await Promise.all([
    readWhatsOnChain(txid, fetcher),
    readGorillaPool(txid, fetcher, indexedOutpoint),
  ])
  return { txid, whatsOnChain, gorillaPool }
}

export async function readCollectionNetworkPreflight(
  anchorTxid: string,
  collectionTxid: string,
  fetcher: typeof fetch = fetch,
  collectionOutpoint?: string,
): Promise<CollectionNetworkPreflight> {
  const [anchor, collection] = await Promise.all([
    readTransactionNetworkStatus(anchorTxid, fetcher),
    readTransactionNetworkStatus(collectionTxid, fetcher, collectionOutpoint),
  ])
  const statuses = [
    anchor.whatsOnChain,
    anchor.gorillaPool,
    collection.whatsOnChain,
    collection.gorillaPool,
  ]
  return {
    checkedAt: new Date().toISOString(),
    anchor,
    collection,
    allReadersAbsent: statuses.every((status) => status.presence === 'absent'),
  }
}
