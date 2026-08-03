/**
 * Stage three of moving reads onto the overlay: discovery.
 *
 * Rendering one collection from the overlay left GorillaPool on the critical
 * path for every visit, because finding that collection — the list, the slot
 * counts, the pending-approval counts, and the check that decides whether an
 * immutable route will open at all — still came from a namespace-wide index
 * read. This replaces that read with one projection per collection, which is
 * the same evidence the detail view already renders from.
 *
 * The whole namespace succeeds or falls back together. A partial answer would
 * silently hide a collection, which is worse than the lag it replaces: an
 * overlay only knows what was submitted or backfilled into it, and cannot tell
 * the difference between a collection that does not exist and one it never
 * ingested.
 *
 * Readers are injected so the assembly is testable under Node, which cannot
 * resolve the template package the hydrating path imports.
 */
import type { Ad, Collection } from './collectionViewModel.ts'
import type { CollectionView } from './overlayViewModel.ts'
import { withReadTimeout } from './readTimeout.ts'

export type OverlayNamespaceStatus =
  /** Every listed collection resolved; the application renders from the overlay. */
  | 'rendered'
  /** The node listed no collections, which means unknown rather than none. */
  | 'empty'
  /** A listing or projection failed, or the whole read timed out. */
  | 'unavailable'
  /** No overlay endpoint is configured. */
  | 'disabled'

export type OverlayNamespace = {
  collections: Collection[]
  ads: Ad[]
}

export type OverlayNamespaceResult = {
  status: OverlayNamespaceStatus
  /** Present only for `rendered`, so a partial namespace cannot be displayed. */
  namespace: OverlayNamespace | null
  /** Collection origins the overlay listed, whether or not they resolved. */
  origins: string[]
  errors: string[]
  durationMs: number
}

/**
 * A whole namespace is several collection reads, so this is looser than the
 * eight seconds one collection gets. It still bounds what a visitor waits before
 * the existing reader answers instead.
 */
export const OVERLAY_NAMESPACE_TIMEOUT_MS = 20_000

/**
 * Enough parallelism to hide the round trips, not enough to flood the node.
 * Measured against the hosted node at eight collections: four readers took
 * 7,169 milliseconds, eight took 5,849, and twelve took 5,989. Beyond the size
 * of the namespace there is nothing left to overlap, and the floor is the
 * slowest single collection.
 */
export const OVERLAY_NAMESPACE_CONCURRENCY = 8

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Runs `work` over `items` with a fixed number of readers in flight. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      results[index] = await work(items[index]!)
    }
  })
  await Promise.all(runners)
  return results
}

export async function readOverlayNamespace(options: {
  /** Collection origins the node holds, newest ordering is not assumed. */
  listCollections: () => Promise<string[]>
  readCollection: (origin: string) => Promise<CollectionView | null>
  enabled?: boolean
  timeoutMs?: number
  concurrency?: number
}): Promise<OverlayNamespaceResult> {
  const startedAt = Date.now()
  const result = (
    status: OverlayNamespaceStatus,
    namespace: OverlayNamespace | null,
    origins: string[],
    errors: string[],
  ): OverlayNamespaceResult => ({
    status,
    namespace,
    origins,
    errors,
    durationMs: Date.now() - startedAt,
  })

  if (options.enabled === false) return result('disabled', null, [], [])

  try {
    return await withReadTimeout((async () => {
      const origins = await options.listCollections()
      if (!origins.length) return result('empty', null, [], [])

      const views = await mapWithConcurrency(
        origins,
        options.concurrency ?? OVERLAY_NAMESPACE_CONCURRENCY,
        (origin) => options.readCollection(origin),
      )

      const collections: Collection[] = []
      const ads: Ad[] = []
      const missing: string[] = []
      views.forEach((view, index) => {
        if (!view) {
          // A listed collection whose record does not resolve is a hole in the
          // namespace, not an empty collection.
          missing.push(origins[index]!)
          return
        }
        collections.push(view.collection)
        ads.push(...view.ads)
      })
      if (missing.length) {
        return result('unavailable', null, origins, [
          `the overlay listed ${missing.length} collection(s) it could not resolve`,
        ])
      }

      return result('rendered', { collections, ads }, origins, [])
    })(), options.timeoutMs ?? OVERLAY_NAMESPACE_TIMEOUT_MS, 'overlay namespace read')
  } catch (error) {
    return result('unavailable', null, [], [message(error)])
  }
}
