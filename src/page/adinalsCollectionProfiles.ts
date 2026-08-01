export const PIXEL_FOX_CAR_COLOR_COLLECTION_ID =
  '55acb61e975b1cd6d530c3519055ee57b68bf7ab251ac6fb0241b06261942c9b_0'

export type AdinalsCollectionUiProfile = {
  creativeEditor: 'default' | 'hex-color'
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
  }
}

export const getAdinalsCollectionUiProfile = (
  collectionId: string | null | undefined
): AdinalsCollectionUiProfile => (
  collectionId ? COLLECTION_UI_PROFILES[collectionId] ?? DEFAULT_COLLECTION_UI_PROFILE : DEFAULT_COLLECTION_UI_PROFILE
)

export const isValidHexColor = (value: string): boolean =>
  /^#[0-9a-f]{6}$/i.test(value.trim())

export const normalizeHexColor = (value: string): string => value.trim().toUpperCase()

export const colorPickerValue = (value: string): string => (
  isValidHexColor(value) ? normalizeHexColor(value) : '#000000'
)
