/**
 * Stage two of moving reads onto the overlay: render one collection from it, or
 * fall back whole.
 *
 * The choice is made per collection rather than per field. A view assembled
 * from both sources would be almost impossible to diagnose when they disagree,
 * so a rendered collection is always attributable to exactly one of them.
 *
 * Fallback covers an empty answer as well as an error, because an overlay only
 * knows what was submitted or backfilled into it. A node that never ingested a
 * collection answers truthfully with nothing, and rendering that as absence
 * would be worse than the lag the migration replaces.
 *
 * The reader is injected because the hydrating path imports `@1sat/templates`,
 * whose extensionless ESM chain Node cannot resolve; keeping that import out of
 * this module is what makes the decision unit-testable.
 */
import type { CollectionView } from './overlayViewModel.ts'
import { withReadTimeout } from './readTimeout.ts'

export type OverlayCollectionReadStatus =
  /** The overlay answered completely and the view is rendered from it. */
  | 'rendered'
  /** The node holds no collection record or no ads for it. */
  | 'empty'
  /** The read failed or timed out. */
  | 'unavailable'
  /** No overlay endpoint is configured, which stays the production default. */
  | 'disabled'

export type OverlayCollectionReadResult = {
  origin: string
  endpoint: string
  checkedAt: string
  status: OverlayCollectionReadStatus
  /** Present only for `rendered`, so a fallback cannot be rendered by accident. */
  view: CollectionView | null
  errors: string[]
  durationMs: number
}

/**
 * A visitor waits behind this, so it bounds what they wait rather than what the
 * node may take: the background comparison's twelve seconds would be an unread
 * ad list. Measured collection reads against the hosted node run from 0.5 to
 * 2.3 seconds warm, and a session's first read adds roughly a second of TLS
 * handshake. Exceeding this costs nothing but the wait, because the view the
 * fallback renders was already loaded before the read began.
 *
 * Browser measurements put an image collection at 3,097 milliseconds, close
 * enough to a four-second budget that an ordinary slow moment would have fallen
 * back silently. The budget is therefore set well above the observed range: a
 * timeout should mean the node is unreachable, not that it was busy.
 */
export const OVERLAY_COLLECTION_READ_TIMEOUT_MS = 8_000

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export async function readOverlayCollectionSource(
  origin: string,
  options: {
    read: (origin: string) => Promise<CollectionView | null>
    endpoint?: string
    timeoutMs?: number
  },
): Promise<OverlayCollectionReadResult> {
  const startedAt = Date.now()
  const endpoint = options.endpoint ?? ''
  const result = (
    status: OverlayCollectionReadStatus,
    view: CollectionView | null,
    errors: string[],
  ): OverlayCollectionReadResult => ({
    origin,
    endpoint,
    checkedAt: new Date().toISOString(),
    status,
    view,
    errors,
    durationMs: Date.now() - startedAt,
  })

  if (!endpoint) return result('disabled', null, [])

  try {
    const view = await withReadTimeout(
      options.read(origin),
      options.timeoutMs ?? OVERLAY_COLLECTION_READ_TIMEOUT_MS,
      'overlay collection read',
    )
    // A collection the node holds without any mint is treated as incomplete
    // rather than empty: a genuinely empty collection renders identically from
    // the existing reader, while a partially ingested one would render as a
    // collection whose ads had vanished.
    if (!view || !view.ads.length) return result('empty', null, [])
    return result('rendered', view, [])
  } catch (error) {
    return result('unavailable', null, [message(error)])
  }
}
