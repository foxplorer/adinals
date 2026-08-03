/**
 * Builds the ownership reader's index snapshot from overlay evidence.
 *
 * The ownership model already gets custody from the wallet, which needs no
 * third party. What it still asked GorillaPool for is the public half: the
 * records behind each held outpoint, each collection's updates and decisions,
 * every ad's spend chain, and a raw-transaction proof per update. All four are
 * present in the projections the application already reads, so this converts
 * them rather than fetching them again.
 *
 * The update proofs are the largest saving. The reference path fetches two raw
 * transactions per update and spends most of its time there; here the record,
 * the state it spent, and the state it produced arrive together.
 *
 * Whether the result may be used is decided by the caller: a snapshot that does
 * not cover every outpoint a wallet holds must not be mixed with a reader that
 * would.
 */
import type { IndexedAdinalsRecord } from './adinalsIndex.ts'
import type { IndexSnapshot } from './ownershipModel.ts'
import {
  ownershipChain,
  updateTransition,
  type EvidenceRecord,
} from './overlayViewModel.ts'

const transactionOf = (outpoint: string): string => outpoint.split(/[._]/)[0] ?? ''

const indexedRecord = (
  record: EvidenceRecord,
  origin: string,
  spend: string,
): IndexedAdinalsRecord => ({
  outpoint: record.outpoint,
  origin,
  owner: record.owner,
  signer: record.signer,
  spend,
  height: record.height,
  index: record.index,
  map: record.map ?? {},
  listing: record.listing,
})

/**
 * Converts one collection's evidence. Merges into an existing snapshot so a
 * namespace of several collections builds one index, exactly as the reference
 * reader's per-collection searches do.
 */
export function addOverlayEvidenceToSnapshot(
  snapshot: IndexSnapshot,
  collectionOrigin: string,
  evidence: readonly EvidenceRecord[],
): IndexSnapshot {
  const byOutpoint = new Map(evidence.map((record) => [record.outpoint, record] as const))

  // The overlay states which output a record spent; the index states which
  // transaction spent it. One is the other reversed, and the ownership model
  // reads the second.
  const spentBy = new Map<string, string>()
  for (const record of evidence) {
    if (record.predecessor) spentBy.set(record.predecessor, transactionOf(record.outpoint))
  }

  const collection = evidence.find((record) =>
    record.outpoint === collectionOrigin && record.recordType === 'collection')
  if (collection) {
    snapshot.byOutpoint.set(collection.outpoint, indexedRecord(
      collection,
      collection.outpoint,
      spentBy.get(collection.outpoint) ?? '',
    ))
  }

  const mints = evidence.filter((record) => record.recordType === 'collectionItem')
  const ads: IndexedAdinalsRecord[] = []
  for (const mint of mints) {
    const chain = ownershipChain(evidence, mint)
    snapshot.chains.set(mint.outpoint, chain.map((record) => record.outpoint))
    // Every state on an ad's chain carries the ad's immutable origin, which is
    // how the model joins a held output back to the record it belongs to.
    for (const state of chain) {
      snapshot.byOutpoint.set(state.outpoint, indexedRecord(
        state,
        mint.outpoint,
        spentBy.get(state.outpoint) ?? '',
      ))
    }
    ads.push(snapshot.byOutpoint.get(mint.outpoint)!)
  }
  snapshot.ads.set(collectionOrigin, [...(snapshot.ads.get(collectionOrigin) ?? []), ...ads])

  const updates: IndexedAdinalsRecord[] = []
  const decisions: IndexedAdinalsRecord[] = []
  for (const record of evidence) {
    if (record.recordType === 'adUpdate') {
      const entry = indexedRecord(record, record.outpoint, spentBy.get(record.outpoint) ?? '')
      snapshot.byOutpoint.set(record.outpoint, entry)
      updates.push(entry)
      snapshot.transitions.set(record.outpoint, updateTransition(record, byOutpoint))
    } else if (record.recordType === 'adDecision') {
      const entry = indexedRecord(record, record.outpoint, spentBy.get(record.outpoint) ?? '')
      snapshot.byOutpoint.set(record.outpoint, entry)
      decisions.push(entry)
    }
  }
  const existing = snapshot.submissions.get(collectionOrigin)
  snapshot.submissions.set(collectionOrigin, {
    updates: [...(existing?.updates ?? []), ...updates],
    decisions: [...(existing?.decisions ?? []), ...decisions],
  })

  return snapshot
}

/**
 * Whether a snapshot can answer for everything this wallet holds.
 *
 * A held outpoint the overlay never ingested would otherwise render as an
 * Adinal with no public history, which looks like a broken record rather than
 * an incomplete index. Missing outpoints are returned so the caller can say
 * which, and fall back as a whole.
 */
export function snapshotCoverage(
  snapshot: IndexSnapshot,
  heldOutpoints: readonly string[],
): { covered: boolean; missing: string[] } {
  const missing = heldOutpoints.filter((outpoint) => !snapshot.byOutpoint.has(outpoint))
  return { covered: missing.length === 0, missing }
}
