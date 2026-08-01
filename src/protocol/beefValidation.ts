import { Beef } from '@bsv/sdk'

/**
 * Returns dependencies that prevent a BEEF from standing on its own. A valid
 * unmined transaction must either be merkle-proven or include every input
 * transaction recursively; merely avoiding explicit txid-only entries is not
 * sufficient.
 */
export function findUnresolvedBeefDependencies(beef: Beef): string[] {
  const unresolved = new Set<string>()

  for (const item of beef.txs) {
    if (item.isTxidOnly) {
      unresolved.add(item.txid)
      continue
    }
    if (item.hasProof) continue
    const transaction = item.tx
    if (!transaction) {
      unresolved.add(item.txid)
      continue
    }
    for (const input of transaction.inputs) {
      const sourceTxid = input.sourceTXID ?? input.sourceTransaction?.id('hex') ?? ''
      if (!sourceTxid) {
        unresolved.add(`${item.txid}:input-without-source`)
        continue
      }
      const source = beef.findTxid(sourceTxid)
      if (!source || source.isTxidOnly) unresolved.add(sourceTxid)
    }
  }

  return [...unresolved]
}
