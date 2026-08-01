import { ADINALS_NAMESPACE } from '../config/environment.ts'
import {
  adDecisionRecordError,
  adMintRecordError,
  adUpdateRecordError,
  collectionRulesFromRecord,
  readAdinalsSubTypeData,
  type AdinalsCollectionRules,
  type AdinalsMap,
  type AdinalsProtocolRow,
} from '../protocol/recordValidation.ts'
import type { SpendLinkedRecordProof } from '../protocol/transitions.ts'
import type { IndexedAdinalsRecord } from './adinalsIndex.ts'
import type { OwnedCustody, OwnedCustodyOutput } from './custodyRouting.ts'

/**
 * The normalized reader model.
 *
 * Ownership is decided by wallet custody, never by comparing an indexed owner
 * field to one permanent address — under BRC-100 no such address exists. The
 * public index supplies discovery and chain position; every protocol claim is
 * re-checked here. Records this wallet holds are validated from the bytes the
 * wallet returned; records it does not hold are validated from independently
 * fetched raw transactions, and say so.
 */
export type RecordEvidence = 'wallet-custody' | 'public-index'

export type OwnedCollection = {
  origin: string
  rules: AdinalsCollectionRules
  valid: boolean
  error: string
  /** This wallet derives the key that signed and owns the collection record. */
  mine: boolean
  evidence: RecordEvidence
  expired: boolean
  custody: OwnedCustodyOutput | null
  indexed: IndexedAdinalsRecord | null
}

export type AdRevision = {
  outpoint: string
  stateOutpoint: string
  signer: string
  valid: boolean
  error: string
  evidence: RecordEvidence
  /** Set when the update's signer is the collection creator: no record needed. */
  selfApproved: boolean
  verdict: 'approved' | 'disapproved' | null
  decisionOutpoint: string
  map: AdinalsMap
}

export type OwnedAd = {
  origin: string
  collectionId: string
  /** Where the one-satoshi ad lives now, which is what a spend would touch. */
  currentOutpoint: string
  currentOwner: string
  ownerEpoch: string
  /** Collection slot this ad claims, from its `subTypeData.mintNumber`. */
  serial: number
  /** The mint is signed by the collection's creator. */
  fromCreator: boolean
  /** A later creator-signed origin claimed a slot already occupied on chain. */
  duplicateSlot: boolean
  /** What this ad currently displays, and whether a proposal is outstanding. */
  live: LiveCreative
  mine: boolean
  valid: boolean
  error: string
  evidence: RecordEvidence
  listed: { price: number; seller: string } | null
  revisions: AdRevision[]
  custody: OwnedCustodyOutput | null
  indexed: IndexedAdinalsRecord | null
}

export type LiveCreative = {
  text: string
  url: string
  status: 'live' | 'pending' | 'rejected'
}

/**
 * What an ad actually displays right now.
 *
 * The mint's creative stands until a *publishable* update replaces it. An
 * update is publishable when the collection publishes openly, when its signer
 * is the collection creator, or when a valid creator decision approved it. The
 * newest valid update also decides whether a proposal is outstanding, so an
 * owner can see that their change is awaiting review rather than live.
 */
export function resolveLiveCreative(
  mintMap: AdinalsMap | null | undefined,
  revisions: readonly AdRevision[],
  approval: AdinalsCollectionRules['approval'],
): LiveCreative {
  const open = approval === 'open'
  let text = stringValue(mintMap?.adText)
  let url = stringValue(mintMap?.adUrl)
  let status: LiveCreative['status'] = 'live'
  let decided = false

  for (let index = revisions.length - 1; index >= 0; index -= 1) {
    const revision = revisions[index]
    if (!revision?.valid) continue
    const publishable = open || revision.selfApproved || revision.verdict === 'approved'
    if (!decided) {
      status = publishable ? 'live' : revision.verdict === 'disapproved' ? 'rejected' : 'pending'
      decided = true
    }
    if (publishable) {
      text = stringValue(revision.map.adText)
      url = stringValue(revision.map.adUrl)
      break
    }
  }

  return { text, url, status }
}

export type PendingApproval = {
  collection: OwnedCollection
  ad: OwnedAd
  revision: AdRevision
}

export type OwnershipModel = {
  collections: OwnedCollection[]
  ads: OwnedAd[]
  /** Updates by other owners awaiting a decision from this wallet's creator key. */
  pendingApprovals: PendingApproval[]
  custody: OwnedCustody
  notices: string[]
}

/**
 * Everything gathered from the public index, keyed for the pure join below.
 * Supplying this separately keeps the model deterministic and testable without
 * a network or a wallet.
 */
export type IndexSnapshot = {
  byOutpoint: Map<string, IndexedAdinalsRecord>
  submissions: Map<string, { updates: IndexedAdinalsRecord[]; decisions: IndexedAdinalsRecord[] }>
  ads: Map<string, IndexedAdinalsRecord[]>
  /** Spend-link proofs for update records, computed from raw transactions. */
  transitions: Map<string, SpendLinkedRecordProof>
  /**
   * Every one-satoshi location on an ad's spend chain, oldest first, keyed by
   * ad origin. Reconstructed by following the chain from the origin — never
   * from the record being validated, which would validate it against itself.
   */
  chains: Map<string, string[]>
}

export const emptyIndexSnapshot = (): IndexSnapshot => ({
  byOutpoint: new Map(),
  submissions: new Map(),
  ads: new Map(),
  transitions: new Map(),
  chains: new Map(),
})

const stringValue = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value)

/**
 * Builds the protocol row for a record this wallet holds. The signer comes
 * from local SIGMA verification and the MAP from the locally decoded script,
 * so an indexer that misreports either cannot change the result.
 */
const rowFromCustody = (
  output: OwnedCustodyOutput,
  origin: string,
): AdinalsProtocolRow => ({
  origin,
  outpoint: output.outpoint,
  owner: output.derivedOwner,
  signer: output.signer,
  map: output.map ?? {},
})

const rowFromIndex = (record: IndexedAdinalsRecord): AdinalsProtocolRow => ({
  origin: record.origin,
  outpoint: record.outpoint,
  owner: record.owner,
  signer: record.signer,
  map: record.map,
})

const isExpired = (map: AdinalsMap, now: Date): boolean => {
  const expiresAt = stringValue(map.expiresAt)
  if (!expiresAt) return false
  const time = Date.parse(expiresAt)
  return Number.isFinite(time) && time <= now.getTime()
}

/**
 * Resolves which collection an owned ad belongs to, and its permanent origin.
 *
 * A mint is its own origin. An update or purchase leaves a plain state output
 * whose identity is not in its own bytes, so it is resolved from the update
 * record beside it in the same transaction, and otherwise from the index's
 * origin field for that exact outpoint.
 */
export function resolveAdIdentity(
  output: OwnedCustodyOutput,
  custody: OwnedCustody,
  snapshot: IndexSnapshot,
): { origin: string; collectionId: string; error: string } {
  if (output.kind === 'mint') {
    const data = readAdinalsSubTypeData(output.map ?? {})
    return {
      origin: output.outpoint,
      collectionId: stringValue(data.collectionId),
      error: stringValue(data.collectionId) ? '' : 'mint does not name a collection',
    }
  }

  if (output.recordOutpoint) {
    const record = custody.outputs.find((candidate) => candidate.outpoint === output.recordOutpoint)
    const map = record?.map
    if (map) {
      return {
        origin: stringValue(map.adOrigin),
        collectionId: stringValue(map.collectionId),
        error: stringValue(map.adOrigin) ? '' : 'update record does not name an ad origin',
      }
    }
  }

  const indexed = snapshot.byOutpoint.get(output.outpoint)
  if (indexed?.origin) {
    const originRecord = snapshot.byOutpoint.get(indexed.origin)
    const data = readAdinalsSubTypeData(originRecord?.map ?? {})
    return {
      origin: indexed.origin,
      collectionId: stringValue(data.collectionId || originRecord?.map.collectionId),
      error: '',
    }
  }

  return {
    origin: '',
    collectionId: '',
    error: 'this Adinal state has no local record and is not yet indexed, so its origin is unknown',
  }
}

const revisionFrom = (
  record: IndexedAdinalsRecord | OwnedCustodyOutput,
  evidence: RecordEvidence,
  context: {
    collection: AdinalsCollectionRules
    adOrigin: string
    ownershipOutpoints: readonly string[]
    currentOwner: string
    currentOwnerEpoch: string
    transition: SpendLinkedRecordProof | undefined
    decisions: IndexedAdinalsRecord[]
  },
): AdRevision => {
  const row = 'kind' in record
    ? rowFromCustody(record, record.outpoint)
    : rowFromIndex(record)
  const map = row.map
  const stateOutpoint = 'kind' in record
    ? record.stateOutpoint
    : stringValue(map.adOutpoint)

  const transition = context.transition
  const error = !transition
    ? 'the update spend chain could not be independently proven'
    : adUpdateRecordError(row, {
        collection: context.collection,
        adOrigin: context.adOrigin,
        ownershipOutpoints: context.ownershipOutpoints,
        currentOwner: context.currentOwner,
        currentOwnerEpoch: context.currentOwnerEpoch,
        transition,
      })

  const selfApproved = Boolean(row.signer) && row.signer === context.collection.creator
  const decision = context.decisions.find((candidate) => {
    const decisionError = adDecisionRecordError(rowFromIndex(candidate), {
      collection: context.collection,
      adOrigin: context.adOrigin,
      updateOutpoint: row.origin,
      adOutpoint: transition?.successorOutpoint ?? stateOutpoint,
      ownerEpoch: context.currentOwnerEpoch,
    })
    return decisionError === ''
  })
  const verdict = decision
    ? (decision.map.decision === 'approved' ? 'approved' : 'disapproved')
    : null

  return {
    outpoint: row.origin,
    stateOutpoint: transition?.successorOutpoint ?? stateOutpoint,
    signer: row.signer,
    valid: error === '',
    error,
    evidence,
    selfApproved,
    verdict,
    decisionOutpoint: decision?.outpoint ?? '',
    map,
  }
}

/**
 * Joins verified wallet custody to verified public history. Pure: every
 * network result arrives through `snapshot`.
 */
export function assembleOwnership(
  custody: OwnedCustody,
  snapshot: IndexSnapshot,
  now: Date = new Date(),
): OwnershipModel {
  const notices: string[] = []
  const collections: OwnedCollection[] = []
  const ads: OwnedAd[] = []

  for (const output of custody.outputs) {
    if (output.kind !== 'collection') continue
    const indexed = snapshot.byOutpoint.get(output.outpoint) ?? null
    const { rules, error } = collectionRulesFromRecord(
      rowFromCustody(output, output.outpoint),
    )
    if (!output.verified) {
      notices.push(`Collection ${output.outpoint.slice(0, 12)}… failed local verification: ${output.errors.join('; ')}`)
    }
    collections.push({
      origin: output.outpoint,
      rules,
      valid: output.verified && error === '',
      error: output.verified ? error : output.errors.join('; '),
      mine: true,
      evidence: 'wallet-custody',
      expired: isExpired(output.map ?? {}, now),
      custody: output,
      indexed,
    })
  }

  const collectionByOrigin = new Map(collections.map((entry) => [entry.origin, entry]))

  // A record output and the live state it produced are one ad, not two. Mints
  // and purchase/update states are the ad-bearing outputs; an update record is
  // folded into its ad's revision list instead of becoming a separate ad.
  const adBearing = custody.outputs.filter(
    (output) => output.spendable && (
      output.kind === 'mint' || output.kind === 'state' || output.kind === 'listing'
    ),
  )

  for (const output of adBearing) {
    const identity = resolveAdIdentity(output, custody, snapshot)
    if (identity.error && !identity.origin) {
      notices.push(`${output.outpoint.slice(0, 12)}…: ${identity.error}`)
      continue
    }
    const indexedState = snapshot.byOutpoint.get(output.outpoint) ?? null
    if (indexedState?.spend) {
      // A different connected wallet can spend this output before the
      // seller's basket monitor notices. The exact indexed TXO is stronger
      // evidence than a stale local `spendable` flag, even when the broader
      // collection-chain query has not caught up yet.
      continue
    }
    const publicChain = snapshot.chains.get(identity.origin) ?? []
    if (
      publicChain.includes(output.outpoint)
      && publicChain.at(-1) !== output.outpoint
    ) {
      // Another wallet can spend a listed Adinal before this wallet's local
      // basket monitor marks its historical output unspendable. Publicly
      // proven successors make that stale custody record provenance, not
      // current ownership.
      continue
    }
    if (ads.some((ad) => ad.origin === identity.origin)) continue

    const indexedOrigin = snapshot.byOutpoint.get(identity.origin) ?? null
    const parent = collectionByOrigin.get(identity.collectionId)

    // The permanent identity is the mint; the live location is this output.
    const originRow = output.kind === 'mint'
      ? rowFromCustody(output, identity.origin)
      : indexedOrigin ? rowFromIndex(indexedOrigin) : null
    const evidence: RecordEvidence = output.kind === 'mint' ? 'wallet-custody' : 'public-index'

    let error = ''
    if (!parent) error = 'the collection for this ad is not held by this wallet'
    else if (!parent.valid) error = 'the collection record for this ad is invalid'
    else if (!originRow) error = 'the ad mint record is not available from custody or the index'
    else error = adMintRecordError(originRow, parent.rules)
    if (output.kind !== 'listing' && !output.verified) {
      error = error || output.errors.join('; ')
    }

    const submissions = snapshot.submissions.get(identity.collectionId)
    // The chain comes from the index for published ads. Custody adds the
    // locations this wallet can prove it holds, which covers a no-send ad the
    // index has never seen.
    const ownershipOutpoints = [
      ...new Set([
        identity.origin,
        ...(snapshot.chains.get(identity.origin) ?? []),
        ...custody.outputs
          .filter((entry) => entry.kind === 'state' || entry.kind === 'mint')
          .map((entry) => entry.outpoint),
        ...(indexedState ? [indexedState.outpoint] : []),
      ]),
    ]
    const currentOwner = output.derivedOwner
    const ownerEpoch = identity.origin

    const revisions = parent && parent.valid
      ? (submissions?.updates ?? [])
          .filter((update) => stringValue(update.map.adOrigin) === identity.origin)
          .map((update) => revisionFrom(update, 'public-index', {
            collection: parent.rules,
            adOrigin: identity.origin,
            ownershipOutpoints,
            currentOwner,
            currentOwnerEpoch: ownerEpoch,
            transition: snapshot.transitions.get(update.origin),
            decisions: submissions?.decisions ?? [],
          }))
      : []

    const originMap = output.kind === 'mint' ? output.map : indexedOrigin?.map
    ads.push({
      origin: identity.origin,
      collectionId: identity.collectionId,
      currentOutpoint: output.outpoint,
      currentOwner,
      ownerEpoch,
      serial: Number(readAdinalsSubTypeData(originMap ?? {}).mintNumber) || 0,
      fromCreator: error === '',
      duplicateSlot: false,
      live: resolveLiveCreative(originMap, revisions, parent?.rules.approval ?? 'creator'),
      mine: true,
      valid: error === '',
      error,
      evidence,
      listed: output.listing,
      revisions,
      custody: output,
      indexed: indexedOrigin,
    })
  }

  markDuplicateSlots(collections, ads, snapshot)

  return {
    collections,
    ads,
    pendingApprovals: derivePendingApprovals(collections, ads, custody, snapshot, now),
    custody,
    notices,
  }
}

type SlotClaim = { origin: string; height: number | null; index: number }

/**
 * A collection slot is unique. The earliest creator-signed origin wins; later
 * claims stay visible and manageable, because they are real ordinals, but are
 * labelled duplicates and do not consume more collection capacity.
 *
 * Claims are gathered from the public index as well as from custody, so a
 * duplicate minted by a wallet that is not connected still displaces a later
 * local one.
 */
export function markDuplicateSlots(
  collections: OwnedCollection[],
  ads: OwnedAd[],
  snapshot: IndexSnapshot,
): void {
  const claims = new Map<string, SlotClaim[]>()
  const add = (collectionId: string, serial: number, claim: SlotClaim) => {
    if (!collectionId || serial < 1) return
    const key = `${collectionId}:${serial}`
    const existing = claims.get(key) ?? []
    if (existing.some((entry) => entry.origin === claim.origin)) return
    claims.set(key, [...existing, claim])
  }

  for (const ad of ads) {
    if (!ad.fromCreator) continue
    add(ad.collectionId, ad.serial, {
      origin: ad.origin,
      height: ad.indexed?.height ?? null,
      index: ad.indexed?.index ?? 0,
    })
  }

  for (const collection of collections) {
    if (!collection.valid) continue
    for (const record of snapshot.ads.get(collection.origin) ?? []) {
      if (record.outpoint !== record.origin) continue
      if (adMintRecordError(rowFromIndex(record), collection.rules) !== '') continue
      const data = readAdinalsSubTypeData(record.map)
      add(collection.origin, Number(data.mintNumber) || 0, {
        origin: record.origin,
        height: record.height,
        index: record.index,
      })
    }
  }

  const canonical = new Set<string>()
  for (const entries of claims.values()) {
    if (entries.length < 2) {
      if (entries[0]) canonical.add(entries[0].origin)
      continue
    }
    const sorted = [...entries].sort((a, b) => {
      // An unconfirmed claim has no chain position and cannot outrank a mined
      // one, so a no-send duplicate never displaces a published ad.
      const height = (a.height ?? Number.MAX_SAFE_INTEGER) - (b.height ?? Number.MAX_SAFE_INTEGER)
      if (height !== 0) return height
      if (a.index !== b.index) return a.index - b.index
      return a.origin.localeCompare(b.origin)
    })
    if (sorted[0]) canonical.add(sorted[0].origin)
  }

  for (const ad of ads) {
    const entries = claims.get(`${ad.collectionId}:${ad.serial}`) ?? []
    ad.duplicateSlot = ad.fromCreator && ad.serial >= 1 && entries.length > 1 && !canonical.has(ad.origin)
  }
}

/**
 * Updates awaiting this wallet's creator decision.
 *
 * These are deliberately not limited to ads in the wallet's own basket: the
 * whole point of creator approval is to review another owner's update, which
 * can only ever be discovered from the public index.
 */
export function derivePendingApprovals(
  collections: OwnedCollection[],
  ads: OwnedAd[],
  custody: OwnedCustody,
  snapshot: IndexSnapshot,
  now: Date = new Date(),
): PendingApproval[] {
  const pending: PendingApproval[] = []

  for (const collection of collections) {
    if (!collection.mine || !collection.valid) continue
    if (collection.rules.approval === 'open' || collection.expired) continue

    const submissions = snapshot.submissions.get(collection.origin)
    if (!submissions?.updates.length) continue

    const indexedAds = snapshot.ads.get(collection.origin) ?? []
    for (const update of submissions.updates) {
      const adOrigin = stringValue(update.map.adOrigin)
      if (!adOrigin) continue

      const owned = ads.find((ad) => ad.origin === adOrigin)
      const indexedAd = snapshot.byOutpoint.get(adOrigin)
        ?? indexedAds.find((candidate) => candidate.origin === adOrigin)
      if (!owned && !indexedAd) continue

      const indexedMintError = indexedAd
        ? adMintRecordError(rowFromIndex(indexedAd), collection.rules)
        : 'the ad mint record is not available'
      const ad: OwnedAd = owned ?? {
        origin: adOrigin,
        collectionId: collection.origin,
        currentOutpoint: indexedAd?.outpoint ?? adOrigin,
        currentOwner: indexedAd?.owner ?? '',
        ownerEpoch: adOrigin,
        serial: Number(readAdinalsSubTypeData(indexedAd?.map ?? {}).mintNumber) || 0,
        fromCreator: indexedMintError === '',
        duplicateSlot: false,
        live: resolveLiveCreative(indexedAd?.map, [], collection.rules.approval),
        mine: false,
        valid: indexedMintError === '',
        error: indexedMintError,
        evidence: 'public-index',
        listed: null,
        revisions: [],
        custody: null,
        indexed: indexedAd ?? null,
      }

      // A duplicate slot claim is a real ordinal but does not occupy the slot,
      // so its updates are not the creator's to approve.
      if (ad.duplicateSlot || !ad.fromCreator) continue

      // Both the current owner and the ownership epoch must come from the ad's
      // own reconstructed history. Taking them from the update being reviewed
      // would make the "not current owner" and epoch checks validate the
      // record against itself, and approve anything.
      const revision = revisionFrom(update, 'public-index', {
        collection: collection.rules,
        adOrigin,
        ownershipOutpoints: snapshot.chains.get(adOrigin) ?? [],
        currentOwner: ad.currentOwner,
        currentOwnerEpoch: ad.ownerEpoch,
        transition: snapshot.transitions.get(update.origin),
        decisions: submissions.decisions,
      })

      // A creator's own update is self-approved by address equality under the
      // original v3 rules, and an already-decided update is not pending.
      if (revision.selfApproved || revision.verdict) continue
      if (!revision.valid) continue

      pending.push({ collection, ad, revision })
    }
  }

  return pending
}

/** The basket every ownership read is scoped to. */
export const ownershipBasket = (): string => ADINALS_NAMESPACE.basket
