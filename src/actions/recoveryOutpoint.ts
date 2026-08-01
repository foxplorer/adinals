export function parseCollectionOutpoint(value: string): {
  txid: string
  vout: number
  ordinal: string
  wallet: string
} {
  const match = value.trim().match(/^([0-9a-f]{64})[._](\d+)$/i)
  if (!match) throw new Error('Enter a collection outpoint as 64-hex-txid_0 or 64-hex-txid.0.')
  const txid = (match[1] as string).toLowerCase()
  const vout = Number(match[2])
  if (!Number.isSafeInteger(vout) || vout < 0) throw new Error('The output index is invalid.')
  return {
    txid,
    vout,
    ordinal: `${txid}_${vout}`,
    wallet: `${txid}.${vout}`,
  }
}
