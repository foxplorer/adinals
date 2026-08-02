import type { Transaction } from '@bsv/sdk'

/**
 * Version 3 anchors a collection's SIGMA signature to the outpoint spent at
 * input 0. Only that position is protocol-significant: both the browser
 * verifier and the overlay's record envelope read the anchor from input 0 and
 * ignore every later input.
 *
 * A wallet may therefore add its own funding inputs after the anchor. Metanet
 * Desktop does; Yours Wallet spends the anchor alone. What must never happen is
 * the anchor moving off index 0, because the recovered signature would then be
 * verified against an unrelated outpoint.
 */
export type CollectionAnchor = {
  txid: string
  vout: number
  outpoint: string
}

export const readCollectionAnchor = (transaction: Transaction): CollectionAnchor | null => {
  const input = transaction.inputs[0]
  const txid = input?.sourceTXID ?? input?.sourceTransaction?.id('hex') ?? ''
  const vout = input?.sourceOutputIndex ?? -1
  if (!/^[0-9a-f]{64}$/i.test(txid) || vout < 0) return null
  return { txid, vout, outpoint: `${txid}_${vout}` }
}

export const collectionAnchorErrors = (
  transaction: Transaction,
  expectedAnchorOutpoint = '',
): string[] => {
  const anchor = readCollectionAnchor(transaction)
  if (!anchor) return ['collection anchor outpoint is unavailable']
  if (expectedAnchorOutpoint && anchor.outpoint !== expectedAnchorOutpoint) {
    return [
      `collection input 0 spends ${anchor.outpoint} rather than the signed anchor ${expectedAnchorOutpoint}`,
    ]
  }
  return []
}
