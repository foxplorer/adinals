import { ADINALS_NAMESPACE } from '../config/environment.ts'

export const ADINALS_APP = ADINALS_NAMESPACE.app
export const ADINALS_PROTOCOL_VERSION = '3'
export const ADINALS_IMAGE_PROFILE = 'image-2x1-v1'
// Compatibility ceiling for already-broadcast v3 records. Current writers use
// a smaller byte limit so searchable MAP stays compact.
export const ADINALS_URL_MAX_LENGTH = 2_048
export const ADINALS_URL_WRITE_MAX_BYTES = 512

export const ADINALS_SUB_TYPE = {
  collection: 'collection',
  ad: 'collectionItem',
  update: 'adUpdate',
  decision: 'adDecision',
} as const

export type AdinalsFormat = 'text' | 'image'
export type AdinalsApproval = 'open' | 'creator'
export type AdinalsMap = Record<string, unknown>

export interface AdinalsProtocolRow {
  origin: string
  outpoint: string
  owner: string
  signer: string
  map: AdinalsMap
}

export interface AdinalsCollectionRules {
  origin: string
  creator: string
  format: AdinalsFormat
  approval: AdinalsApproval
  capacity: number
  maxChars: number | null
  imageProfile: string | null
}

export interface AdinalsSpendLinkedRecordProof {
  error: string
  predecessorOutpoint: string
  successorOutpoint: string
  recordOutpoint: string
  owner: string
}

const stringValue = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value)

const numberValue = (value: unknown): number => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || !value.trim()) return Number.NaN
  return Number(value)
}

const isPositiveInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0

const isIsoUtcTimestamp = (value: unknown): boolean => {
  if (typeof value !== 'string' || !value) return false
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString() === value
}

export const readAdinalsSubTypeData = (map: AdinalsMap): AdinalsMap => {
  const raw = map.subTypeData
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as AdinalsMap
        : {}
    } catch {
      return {}
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as AdinalsMap
    : {}
}

export const validateProtocolAdUrl = (value: unknown): { url: string; error: string } => {
  const input = stringValue(value).trim()
  if (!input) return { url: '', error: '' }
  if (input.length > ADINALS_URL_MAX_LENGTH) {
    return { url: '', error: `Destination URL is longer than ${ADINALS_URL_MAX_LENGTH.toLocaleString()} characters.` }
  }

  try {
    const parsed = new URL(input)
    if (parsed.protocol !== 'https:') {
      return { url: '', error: 'Destination URL must start with https://.' }
    }
    if (!parsed.hostname) return { url: '', error: 'Destination URL needs a valid hostname.' }
    if (parsed.username || parsed.password) {
      return { url: '', error: 'Destination URL cannot contain a username or password.' }
    }
    const normalized = parsed.toString()
    return normalized.length <= ADINALS_URL_MAX_LENGTH
      ? { url: normalized, error: '' }
      : { url: '', error: `Destination URL is longer than ${ADINALS_URL_MAX_LENGTH.toLocaleString()} characters.` }
  } catch {
    return { url: '', error: 'Enter a complete HTTPS destination URL.' }
  }
}

export const validateWritableProtocolAdUrl = (
  value: unknown,
): { url: string; error: string } => {
  const result = validateProtocolAdUrl(value)
  if (result.error || !result.url) return result
  const bytes = new TextEncoder().encode(result.url).length
  return bytes <= ADINALS_URL_WRITE_MAX_BYTES
    ? result
    : {
        url: '',
        error: `Destination URL must be ${ADINALS_URL_WRITE_MAX_BYTES.toLocaleString()} UTF-8 bytes or fewer.`,
      }
}

const commonRecordError = (row: AdinalsProtocolRow, subType: string): string => {
  if (
    row.map.app !== ADINALS_APP ||
    row.map.type !== 'ord' ||
    row.map.subType !== subType ||
    stringValue(row.map.protocolVersion) !== ADINALS_PROTOCOL_VERSION ||
    !stringValue(row.map.name).trim()
  ) {
    return 'invalid common record fields'
  }
  return ''
}

export const collectionRulesFromRecord = (
  row: AdinalsProtocolRow
): { rules: AdinalsCollectionRules; error: string } => {
  const data = readAdinalsSubTypeData(row.map)
  const capacity = numberValue(row.map.adMax)
  const quantity = numberValue(data.quantity)
  const format = row.map.adFormat === 'image' ? 'image' : 'text'
  const approval = row.map.adApproval === 'open' ? 'open' : 'creator'
  const maxChars = row.map.adMaxChars === undefined ? null : numberValue(row.map.adMaxChars)
  const imageProfile = typeof row.map.adImageProfile === 'string' ? row.map.adImageProfile : null
  const expiresAt = stringValue(row.map.expiresAt)
  let error = commonRecordError(row, ADINALS_SUB_TYPE.collection)

  if (!error && !row.signer) error = 'invalid collection signature'
  else if (!error && row.map.adFormat !== 'text' && row.map.adFormat !== 'image') {
    error = 'unsupported collection format'
  } else if (!error && row.map.adApproval !== 'open' && row.map.adApproval !== 'creator') {
    error = 'invalid approval mode'
  } else if (
    !error &&
    row.map.adContentPolicy !== undefined &&
    row.map.adContentPolicy !== 'family-friendly'
  ) {
    error = 'unsupported content policy'
  } else if (!error && (!isPositiveInteger(capacity) || quantity !== capacity)) {
    error = 'invalid collection capacity'
  } else if (!error && typeof data.description !== 'string') {
    error = 'invalid collection description'
  } else if (!error && format === 'text' && (maxChars === null || !isPositiveInteger(maxChars))) {
    error = 'invalid maximum text length'
  } else if (!error && format === 'image' && imageProfile !== ADINALS_IMAGE_PROFILE) {
    error = 'unsupported image profile'
  } else if (!error && expiresAt && !isIsoUtcTimestamp(expiresAt)) {
    error = 'invalid expiration'
  } else if (!error && !isIsoUtcTimestamp(row.map.createdAt)) {
    error = 'invalid creation timestamp'
  }

  return {
    rules: {
      origin: row.origin,
      creator: row.signer,
      format,
      approval,
      capacity,
      maxChars: format === 'text' ? maxChars : null,
      imageProfile: format === 'image' ? imageProfile : null,
    },
    error,
  }
}

export const adMintRecordError = (
  row: AdinalsProtocolRow,
  collection: AdinalsCollectionRules,
): string => {
  const commonError = commonRecordError(row, ADINALS_SUB_TYPE.ad)
  if (commonError) return commonError
  const data = readAdinalsSubTypeData(row.map)
  const slot = numberValue(data.mintNumber)
  if (stringValue(data.collectionId) !== collection.origin) return 'collection reference mismatch'
  if (row.signer !== collection.creator) return 'invalid creator signature'
  if (row.map.adFormat !== collection.format) return 'format mismatch'
  if (!isPositiveInteger(slot) || slot > collection.capacity) return 'invalid slot'
  if (!isIsoUtcTimestamp(row.map.mintedAt)) return 'invalid mint timestamp'
  if (validateProtocolAdUrl(row.map.adUrl).error) return 'invalid destination URL'

  if (collection.format === 'text') {
    const text = stringValue(row.map.adText)
    if (!text.trim()) return 'empty mint text'
    if (numberValue(row.map.adMaxChars) !== collection.maxChars) return 'maximum text length mismatch'
    if (collection.maxChars && [...text].length > collection.maxChars) return 'mint text too long'
  }
  return ''
}

export const adUpdateRecordError = (
  row: AdinalsProtocolRow,
  context: {
    collection: AdinalsCollectionRules
    adOrigin: string
    ownershipOutpoints: readonly string[]
    currentOwner: string
    currentOwnerEpoch: string
    transition: AdinalsSpendLinkedRecordProof
  }
): string => {
  const commonError = commonRecordError(row, ADINALS_SUB_TYPE.update)
  if (commonError) return commonError
  if (stringValue(row.map.collectionId) !== context.collection.origin) return 'collection reference mismatch'
  if (stringValue(row.map.adOrigin) !== context.adOrigin) return 'ad reference mismatch'
  if (row.map.transition !== 'spend-linked-self-v1') return 'unsupported update transition'
  if (context.transition.error) return context.transition.error
  if (context.transition.recordOutpoint !== row.origin) return 'update transition record mismatch'
  if (stringValue(row.map.adOutpoint) !== context.transition.predecessorOutpoint) {
    return 'update predecessor mismatch'
  }
  if (
    !context.ownershipOutpoints.includes(context.transition.predecessorOutpoint) ||
    !context.ownershipOutpoints.includes(context.transition.successorOutpoint)
  ) {
    return 'update is not in the Adinal spend chain'
  }
  if (stringValue(row.map.ownerEpoch) !== context.currentOwnerEpoch) return 'ownership epoch mismatch'
  if (
    !row.signer ||
    row.signer !== context.transition.owner ||
    context.transition.owner !== context.currentOwner
  ) return 'not current owner'
  if (row.map.adFormat !== context.collection.format) return 'format mismatch'
  if (!isIsoUtcTimestamp(row.map.updatedAt)) return 'invalid update timestamp'
  if (validateProtocolAdUrl(row.map.adUrl).error) return 'invalid destination URL'

  if (context.collection.format === 'text') {
    const text = stringValue(row.map.adText)
    if (!text.trim()) return 'empty update text'
    if (context.collection.maxChars && [...text].length > context.collection.maxChars) {
      return 'update text too long'
    }
  }
  return ''
}

export const adDecisionRecordError = (
  row: AdinalsProtocolRow,
  context: {
    collection: AdinalsCollectionRules
    adOrigin: string
    updateOutpoint: string
    adOutpoint: string
    ownerEpoch: string
  }
): string => {
  const commonError = commonRecordError(row, ADINALS_SUB_TYPE.decision)
  if (commonError) return commonError
  if (row.signer !== context.collection.creator) return 'invalid creator signature'
  if (stringValue(row.map.collectionId) !== context.collection.origin) return 'collection reference mismatch'
  if (stringValue(row.map.adOrigin) !== context.adOrigin) return 'ad reference mismatch'
  if (stringValue(row.map.updateOutpoint) !== context.updateOutpoint) return 'update reference mismatch'
  if (stringValue(row.map.adOutpoint) !== context.adOutpoint) return 'Adinal state reference mismatch'
  if (stringValue(row.map.ownerEpoch) !== context.ownerEpoch) return 'ownership epoch mismatch'
  const transitionTxid = context.updateOutpoint.split(/[._]/)[0] ?? ''
  if (stringValue(row.map.transitionTxid) !== transitionTxid) return 'transition transaction mismatch'
  const revision = stringValue(row.map.revisionOutpoint)
  if (revision && revision !== context.updateOutpoint) return 'revision reference mismatch'
  if (row.map.decision !== 'approved' && row.map.decision !== 'disapproved') return 'invalid decision'
  if (typeof row.map.reasonCode !== 'string') return 'invalid reason code'
  if (!isIsoUtcTimestamp(row.map.decidedAt)) return 'invalid decision timestamp'
  return ''
}
