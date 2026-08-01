import { Script, type Transaction } from '@bsv/sdk'
import type { AdinalsRecordEnvelope } from './recordEnvelope.js'
import { inspectAdinalsTransactionOutput } from './recordEnvelope.js'
import { mintCandidateErrors } from './mintCandidate.js'
import {
  decodeEmbeddedP2PKH,
  decodeOrdLock,
  decodeP2PKH,
  isOrdLockPurchase,
  scriptsEqual,
  type OrdLockTerms
} from './scriptTemplates.js'

const OUTPOINT = /^([0-9a-f]{64})_(\d+)$/
const TXID = /^[0-9a-f]{64}$/
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

const validOutpoint = (value: unknown): value is string =>
  typeof value === 'string' && OUTPOINT.test(value)

const isoUtc = (value: unknown): boolean => {
  if (typeof value !== 'string' || !value) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

const validUrl = (value: unknown): boolean => {
  if (value === undefined) return true
  if (typeof value !== 'string' || value.length > 2_048) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) &&
      !parsed.username && !parsed.password
  } catch {
    return false
  }
}

const detectedImageType = (bytes: readonly number[]): string => {
  if (
    bytes.length >= 8 &&
    bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
  ) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'image/webp'
  return ''
}

const creativeErrors = (record: AdinalsRecordEnvelope): string[] => {
  const errors: string[] = []
  const map = record.map as Record<string, string>
  if (map.adFormat !== 'text' && map.adFormat !== 'image') {
    return ['invalid ad format']
  }
  if (!validUrl(map.adUrl)) errors.push('invalid destination URL')
  if (map.adFormat === 'text' && !map.adText?.trim()) errors.push('empty ad text')
  if (map.adFormat === 'image') {
    const detected = detectedImageType(record.content)
    if (!IMAGE_TYPES.includes(record.contentType as typeof IMAGE_TYPES[number])) {
      errors.push('unsupported image content type')
    }
    if (!record.contentBytes || record.contentBytes > 1_000_000) {
      errors.push('invalid image byte length')
    }
    if (!detected || detected !== record.contentType) {
      errors.push('image bytes do not match content type')
    }
  }
  return errors
}

export const updateCandidateErrors = (
  record: AdinalsRecordEnvelope
): string[] => {
  const errors = [...record.errors]
  const map = record.map
  if (!record.valid || !map) return errors
  if (record.subType !== 'adUpdate') return [...errors, 'not an update']
  if (!validOutpoint(map.collectionId)) errors.push('invalid collection reference')
  if (!validOutpoint(map.adOrigin)) errors.push('invalid ad reference')
  if (!validOutpoint(map.adOutpoint)) errors.push('invalid predecessor reference')
  if (!validOutpoint(map.ownerEpoch)) errors.push('invalid owner epoch')
  if (map.transition !== 'spend-linked-self-v1') errors.push('invalid transition type')
  if (!isoUtc(map.updatedAt)) errors.push('invalid update timestamp')
  errors.push(...creativeErrors(record))
  return errors
}

export const decisionCandidateErrors = (
  record: AdinalsRecordEnvelope
): string[] => {
  const errors = [...record.errors]
  const map = record.map
  if (!record.valid || !map) return errors
  if (record.subType !== 'adDecision') return [...errors, 'not a decision']
  if (!validOutpoint(map.collectionId)) errors.push('invalid collection reference')
  if (!validOutpoint(map.adOrigin)) errors.push('invalid ad reference')
  if (!validOutpoint(map.updateOutpoint)) errors.push('invalid update reference')
  if (!validOutpoint(map.revisionOutpoint)) errors.push('invalid revision reference')
  if (!validOutpoint(map.adOutpoint)) errors.push('invalid successor reference')
  if (!validOutpoint(map.ownerEpoch)) errors.push('invalid owner epoch')
  if (!TXID.test(map.transitionTxid ?? '')) errors.push('invalid transition txid')
  if (
    map.updateOutpoint !== `${map.transitionTxid}_1` ||
    map.revisionOutpoint !== map.updateOutpoint ||
    map.adOutpoint !== `${map.transitionTxid}_0`
  ) errors.push('decision transition outputs do not match')
  if (map.decision !== 'approved' && map.decision !== 'disapproved') {
    errors.push('invalid decision')
  }
  if (typeof map.reasonCode !== 'string') errors.push('invalid reason code')
  if (!isoUtc(map.decidedAt)) errors.push('invalid decision timestamp')
  return errors
}

export type LifecycleKind =
  | 'listing'
  | 'purchase'
  | 'cancellation'
  | 'transfer'
  | 'update'

export type LifecycleAdmission = {
  kind: LifecycleKind
  outputsToAdmit: number[]
  predecessorOutpoint: string
  ownerAddress: string
  listing?: OrdLockTerms
}

const sourceOutpoint = (tx: Transaction): string => {
  const input = tx.inputs[0]
  const txid = input?.sourceTXID ?? input?.sourceTransaction?.id('hex')
  return txid && input ? `${txid}_${input.sourceOutputIndex}` : ''
}

const sourceOwner = (tx: Transaction): string => {
  const input = tx.inputs[0]
  const source = input?.sourceTransaction?.outputs[input.sourceOutputIndex]
  if (!source) return ''
  const p2pkh = decodeP2PKH(source.lockingScript)
  if (p2pkh) return p2pkh.address

  const mint = inspectAdinalsTransactionOutput(
    input.sourceTransaction as Transaction,
    input.sourceOutputIndex
  )
  const embeddedOwner = decodeEmbeddedP2PKH(source.lockingScript)
  return (
    mint.subType === 'collectionItem' &&
    mintCandidateErrors(mint).length === 0 &&
    embeddedOwner
  ) ? embeddedOwner.address : ''
}

/** Classifies only transitions whose input 0 is already topical. */
export const classifyLifecycleTransition = (
  tx: Transaction,
  previousCoins: readonly number[]
): LifecycleAdmission | null => {
  if (!previousCoins.includes(0)) return null
  const input = tx.inputs[0]
  const source = input?.sourceTransaction?.outputs[input.sourceOutputIndex]
  const successor = tx.outputs[0]
  const predecessorOutpoint = sourceOutpoint(tx)
  if (!source || !successor || !predecessorOutpoint || successor.satoshis !== 1) {
    return null
  }

  const priorListing = decodeOrdLock(source.lockingScript)
  const successorOwner = decodeP2PKH(successor.lockingScript)
  if (priorListing) {
    if (!successorOwner) return null
    if (!input.unlockingScript) return null
    if (isOrdLockPurchase(input.unlockingScript, priorListing)) {
      const payout = tx.outputs[1]
      if (
        !payout ||
        payout.satoshis !== priorListing.priceSatoshis ||
        !scriptsEqual(payout.lockingScript, Script.fromBinary(priorListing.payoutScript))
      ) return null
      return {
        kind: 'purchase',
        outputsToAdmit: [0],
        predecessorOutpoint,
        ownerAddress: successorOwner.address,
        listing: priorListing
      }
    }
    if (successorOwner.address !== priorListing.seller) return null
    return {
      kind: 'cancellation',
      outputsToAdmit: [0],
      predecessorOutpoint,
      ownerAddress: successorOwner.address,
      listing: priorListing
    }
  }

  const ownerAddress = sourceOwner(tx)
  if (!ownerAddress) return null
  const listing = decodeOrdLock(successor.lockingScript)
  if (listing) {
    if (listing.seller !== ownerAddress) return null
    return {
      kind: 'listing',
      outputsToAdmit: [0],
      predecessorOutpoint,
      ownerAddress,
      listing
    }
  }
  if (!successorOwner) return null

  const update = inspectAdinalsTransactionOutput(tx, 1)
  if (update.subType === 'adUpdate' && updateCandidateErrors(update).length === 0) {
    const map = update.map as Record<string, string>
    if (
      successorOwner.address === ownerAddress &&
      update.signerAddress === ownerAddress &&
      map.adOutpoint === predecessorOutpoint
    ) {
      return {
        kind: 'update',
        outputsToAdmit: [0, 1],
        predecessorOutpoint,
        ownerAddress
      }
    }
  }

  return {
    kind: 'transfer',
    outputsToAdmit: [0],
    predecessorOutpoint,
    ownerAddress: successorOwner.address
  }
}
