import { ADINALS_TEXT_MAX_CHARS, type AdinalsRecordEnvelope } from './recordEnvelope.js'

const positiveDecimal = (value: unknown): number | null => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

const isoUtc = (value: unknown): boolean => {
  if (typeof value !== 'string' || !value) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

export const collectionRecordErrors = (
  record: AdinalsRecordEnvelope
): string[] => {
  const errors = [...record.errors]
  const map = record.map
  if (!record.valid || !map) return errors
  if (record.subType !== 'collection') return [...errors, 'not a collection']

  const capacity = positiveDecimal(map.adMax)
  let data: unknown
  try {
    data = JSON.parse(map.subTypeData ?? '')
  } catch {
    errors.push('subTypeData must be JSON')
  }
  const subTypeData = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null

  if (!record.signerAddress) errors.push('collection signature is required')
  if (map.adApproval !== 'creator' && map.adApproval !== 'open') {
    errors.push('invalid approval mode')
  }
  if (map.adFormat !== 'text' && map.adFormat !== 'image') {
    errors.push('invalid ad format')
  }
  if (
    map.adContentPolicy !== undefined &&
    map.adContentPolicy !== 'family-friendly'
  ) errors.push('invalid content policy')
  if (
    capacity === null ||
    !subTypeData ||
    subTypeData.quantity !== capacity
  ) errors.push('invalid collection capacity')
  if (!subTypeData || typeof subTypeData.description !== 'string') {
    errors.push('description must be a string')
  }
  if (map.adFormat === 'text') {
    const declared = positiveDecimal(map.adMaxChars)
    if (declared === null) errors.push('invalid maximum text length')
    // A collection may not promise more text than a MAP value can carry
    // compatibly, or its mints would be unadmittable after the fact.
    else if (declared > ADINALS_TEXT_MAX_CHARS) {
      errors.push('maximum text length exceeds protocol limit')
    }
  }
  if (
    map.adFormat === 'image' &&
    map.adImageProfile !== 'image-2x1-v1'
  ) errors.push('unsupported image profile')
  if (!isoUtc(map.createdAt)) errors.push('invalid creation timestamp')
  if (map.expiresAt !== undefined && !isoUtc(map.expiresAt)) {
    errors.push('invalid expiration')
  }
  return errors
}
