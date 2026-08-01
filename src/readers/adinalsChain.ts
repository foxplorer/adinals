import { chainOrder, type IndexedAdinalsRecord } from './adinalsIndex.ts'

export type AdinalsChain = {
  origin: string
  /** Every one-satoshi location for this record, oldest first. */
  chain: IndexedAdinalsRecord[]
  /** Where the record lives now — what a spend or a sale would touch. */
  current: IndexedAdinalsRecord
  ownershipOutpoints: string[]
}

/**
 * Rebuilds each record's spend chain from a namespace search result.
 *
 * A MAP search returns every txo whose *origin* carries that MAP, so an entire
 * chain arrives in one query and is reassembled by following `spend` links
 * rather than by sorting. Confirmed rows could be ordered by block position,
 * but every mempool row reports `height: null` and `index: 0`; sorting those
 * ties once let a stale listing overwrite its own already-indexed purchase.
 */
export function reconstructChains(
  rows: readonly IndexedAdinalsRecord[],
): Map<string, AdinalsChain> {
  const ordered = [...rows].filter((row) => row.outpoint).sort(chainOrder)

  const histories = new Map<string, IndexedAdinalsRecord[]>()
  for (const row of ordered) {
    const key = row.origin || row.outpoint
    histories.set(key, [...(histories.get(key) ?? []), row])
  }

  const chains = new Map<string, AdinalsChain>()
  for (const [origin, history] of histories) {
    const first = history.find((row) => row.outpoint === row.origin) ?? history[0]
    if (!first) continue

    let current = first
    const chain: IndexedAdinalsRecord[] = [first]
    const visited = new Set<string>()
    while (current.spend && !visited.has(current.outpoint)) {
      visited.add(current.outpoint)
      const next = history.find((row) => row.outpoint.split(/[._]/)[0] === current.spend)
      // A record that reports itself as its own successor must not be able to
      // pad its own ownership chain.
      if (!next || visited.has(next.outpoint)) break
      // Listing is not a sale. Preserve the prior owner until a purchase moves
      // the ordinal to a normal output with its buyer as owner.
      const resolved = next.listing && current.owner ? { ...next, owner: current.owner } : next
      chain.push(resolved)
      current = resolved
    }

    chains.set(origin, {
      origin,
      chain,
      current,
      ownershipOutpoints: chain.map((row) => row.outpoint),
    })
  }

  return chains
}
