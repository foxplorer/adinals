/**
 * Holds creative bytes that arrived inside verified overlay evidence.
 *
 * Version 3 inscribes creatives directly, so the BEEF that proves an ad's
 * ownership already contains its image. Reading those bytes from the response
 * in hand removes the public content host from the render path, and with it the
 * window in which a freshly published image is a 404 to everyone except its
 * author. The bytes are as trustworthy as the record: the transaction ID,
 * inscription envelope, and SIGMA signature were all checked before an output
 * reached this store.
 *
 * An outpoint is immutable, so a second registration of one is the same bytes
 * by definition and is ignored rather than re-materialized.
 *
 * The browser handles are injected so the store itself is testable under Node,
 * which has neither `Blob` nor object URLs in the shape a document needs.
 */
export type Creative = {
  outpoint: string
  contentType: string
  bytes: number[]
}

export type CreativeStore = {
  /** Retains creatives; already-known outpoints keep the handle they have. */
  register: (creatives: readonly Creative[]) => void
  /** A displayable URL, materialized on first use. Empty when unknown. */
  url: (outpoint: string) => string
  /** Releases every handle. Retained state is a cache, never a source. */
  clear: () => void
  size: () => number
}

type Entry = {
  contentType: string
  bytes: number[]
  url: string
}

const browserMaterialize = (bytes: number[], contentType: string): string => {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return ''
  if (typeof Blob === 'undefined') return ''
  return URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: contentType || 'application/octet-stream' }),
  )
}

const browserRelease = (url: string): void => {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}

export function createCreativeStore(options: {
  materialize?: (bytes: number[], contentType: string) => string
  release?: (url: string) => void
  /** Bounds retained bytes so a long session does not accumulate every image. */
  capacity?: number
} = {}): CreativeStore {
  const materialize = options.materialize ?? browserMaterialize
  const release = options.release ?? browserRelease
  const capacity = options.capacity ?? 64
  // Insertion order is eviction order, which `Map` preserves for us.
  const entries = new Map<string, Entry>()

  const evict = (): void => {
    while (entries.size > capacity) {
      const oldest = entries.keys().next()
      if (oldest.done) return
      const entry = entries.get(oldest.value)
      if (entry?.url) release(entry.url)
      entries.delete(oldest.value)
    }
  }

  return {
    register(creatives) {
      for (const creative of creatives) {
        if (!creative.outpoint || !creative.bytes.length) continue
        if (entries.has(creative.outpoint)) continue
        entries.set(creative.outpoint, {
          contentType: creative.contentType,
          bytes: creative.bytes,
          url: '',
        })
      }
      evict()
    },
    url(outpoint) {
      const entry = entries.get(outpoint)
      if (!entry) return ''
      if (!entry.url) entry.url = materialize(entry.bytes, entry.contentType)
      return entry.url
    },
    clear() {
      for (const entry of entries.values()) if (entry.url) release(entry.url)
      entries.clear()
    },
    size: () => entries.size,
  }
}

/** The application's single store; the render path reads creatives from here. */
export const overlayCreatives = createCreativeStore()

export const overlayCreativeUrl = (outpoint: string): string =>
  outpoint ? overlayCreatives.url(outpoint) : ''
