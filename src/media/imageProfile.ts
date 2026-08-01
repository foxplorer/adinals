export const IMAGE_PROFILE = 'image-2x1-v1'
export const IMAGE_MAX_BYTES = 1_000_000
export const IMAGE_RECOMMENDED_MAX_BYTES = 300_000
export const IMAGE_RECOMMENDED_WIDTH = 1024
export const IMAGE_RECOMMENDED_HEIGHT = 512
export const IMAGE_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type ImageMimeType = (typeof IMAGE_ALLOWED_TYPES)[number]

export type SelectedImage = {
  data: Uint8Array
  type: ImageMimeType
  name: string
  bytes: number
  width: number
  height: number
}

export const imageProfileSummary =
  'PNG, JPEG, or WebP · up to 1 MB · 300 KB or less recommended · 1024×512 recommended · transparent backgrounds allowed'

export function detectImageType(data: Uint8Array): ImageMimeType | null {
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) return 'image/png'

  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    data.length >= 12 &&
    String.fromCharCode(...data.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...data.slice(8, 12)) === 'WEBP'
  ) return 'image/webp'

  return null
}

export function validateImageBytes(
  data: Uint8Array,
  declaredType: string,
): { type?: ImageMimeType; error?: string } {
  if (data.length === 0) return { error: 'Choose an image with content.' }
  if (data.length > IMAGE_MAX_BYTES) {
    return { error: `Image is ${(data.length / 1024).toFixed(1)} KB; this profile allows up to 1 MB.` }
  }
  const type = detectImageType(data)
  if (!type) return { error: 'Use a PNG, JPEG, or WebP image.' }
  if (declaredType && declaredType !== type) {
    return { error: `The file says ${declaredType}, but its bytes are ${type}.` }
  }
  return { type }
}

export async function readImageFile(file: File): Promise<SelectedImage> {
  const data = new Uint8Array(await file.arrayBuffer())
  const checked = validateImageBytes(data, file.type)
  if (!checked.type) throw new Error(checked.error ?? 'That image is not supported.')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('The browser could not decode that image.')
  }

  const selected: SelectedImage = {
    data,
    type: checked.type,
    name: file.name,
    bytes: data.length,
    width: bitmap.width,
    height: bitmap.height,
  }
  bitmap.close()
  return selected
}

export function imageSelectionLabel(image: SelectedImage): string {
  return `${image.name} · ${image.width}×${image.height} · ${(image.bytes / 1024).toFixed(1)} KB`
}
