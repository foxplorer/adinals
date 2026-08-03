/**
 * The shapes the collection interface renders.
 *
 * They live here rather than beside the page so a reader can produce them
 * directly. The overlay projection and the current public reader are then two
 * sources for one model instead of two parallel models.
 */
import {
  collectionRulesFromRecord,
  readAdinalsSubTypeData,
  type AdinalsProtocolRow,
} from '../protocol/recordValidation.ts'

export type CreativeFormat = 'text' | 'image'

/** A transaction on an ad's spend chain, rather than a new signed record. */
export type MarketEvent = {
  kind: 'listed' | 'purchased' | 'delisted' | 'transferred'
  outpoint: string
  previousOwner: string
  owner: string
  price: number | null
  height: number | null
  idx: number
}

export type Collection = {
  origin: string
  name: string
  description: string
  /** Verified SIGMA address — the only identity that can approve. */
  creator: string
  max: number
  approval: string
  contentPolicy: string
  format: CreativeFormat
  imageProfile: string
  maxChars: number
  placement: string
  expiresAt: string
  expired: boolean
  height: number | null
}

export type Update = {
  outpoint: string
  /** Output 0 of the same transaction: the live Adinal state this update describes. */
  adOutpoint: string
  /** The transfer/purchase outpoint that began the current owner's epoch. */
  ownerEpoch: string
  format: CreativeFormat
  text: string
  contentUrl: string
  url: string
  signer: string
  height: number | null
  idx: number
  createdAt: string
  /** Signed by whoever holds the ad right now. */
  valid: boolean
  invalidReason: string
  verdict?: 'approved' | 'disapproved' | 'conflicted'
  verdictOutpoint?: string
  verdictAt?: string
  verdictHeight?: number | null
  verdictIdx?: number
}

export type Ad = {
  origin: string
  outpoint: string
  collectionId: string
  owner: string
  ownerEpoch: string
  serial: number
  name: string
  format: CreativeFormat
  mintText: string
  mintContentUrl: string
  mintUrl: string
  mintedAt: string
  height: number | null
  listing: { price: number; seller: string } | null
  originHeight: number | null
  originIdx: number
  /** False when the ad was not signed by the collection's creator. */
  fromCreator: boolean
  invalidReason: string
  /** A later creator-signed origin claimed a slot already occupied on chain. */
  duplicateSlot: boolean
  updates: Update[]
  liveText: string
  liveContentUrl: string
  liveUrl: string
  status: 'live' | 'pending' | 'rejected'
  marketEvents: MarketEvent[]
  /** A spend is known, but GorillaPool has not returned its successor state. */
  indexPending: boolean
}

const text = (value: unknown, fallback = ''): string =>
  value === undefined || value === null ? fallback : String(value)

/**
 * Builds the rendered collection from one verified protocol record.
 *
 * Both readers hand the same record here rather than each mapping MAP onto the
 * view themselves, so a divergence between them can only come from the evidence
 * they read and never from how they read it. Returns null for a record that
 * fails the collection rules, which is how an invalid record stays invisible
 * rather than becoming a half-rendered collection.
 */
export function collectionFromProtocolRow(
  row: AdinalsProtocolRow,
  height: number | null,
  now: Date = new Date(),
): Collection | null {
  const validation = collectionRulesFromRecord(row)
  if (validation.error) return null

  const data = readAdinalsSubTypeData(row.map)
  const expiresAt = text(row.map.expiresAt)
  const expiration = Date.parse(expiresAt)
  return {
    origin: row.origin,
    name: text(row.map.name, '(unnamed)'),
    description: text(data.description),
    creator: row.signer,
    max: validation.rules.capacity,
    approval: validation.rules.approval,
    contentPolicy: text(row.map.adContentPolicy, 'unspecified'),
    format: validation.rules.format,
    imageProfile: validation.rules.imageProfile ?? '',
    maxChars: validation.rules.maxChars ?? 0,
    placement: text(row.map.adPlacement),
    expiresAt,
    expired: Number.isFinite(expiration) && expiration <= now.getTime(),
    height,
  }
}

/** What an ad displays now, and whether its owner has a proposal outstanding. */
export type AdDisplay = {
  liveText: string
  liveContentUrl: string
  liveUrl: string
  status: Ad['status']
}

/**
 * Resolves the live creative and proposal status from an ad's update timeline.
 *
 * Status describes the current owner's newest proposal, while the live creative
 * resolves independently to that owner's newest publishable update. A pending or
 * rejected proposal must not erase an older approval; after a sale, former-owner
 * updates are invalid and the mint creative remains until the buyer gets an
 * update published.
 */
export function resolveAdDisplay(
  updates: readonly Update[],
  mint: { text: string; contentUrl: string; url: string },
  collection: { approval: string; creator: string },
): AdDisplay {
  const open = collection.approval === 'open'
  let liveText = mint.text
  let liveContentUrl = mint.contentUrl
  let liveUrl = mint.url
  let status: Ad['status'] = 'live'
  let foundProposalStatus = false

  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const update = updates[index]
    if (!update?.valid) continue
    const publishable =
      update.verdict !== 'conflicted' &&
      (open || update.signer === collection.creator || update.verdict === 'approved')
    if (!foundProposalStatus) {
      status = publishable
        ? 'live'
        : update.verdict === 'disapproved' || update.verdict === 'conflicted'
          ? 'rejected'
          : 'pending'
      foundProposalStatus = true
    }
    if (publishable) {
      liveText = update.text
      liveContentUrl = update.format === 'image' ? update.contentUrl : ''
      liveUrl = update.url
      break
    }
  }

  return { liveText, liveContentUrl, liveUrl, status }
}

/**
 * A successful broadcast is already authoritative enough to update the local
 * dashboard. Keep those optimistic consequences if a manual/background reload
 * reaches a search index before that index exposes the new outpoint.
 */
export function preservePendingAdState(loaded: Ad[], current: Ad[]): Ad[] {
  const currentByOrigin = new Map(current.map((ad) => [ad.origin, ad]))
  const merged = loaded.map((ad) => {
    const previous = currentByOrigin.get(ad.origin)
    if (!previous) return ad

    const loadedUpdates = new Set(ad.updates.map((update) => update.outpoint))
    const pendingUpdates = previous.updates.filter(
      (update) => update.height === null && !loadedUpdates.has(update.outpoint)
    )
    const loadedMarketEvents = new Set(ad.marketEvents.map((event) => event.outpoint))
    const pendingMarketEvents = previous.marketEvents.filter(
      (event) => event.height === null && !loadedMarketEvents.has(event.outpoint)
    )

    if (!pendingUpdates.length && !pendingMarketEvents.length) return ad

    const withUpdates = pendingUpdates.length
      ? {
          ...ad,
          outpoint: previous.outpoint,
          owner: previous.owner,
          ownerEpoch: previous.ownerEpoch,
          updates: [...ad.updates, ...pendingUpdates],
          liveText: previous.liveText,
          liveContentUrl: previous.liveContentUrl,
          liveUrl: previous.liveUrl,
          status: previous.status,
        }
      : ad

    return pendingMarketEvents.length
      ? {
          ...withUpdates,
          outpoint: previous.outpoint,
          owner: previous.owner,
          ownerEpoch: previous.ownerEpoch,
          listing: previous.listing,
          updates: previous.updates,
          liveText: previous.liveText,
          liveContentUrl: previous.liveContentUrl,
          liveUrl: previous.liveUrl,
          status: previous.status,
          marketEvents: [...ad.marketEvents, ...pendingMarketEvents],
        }
      : withUpdates
  })

  const loadedOrigins = new Set(loaded.map((ad) => ad.origin))
  return [...merged, ...current.filter((ad) => ad.height === null && !loadedOrigins.has(ad.origin))]
}

/**
 * Swaps one collection's ads for the ones another reader produced.
 *
 * The scope is the whole collection: every ad in it comes from the new source
 * and no other collection is touched, so a rendered view is attributable to one
 * reader rather than assembled from two. Optimistic local state survives the
 * swap exactly as it survives a reload, because a broadcast the visitor just
 * made is not something either reader has seen yet.
 */
export function replaceCollectionAds(
  current: Ad[],
  loaded: Ad[],
  collectionId: string,
): Ad[] {
  const replaced = current.filter((ad) => ad.collectionId === collectionId)
  const untouched = current.filter((ad) => ad.collectionId !== collectionId)
  return [...preservePendingAdState(loaded, replaced), ...untouched]
}
