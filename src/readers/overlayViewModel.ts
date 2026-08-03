/**
 * Derives the rendered collection and ads from verified overlay evidence.
 *
 * One projection response carries everything the interface shows: the mint
 * records supply name, text, destination, and timestamp through MAP, the BEEF
 * merkle path supplies chain position, and the ownership chain supplies the
 * market timeline. Nothing here issues a request, so this is the whole mapping
 * between what the overlay proves and what a visitor sees.
 *
 * Every protocol judgement is made by the shared validators rather than
 * restated, because the overlay path and the public reader must disagree only
 * about evidence. The evidence type is structural for the same reason
 * `ChainState` is: this module must stay runnable under Node's test runner,
 * which cannot resolve the template package the hydrating reader imports.
 */
import {
  adDecisionRecordError,
  adMintRecordError,
  adUpdateRecordError,
  collectionRulesFromRecord,
  readAdinalsSubTypeData,
  validateProtocolAdUrl,
  type AdinalsCollectionRules,
  type AdinalsProtocolRow,
} from '../protocol/recordValidation.ts'
import type { SpendLinkedRecordProof } from '../protocol/transitions.ts'
import {
  collectionFromProtocolRow,
  resolveAdDisplay,
  type Ad,
  type Collection,
  type CreativeFormat,
  type Update,
} from './collectionViewModel.ts'
import { deriveMarketEvents, type ChainState } from './overlayMarketEvents.ts'

/** One verified overlay output, reduced to the facts the view model needs. */
export type EvidenceRecord = ChainState & {
  map: Record<string, string> | null
  /** Address recovered from the record's SIGMA signature, when it carries one. */
  signer: string
  /** The outpoint this record's input 0 spends: the link the chain walk follows. */
  predecessor: string
}

export type CollectionView = {
  collection: Collection
  ads: Ad[]
}

const text = (value: unknown, fallback = ''): string =>
  value === undefined || value === null ? fallback : String(value)

export const protocolRow = (record: EvidenceRecord): AdinalsProtocolRow => ({
  origin: record.outpoint,
  outpoint: record.outpoint,
  owner: record.owner,
  signer: record.signer,
  map: record.map ?? {},
})

const transactionOf = (outpoint: string): string => outpoint.split(/[._]/)[0] ?? ''

/**
 * Rebuilds one ad's ownership chain by following input-0 links from its mint.
 *
 * A projection response interleaves every ad in the collection, so the states
 * cannot be selected by filtering. Following the spend links reconstructs the
 * same ordered chain a per-ad history returns, without depending on the order
 * the node happened to use.
 */
export const ownershipChain = (
  evidence: readonly EvidenceRecord[],
  mint: EvidenceRecord,
): EvidenceRecord[] => {
  const successors = new Map<string, EvidenceRecord>()
  for (const record of evidence) {
    if (
      record.recordType !== 'collectionItem' &&
      record.recordType !== 'listing' &&
      record.recordType !== 'state'
    ) continue
    if (record.predecessor && !successors.has(record.predecessor)) {
      successors.set(record.predecessor, record)
    }
  }
  const chain = [mint]
  const visited = new Set([mint.outpoint])
  for (;;) {
    const next = successors.get(chain[chain.length - 1]!.outpoint)
    if (!next || visited.has(next.outpoint)) break
    visited.add(next.outpoint)
    chain.push(next)
  }
  return chain
}

/**
 * Reconstructs an update's spend-linked proof from the evidence in hand.
 *
 * The public reader fetches two raw transactions to establish this. Here the
 * update record, the state it spent, and the state it produced are all in the
 * same response, so the same facts are read rather than re-fetched. An update
 * whose successor state is absent is reported as unproven rather than assumed,
 * which is what keeps a partially ingested chain from publishing a creative.
 */
export const updateTransition = (
  update: EvidenceRecord,
  byOutpoint: ReadonlyMap<string, EvidenceRecord>,
): SpendLinkedRecordProof => {
  const successorOutpoint = `${transactionOf(update.outpoint)}_0`
  const successor = byOutpoint.get(successorOutpoint)
  if (!update.predecessor) {
    return {
      error: 'update record has no spent predecessor',
      predecessorOutpoint: '',
      successorOutpoint: '',
      recordOutpoint: update.outpoint,
      owner: '',
    }
  }
  if (!successor) {
    return {
      error: 'update successor state is missing from the overlay evidence',
      predecessorOutpoint: update.predecessor,
      successorOutpoint: '',
      recordOutpoint: update.outpoint,
      owner: '',
    }
  }
  return {
    error: '',
    predecessorOutpoint: update.predecessor,
    successorOutpoint,
    recordOutpoint: update.outpoint,
    owner: successor.owner,
  }
}

const deriveUpdates = (
  evidence: readonly EvidenceRecord[],
  byOutpoint: ReadonlyMap<string, EvidenceRecord>,
  mint: EvidenceRecord,
  rules: AdinalsCollectionRules,
  chain: readonly EvidenceRecord[],
  currentOwner: string,
  ownerEpoch: string,
): Update[] => {
  const ownershipOutpoints = chain.map((record) => record.outpoint)
  const records = evidence.filter((record) =>
    record.recordType === 'adUpdate' && text(record.map?.adOrigin) === mint.outpoint)
  const transitions = new Map(
    records.map((record) => [record.outpoint, updateTransition(record, byOutpoint)] as const),
  )

  const ordered = [...records].sort((left, right) => {
    const leftIndex = ownershipOutpoints.indexOf(transitions.get(left.outpoint)?.successorOutpoint ?? '')
    const rightIndex = ownershipOutpoints.indexOf(transitions.get(right.outpoint)?.successorOutpoint ?? '')
    const normalizedLeft = leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex
    const normalizedRight = rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex
    return normalizedLeft - normalizedRight || left.outpoint.localeCompare(right.outpoint)
  })

  return ordered.map((update) => {
    const transition = transitions.get(update.outpoint)!
    const invalidReason = adUpdateRecordError(protocolRow(update), {
      collection: rules,
      adOrigin: mint.outpoint,
      ownershipOutpoints,
      currentOwner,
      currentOwnerEpoch: ownerEpoch,
      transition,
    })

    // Stranger decisions are ignored. If the real creator signs both verdicts
    // for one exact update, fail closed instead of letting response ordering
    // decide which creative becomes live.
    const validVerdicts = evidence.filter((record) =>
      record.recordType === 'adDecision' &&
      (text(record.map?.updateOutpoint) || text(record.map?.revisionOutpoint)) === update.outpoint &&
      !adDecisionRecordError(protocolRow(record), {
        collection: rules,
        adOrigin: mint.outpoint,
        updateOutpoint: update.outpoint,
        adOutpoint: transition.successorOutpoint,
        ownerEpoch,
      }))
    const verdictKinds = new Set(validVerdicts.map((record) => text(record.map?.decision)))
    const conflicted = verdictKinds.has('approved') && verdictKinds.has('disapproved')
    const verdictRecord = validVerdicts[0]

    return {
      outpoint: update.outpoint,
      adOutpoint: transition.successorOutpoint,
      ownerEpoch,
      format: update.map?.adFormat === 'image' ? 'image' : 'text',
      text: text(update.map?.adText),
      contentUrl: update.outpoint,
      url: validateProtocolAdUrl(update.map?.adUrl).url,
      signer: transition.owner || update.signer,
      height: update.height,
      idx: update.index,
      createdAt: text(update.map?.updatedAt),
      valid: !invalidReason,
      invalidReason,
      verdict: conflicted
        ? 'conflicted'
        : verdictRecord
          ? text(verdictRecord.map?.decision) === 'disapproved' ? 'disapproved' : 'approved'
          : undefined,
      verdictOutpoint: verdictRecord?.outpoint,
      verdictAt: verdictRecord ? text(verdictRecord.map?.decidedAt) : undefined,
      verdictHeight: verdictRecord?.height,
      verdictIdx: verdictRecord?.index,
    }
  })
}

const deriveAd = (
  evidence: readonly EvidenceRecord[],
  byOutpoint: ReadonlyMap<string, EvidenceRecord>,
  collection: Collection,
  rules: AdinalsCollectionRules,
  mint: EvidenceRecord,
): Ad => {
  const chain = ownershipChain(evidence, mint)
  const current = chain[chain.length - 1]!
  const previous = chain[chain.length - 2]
  const marketEvents = deriveMarketEvents(chain)
  // A listing is not a sale: the ad keeps its pre-lock owner so their existing
  // updates stay live until an actual purchase moves it.
  const owner = current.recordType === 'listing' ? previous?.owner ?? current.owner : current.owner
  const ownerEpoch = [...marketEvents]
    .reverse()
    .find((event) => event.kind === 'purchased' || event.kind === 'transferred')
    ?.outpoint ?? mint.outpoint

  const data = readAdinalsSubTypeData(mint.map ?? {})
  const format: CreativeFormat = mint.map?.adFormat === 'image' ? 'image' : 'text'
  const mintText = text(mint.map?.adText)
  const mintContentUrl = format === 'image' ? mint.outpoint : ''
  const mintUrl = validateProtocolAdUrl(mint.map?.adUrl).url
  const invalidReason = adMintRecordError(protocolRow(mint), rules)
  const updates = deriveUpdates(evidence, byOutpoint, mint, rules, chain, owner, ownerEpoch)
  const display = resolveAdDisplay(
    updates,
    { text: mintText, contentUrl: mintContentUrl, url: mintUrl },
    collection,
  )

  return {
    origin: mint.outpoint,
    outpoint: current.outpoint,
    collectionId: collection.origin,
    owner,
    ownerEpoch,
    serial: Number(data.mintNumber) || 0,
    name: text(mint.map?.name, '(unnamed)'),
    format,
    mintText,
    mintContentUrl,
    mintUrl,
    mintedAt: text(mint.map?.mintedAt),
    height: mint.height,
    listing: current.listing,
    originHeight: mint.height,
    originIdx: mint.index,
    fromCreator: !invalidReason,
    invalidReason,
    duplicateSlot: false,
    updates,
    ...display,
    marketEvents,
    // Every state the node holds arrives in the same response, so an ad is
    // never waiting on a successor an indexer has not returned yet.
    indexPending: false,
  }
}

/**
 * A collection slot is unique. The earliest creator-signed origin wins; later
 * claims stay visible and manageable, because they are real ordinals, but are
 * labelled duplicates and consume no further collection capacity.
 */
const markDuplicateSlots = (ads: readonly Ad[]): Ad[] => {
  const claims = new Map<string, Ad[]>()
  for (const ad of ads) {
    if (!ad.fromCreator || ad.serial < 1) continue
    const key = `${ad.collectionId}:${ad.serial}`
    claims.set(key, [...(claims.get(key) ?? []), ad])
  }
  const canonical = new Set<string>()
  for (const contested of claims.values()) {
    const ordered = [...contested].sort((left, right) => {
      const height =
        (left.originHeight ?? Number.MAX_SAFE_INTEGER) - (right.originHeight ?? Number.MAX_SAFE_INTEGER)
      if (height !== 0) return height
      if (left.originIdx !== right.originIdx) return left.originIdx - right.originIdx
      return left.origin.localeCompare(right.origin)
    })
    if (ordered[0]) canonical.add(ordered[0].origin)
  }
  return ads.map((ad) => ({
    ...ad,
    duplicateSlot:
      ad.fromCreator &&
      ad.serial > 0 &&
      (claims.get(`${ad.collectionId}:${ad.serial}`)?.length ?? 0) > 1 &&
      !canonical.has(ad.origin),
  }))
}

/**
 * Maps one collection's verified evidence onto the rendered model.
 *
 * Returns null when the evidence contains no valid record for the requested
 * collection, which a caller must treat as "this node does not know" rather
 * than as an empty collection: an overlay answers truthfully with nothing about
 * a record it never ingested.
 */
export function deriveCollectionView(
  evidence: readonly EvidenceRecord[],
  collectionOrigin: string,
  now: Date = new Date(),
): CollectionView | null {
  const origin = collectionOrigin.toLowerCase()
  const record = evidence.find((candidate) =>
    candidate.outpoint === origin && candidate.recordType === 'collection')
  if (!record) return null

  const row = protocolRow(record)
  const validation = collectionRulesFromRecord(row)
  const collection = collectionFromProtocolRow(row, record.height, now)
  if (validation.error || !collection) return null

  const byOutpoint = new Map(evidence.map((candidate) => [candidate.outpoint, candidate] as const))
  const mints = evidence.filter((candidate) =>
    candidate.recordType === 'collectionItem' &&
    text(readAdinalsSubTypeData(candidate.map ?? {}).collectionId) === origin)
  const ads = markDuplicateSlots(
    mints.map((mint) => deriveAd(evidence, byOutpoint, collection, validation.rules, mint)),
  )
  ads.sort((left, right) => left.serial - right.serial || left.origin.localeCompare(right.origin))
  return { collection, ads }
}
