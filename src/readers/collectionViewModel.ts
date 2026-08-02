import type { MarketEvent } from './productCatalog.ts'

/**
 * The shapes the collection interface renders.
 *
 * They live here rather than beside the page so a reader can produce them
 * directly. The overlay projection and the current public reader are then two
 * sources for one model instead of two parallel models.
 */
export type CreativeFormat = 'text' | 'image'

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
