import {
  ADINALS_URL_WRITE_MAX_BYTES,
  validateProtocolAdUrl,
  validateWritableProtocolAdUrl,
} from '../protocol/records'

/**
 * New creatives keep searchable MAP metadata deliberately compact. Readers
 * retain the wider v3 protocol ceiling for records that are already on chain.
 */
export const AD_URL_MAX_LENGTH = ADINALS_URL_WRITE_MAX_BYTES
export const AD_URL_MAX_BYTES = ADINALS_URL_WRITE_MAX_BYTES

export type AdUrlResult = {
  url: string
  error: string
}

/**
 * An ad destination is optional. When present it is normalized before signing
 * so the UI, writer, reader, and embeds all compare the same exact value.
 */
export function validateStoredAdUrl(value: string): AdUrlResult {
  return validateProtocolAdUrl(value)
}

export function validateAdUrl(value: string): AdUrlResult {
  return validateWritableProtocolAdUrl(value)
}

export function adUrlHost(value: string): string {
  try {
    return new URL(value).hostname
  } catch {
    return value
  }
}
