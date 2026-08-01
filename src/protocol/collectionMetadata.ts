export const ADINALS_PROTOCOL_VERSION = '3' as const
export const ADINALS_IMAGE_PROFILE = 'image-2x1-v1' as const

export type AdinalsApproval = 'creator' | 'open'
export type AdinalsFormat = 'text' | 'image'
export type AdinalsContentPolicy = 'family-friendly' | 'unspecified'

export type CreateCollectionInput = {
  name: string
  description: string
  maxSupply: number
  approval: AdinalsApproval
  format: AdinalsFormat
  contentPolicy?: AdinalsContentPolicy
  maxChars?: number
  placement?: string
  expiresAt?: string
  cover?: {
    data: Uint8Array
    type: string
  }
}

export type AdinalsCollectionMap = Record<string, string> & {
  app: string
  type: 'ord'
  name: string
  subType: 'collection'
  protocolVersion: '3'
  subTypeData: string
  adMax: string
  adApproval: AdinalsApproval
  adFormat: AdinalsFormat
  createdAt: string
}

export class AdinalsCollectionValidationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AdinalsCollectionValidationError'
    this.code = code
  }
}

const validIsoTimestamp = (value: string): boolean => {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

export function buildCollectionMap(
  input: CreateCollectionInput,
  options: { app: string; now?: Date },
): AdinalsCollectionMap {
  const name = input.name.trim()
  const description = input.description.trim()
  const placement = input.placement?.trim() ?? ''
  const now = options.now ?? new Date()

  if (!name) {
    throw new AdinalsCollectionValidationError('COLLECTION_NAME_REQUIRED', 'A collection needs a name.')
  }
  if (!Number.isSafeInteger(input.maxSupply) || input.maxSupply < 1) {
    throw new AdinalsCollectionValidationError(
      'COLLECTION_CAPACITY_INVALID',
      'Number of ads must be a whole number, at least 1.',
    )
  }
  if (input.approval !== 'creator' && input.approval !== 'open') {
    throw new AdinalsCollectionValidationError('COLLECTION_APPROVAL_INVALID', 'Choose creator approval or open publishing.')
  }
  if (input.format !== 'text' && input.format !== 'image') {
    throw new AdinalsCollectionValidationError('COLLECTION_FORMAT_INVALID', 'Choose a text or image collection.')
  }
  if (input.format === 'text' && (!Number.isSafeInteger(input.maxChars) || (input.maxChars ?? 0) < 1)) {
    throw new AdinalsCollectionValidationError(
      'COLLECTION_MAX_CHARS_INVALID',
      'Text collections need a positive whole-number character limit.',
    )
  }
  if (input.cover && (!input.cover.data.length || !input.cover.type.trim())) {
    throw new AdinalsCollectionValidationError('COLLECTION_COVER_INVALID', 'The cover needs file bytes and a content type.')
  }
  if (input.expiresAt) {
    const expires = Date.parse(input.expiresAt)
    if (!Number.isFinite(expires) || expires <= now.getTime()) {
      throw new AdinalsCollectionValidationError(
        'COLLECTION_EXPIRATION_INVALID',
        'Collection expiration must be a valid future date.',
      )
    }
  }

  const map: AdinalsCollectionMap = {
    app: options.app,
    type: 'ord',
    name,
    subType: 'collection',
    protocolVersion: ADINALS_PROTOCOL_VERSION,
    subTypeData: JSON.stringify({ description, quantity: input.maxSupply }),
    adMax: String(input.maxSupply),
    adApproval: input.approval,
    ...(input.contentPolicy === 'family-friendly'
      ? { adContentPolicy: 'family-friendly' }
      : {}),
    adFormat: input.format,
    ...(input.format === 'text'
      ? { adMaxChars: String(input.maxChars) }
      : { adImageProfile: ADINALS_IMAGE_PROFILE }),
    ...(placement ? { adPlacement: placement } : {}),
    ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt).toISOString() } : {}),
    createdAt: now.toISOString(),
  }

  return map
}

export function validateCollectionMap(
  map: Record<string, unknown>,
  expectedApp: string,
): string[] {
  const errors: string[] = []
  if (map.app !== expectedApp) errors.push('app mismatch')
  if (map.type !== 'ord') errors.push('type must be ord')
  if (map.subType !== 'collection') errors.push('subType must be collection')
  if (String(map.protocolVersion ?? '') !== ADINALS_PROTOCOL_VERSION) errors.push('protocolVersion must be 3')
  if (typeof map.name !== 'string' || !map.name.trim()) errors.push('name is required')
  if (map.adApproval !== 'creator' && map.adApproval !== 'open') errors.push('invalid approval mode')
  if (map.adFormat !== 'text' && map.adFormat !== 'image') errors.push('invalid ad format')
  if (map.adContentPolicy !== undefined && map.adContentPolicy !== 'family-friendly') {
    errors.push('invalid content policy')
  }

  const capacity = Number(map.adMax)
  let subtypeData: { description?: unknown; quantity?: unknown } = {}
  try {
    subtypeData = JSON.parse(String(map.subTypeData ?? '')) as typeof subtypeData
  } catch {
    errors.push('subTypeData must be JSON')
  }
  if (!Number.isSafeInteger(capacity) || capacity < 1 || subtypeData.quantity !== capacity) {
    errors.push('invalid collection capacity')
  }
  if (typeof subtypeData.description !== 'string') errors.push('description must be a string')
  if (map.adFormat === 'text') {
    const maxChars = Number(map.adMaxChars)
    if (!Number.isSafeInteger(maxChars) || maxChars < 1) errors.push('invalid maximum text length')
  }
  if (map.adFormat === 'image' && map.adImageProfile !== ADINALS_IMAGE_PROFILE) {
    errors.push('unsupported image profile')
  }
  if (typeof map.createdAt !== 'string' || !validIsoTimestamp(map.createdAt)) {
    errors.push('invalid creation timestamp')
  }
  if (map.expiresAt !== undefined && (typeof map.expiresAt !== 'string' || !validIsoTimestamp(map.expiresAt))) {
    errors.push('invalid expiration')
  }
  return errors
}
