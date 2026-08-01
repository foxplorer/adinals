const GORILLAPOOL = 'https://ordinals.gorillapool.io/api'

const validateTxid = (txid: string): string => {
  const normalized = txid.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error('GorillaPool submission requires a 64-character transaction ID.')
  return normalized
}

export async function submitTransactionToGorillaPool(
  requestedTxid: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const txid = validateTxid(requestedTxid)
  try {
    const response = await fetcher(`${GORILLAPOOL}/tx/${txid}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(20_000)
        : undefined,
    })
    return response.ok
  } catch {
    return false
  }
}
