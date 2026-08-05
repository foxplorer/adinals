import {
  isValidFoxPersonality,
  normalizeFoxPersonality,
} from './foxPersonality.ts'

export const PIXEL_FOX_CAR_COLOR_COLLECTION_ID =
  '55acb61e975b1cd6d530c3519055ee57b68bf7ab251ac6fb0241b06261942c9b_0'

/**
 * The four roaming city foxes in `city-at-night`.
 *
 * Text format, 8 slots, 384 characters, `adApproval: open`, no expiry. Open is
 * safe because the editor writes selections from creator-authored lists rather
 * than text an owner composed — see `foxPersonality.ts`.
 *
 * Slots 1..4 drive `city-fox-12`, `-29`, `-31`, `-67` in that order.
 */
export const ROAMING_CITY_FOX_COLLECTION_ID =
  'ba4ad45336217b47fe0a48603a381d5c13bee854c41aa8eac6b6ab6d49008925_0'

/**
 * How a collection's creative is edited. This is a UI profile, not a protocol
 * record type: every editor here writes an ordinary text Adinal, and a
 * publisher that has never heard of this file still reads a valid record.
 */
export type AdinalsCreativeEditor = 'default' | 'hex-color' | 'fox-personality'

export type AdinalsCollectionUiProfile = {
  creativeEditor: AdinalsCreativeEditor
  destinationLinks: boolean
}

const DEFAULT_COLLECTION_UI_PROFILE: AdinalsCollectionUiProfile = {
  creativeEditor: 'default',
  destinationLinks: true
}

const COLLECTION_UI_PROFILES: Readonly<Record<string, AdinalsCollectionUiProfile>> = {
  [PIXEL_FOX_CAR_COLOR_COLLECTION_ID]: {
    creativeEditor: 'hex-color',
    destinationLinks: false
  },
  [ROAMING_CITY_FOX_COLLECTION_ID]: {
    creativeEditor: 'fox-personality',
    destinationLinks: false
  }
}

/**
 * Development override, read once from the query string by the caller:
 * `?editor=fox-personality` applies the fox editor to whichever collection is
 * open. It exists so a throwaway collection can drive the editor before the
 * real one is minted, and so the mainnet origin can be confirmed by hand before
 * it is written into the table above.
 *
 * It only chooses which controls render. Every protocol rule — capacity,
 * format, character cap, approval policy — still comes from the collection
 * record, so the override cannot make an invalid write valid.
 */
export const parseCollectionUiProfileOverride = (
  search: string
): AdinalsCollectionUiProfile | null => {
  const editor = new URLSearchParams(search).get('editor')
  if (editor === 'fox-personality') return COLLECTION_UI_PROFILES[ROAMING_CITY_FOX_COLLECTION_ID]
  if (editor === 'hex-color') return COLLECTION_UI_PROFILES[PIXEL_FOX_CAR_COLOR_COLLECTION_ID]
  if (editor === 'default') return DEFAULT_COLLECTION_UI_PROFILE
  return null
}

export const getAdinalsCollectionUiProfile = (
  collectionId: string | null | undefined,
  override: AdinalsCollectionUiProfile | null = null
): AdinalsCollectionUiProfile => {
  if (override) return override
  return collectionId
    ? COLLECTION_UI_PROFILES[collectionId] ?? DEFAULT_COLLECTION_UI_PROFILE
    : DEFAULT_COLLECTION_UI_PROFILE
}

export const isValidHexColor = (value: string): boolean =>
  /^#[0-9a-f]{6}$/i.test(value.trim())

export const normalizeHexColor = (value: string): string => value.trim().toUpperCase()

export const colorPickerValue = (value: string): string => (
  isValidHexColor(value) ? normalizeHexColor(value) : '#000000'
)

/**
 * Canonical form of a draft, per editor. The default editor only trims, which
 * is what the plain text field has always done.
 */
export const normalizeCreativeText = (
  editor: AdinalsCreativeEditor,
  value: string
): string => {
  if (editor === 'hex-color') return normalizeHexColor(value)
  if (editor === 'fox-personality') return normalizeFoxPersonality(value)
  return value.trim()
}

/** Whether a draft may be written at all. Free text is always acceptable. */
export const isCreativeTextValid = (
  editor: AdinalsCreativeEditor,
  value: string
): boolean => {
  if (editor === 'hex-color') return isValidHexColor(value)
  if (editor === 'fox-personality') return isValidFoxPersonality(value)
  return true
}

/**
 * Canonical form of an already-live creative, for the "is this draft actually a
 * change?" comparison.
 *
 * The default editor deliberately compares raw. Live text is whatever was
 * signed, and treating a trimmed draft as equal to an untrimmed live value
 * would silently refuse an owner's whitespace edit.
 */
export const canonicalizeLiveCreative = (
  editor: AdinalsCreativeEditor,
  value: string
): string => (editor === 'default' ? value : normalizeCreativeText(editor, value))
