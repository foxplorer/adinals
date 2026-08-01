import type { AdinalsRecordEnvelope } from './recordEnvelope.js'

const OUTPOINT = /^[0-9a-f]{64}_\d+$/
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

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

export const mintCandidateErrors = (
  record: AdinalsRecordEnvelope
): string[] => {
  const errors = [...record.errors]
  const map = record.map
  if (!record.valid || !map) return errors
  if (record.subType !== 'collectionItem') return [...errors, 'not a mint']

  let data: Record<string, unknown> | null = null
  try {
    const parsed: unknown = JSON.parse(map.subTypeData ?? '')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>
    }
  } catch {
    // Report the single canonical error below.
  }
  if (!data) errors.push('subTypeData must be a JSON object')
  const collectionId = data?.collectionId
  if (typeof collectionId !== 'string' || !OUTPOINT.test(collectionId)) {
    errors.push('invalid collection reference')
  }
  const mintNumber = data?.mintNumber
  if (typeof mintNumber !== 'number' || !Number.isSafeInteger(mintNumber) || mintNumber < 1) {
    errors.push('invalid mint number')
  }
  if (map.adFormat !== 'text' && map.adFormat !== 'image') {
    errors.push('invalid ad format')
  }
  if (!isoUtc(map.mintedAt)) errors.push('invalid mint timestamp')
  if (!validUrl(map.adUrl)) errors.push('invalid destination URL')

  if (map.adFormat === 'text') {
    const maxChars = positiveDecimal(map.adMaxChars)
    if (!map.adText?.trim()) errors.push('empty mint text')
    if (maxChars === null) errors.push('invalid maximum text length')
    else if ([...(map.adText ?? '')].length > maxChars) errors.push('mint text too long')
  }

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
