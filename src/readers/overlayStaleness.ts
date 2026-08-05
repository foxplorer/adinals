/**
 * Detects an overlay namespace the public chain has already moved past.
 *
 * An overlay knows what was submitted to it. Every record this application
 * writes is delivered by the write path, but a delivery that fails — a wallet
 * that reported "sending" rather than accepted, a tab closed before the retry,
 * a node that was unreachable for a minute — is not noticed by anything that
 * reads. The ad then renders at whatever state the node last admitted, which
 * for a sold listing means it keeps offering itself for sale to the person who
 * already owns it.
 *
 * The test is deliberately one-directional. A record the overlay holds and the
 * indexer has not seen yet is the normal case immediately after publishing, and
 * must never trigger a fallback. Only the opposite proves staleness: the
 * indexer holds a *successor* to the exact output the overlay is rendering.
 */
import type { Ad } from './collectionViewModel.ts'
import type { Row } from './productCatalog.ts'

/**
 * The origins whose overlay-rendered head the indexer reports as already spent.
 *
 * @param overlayAds The ads an overlay namespace read produced.
 * @param indexedAds Ad rows from the public reader, each carrying the ownership
 *   chain the indexer has followed.
 */
export function overlayHeadsWithSuccessors(
  overlayAds: readonly Ad[],
  indexedAds: readonly Row[],
): string[] {
  const rendered = new Map(overlayAds.map((ad) => [ad.origin, ad.outpoint]))
  const behind: string[] = []
  for (const row of indexedAds) {
    const head = rendered.get(row.origin)
    if (!head) continue
    const position = row.ownershipOutpoints.indexOf(head)
    // Absent from the chain means the indexer cannot speak to this state at
    // all, which is not evidence that the overlay is behind.
    if (position >= 0 && position < row.ownershipOutpoints.length - 1) {
      behind.push(row.origin)
    }
  }
  return behind
}
