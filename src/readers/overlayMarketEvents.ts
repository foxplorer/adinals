import type { MarketEvent } from './collectionViewModel.ts'

/**
 * Derives an ad's market history from its ownership chain.
 *
 * Marketplace activity leaves no signed record of its own: a listing, a sale,
 * and a delisting are ordinary spends of the one-satoshi state, distinguished
 * only by what the successor looks like and who controls it. The chain the
 * overlay returns therefore carries the whole market history already, and this
 * reads it rather than asking an indexer to summarise it.
 *
 * The rules follow the OrdLock covenant the topic manager admits:
 *
 * - spending a state into a recognised lock is a listing;
 * - spending a lock back to its own seller is a delisting;
 * - spending a lock to anyone else is a purchase at the listed price; and
 * - spending a state directly to a different owner is a transfer.
 *
 * A spend that keeps the same owner is an update, which is a signed record
 * rather than a market event, so it is deliberately absent here.
 */
export type ChainState = {
  outpoint: string
  recordType: 'collectionItem' | 'adUpdate' | 'adDecision' | 'collection' | 'listing' | 'state'
  owner: string
  listing: { price: number; seller: string } | null
  height: number | null
  index: number
}

export function deriveMarketEvents(states: readonly ChainState[]): MarketEvent[] {
  const events: MarketEvent[] = []
  for (let position = 1; position < states.length; position += 1) {
    const previous = states[position - 1]!
    const state = states[position]!
    const event = {
      outpoint: state.outpoint,
      height: state.height,
      idx: state.index,
    }

    if (state.recordType === 'listing' && state.listing) {
      events.push({
        ...event,
        kind: 'listed',
        previousOwner: previous.owner,
        owner: state.listing.seller,
        price: state.listing.price,
      })
      continue
    }

    if (previous.recordType === 'listing' && previous.listing) {
      const seller = previous.listing.seller
      events.push({
        ...event,
        kind: state.owner === seller ? 'delisted' : 'purchased',
        previousOwner: seller,
        owner: state.owner,
        // A delisting returns the ad to its seller and moves no money, so the
        // price belongs only to a completed sale.
        price: state.owner === seller ? null : previous.listing.price,
      })
      continue
    }

    if (state.owner !== previous.owner) {
      events.push({
        ...event,
        kind: 'transferred',
        previousOwner: previous.owner,
        owner: state.owner,
        price: null,
      })
    }
  }
  return events
}
