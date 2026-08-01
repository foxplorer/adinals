import { MerklePath, Transaction, Utils } from '@bsv/sdk'

const WOC = 'https://api.whatsonchain.com/v1/bsv/main'
const GORILLAPOOL = 'https://ordinals.gorillapool.io/api'
const BITAILS = 'https://api.bitails.io'

export type RawTransactionReader = (txid: string) => Promise<Transaction>

/**
 * GorillaPool's transaction endpoint returns its confirmed transaction proof
 * as two CompactSize-prefixed fields: raw transaction bytes followed by a
 * BUMP Merkle path. It is not an EF transaction despite using the generic
 * application/octet-stream content type.
 */
export function parseGorillaPoolTransactionProof(
  payload: number[] | Uint8Array,
): Transaction {
  const bytes = Array.from(payload)
  try {
    const reader = new Utils.Reader(bytes)
    const transactionLength = reader.readVarIntNum()
    if (transactionLength < 10 || transactionLength > bytes.length - reader.pos) {
      throw new Error('invalid transaction length')
    }
    const transactionBytes = reader.read(transactionLength)
    const merklePathLength = reader.readVarIntNum()
    if (merklePathLength < 1 || merklePathLength > bytes.length - reader.pos) {
      throw new Error('invalid Merkle path length')
    }
    const merklePathBytes = reader.read(merklePathLength)
    if (reader.pos !== bytes.length) throw new Error('unexpected trailing bytes')

    const transaction = Transaction.fromBinary(transactionBytes)
    transaction.merklePath = MerklePath.fromBinary(merklePathBytes)
    return transaction
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`GorillaPool transaction proof package is invalid: ${detail}`)
  }
}

/**
 * Immutable transaction bytes for records this wallet does not hold.
 *
 * GorillaPool discovers a third-party record and reports parsed MAP/SIGMA for
 * it, but the spend-linked v3 authority envelope must be checked against raw
 * transactions before that record can affect anything. Three independent
 * sources race, and every one of them must return bytes that hash to the txid
 * that was asked for, so a wrong or substituted transaction cannot be adopted.
 */
export function createRawTransactionReader(fetcher: typeof fetch = fetch): RawTransactionReader {
  const cache = new Map<string, Promise<Transaction>>()

  return function readRawTransaction(txid: string): Promise<Transaction> {
    const normalized = txid.trim().toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(normalized)) {
      return Promise.reject(new Error('A valid transaction id is required.'))
    }
    const existing = cache.get(normalized)
    if (existing) return existing

    const request = (async () => {
      const sources: Array<() => Promise<Transaction>> = [
        async () => {
          const response = await fetcher(`${WOC}/tx/${normalized}/hex`, { signal: AbortSignal.timeout(20_000) })
          if (!response.ok) throw new Error(`WhatsOnChain raw transaction request failed: ${response.status}`)
          let rawHex = (await response.text()).trim()
          if (rawHex.startsWith('"') && rawHex.endsWith('"')) rawHex = JSON.parse(rawHex) as string
          return Transaction.fromHex(rawHex)
        },
        async () => {
          const response = await fetcher(`${BITAILS}/download/tx/${normalized}/hex`, {
            signal: AbortSignal.timeout(20_000),
          })
          if (!response.ok) throw new Error(`Bitails raw transaction request failed: ${response.status}`)
          return Transaction.fromHex((await response.text()).trim())
        },
        async () => {
          const response = await fetcher(`${GORILLAPOOL}/tx/${normalized}`, {
            headers: { Accept: 'application/octet-stream' },
            signal: AbortSignal.timeout(20_000),
          })
          if (!response.ok) throw new Error(`GorillaPool raw transaction request failed: ${response.status}`)
          return parseGorillaPoolTransactionProof(new Uint8Array(await response.arrayBuffer()))
        },
      ]
      for (const read of sources) {
        try {
          const transaction = await read()
          if (transaction.id('hex').toLowerCase() !== normalized) {
            throw new Error(`raw transaction ${normalized} failed its txid check`)
          }
          return transaction
        } catch {
          // Try the next independently verified byte source. Sequential
          // fallback avoids filling the browser console with failures from a
          // slower secondary service when the primary reader already worked.
        }
      }
      throw new Error(`raw transaction ${normalized} is temporarily unavailable`)
    })().catch((error) => {
      cache.delete(normalized)
      throw error as Error
    })

    cache.set(normalized, request)
    return request
  }
}

// Immutable raw bytes are shared across product and ownership readers for the
// page session, so one verified transaction is never fetched twice.
export const readRawTransaction: RawTransactionReader = createRawTransactionReader()
