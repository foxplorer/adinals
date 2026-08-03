import { AdinalsOverlayClient } from '../overlay/client.ts'
import { ADINALS_NAMESPACE, ADINALS_OVERLAY_URL } from '../config/environment.ts'
import { readOverlayCollectionView } from './overlayReader.ts'
import {
  readOverlayCollectionSource,
  type OverlayCollectionReadResult,
} from './overlayCollectionRead.ts'
import { overlayCreatives } from './creativeStore.ts'

/**
 * Wires the render-path collection read to the configured overlay. Separate
 * from `overlayCollectionRead.ts` for the same reason the shadow read is split:
 * the hydrating reader pulls in `@1sat/templates`, which Vite bundles but Node
 * cannot import directly.
 */
export async function runOverlayCollectionRead(
  origin: string,
  options: { now?: Date; timeoutMs?: number } = {},
): Promise<OverlayCollectionReadResult> {
  const client = ADINALS_OVERLAY_URL
    ? new AdinalsOverlayClient(ADINALS_OVERLAY_URL, { topic: ADINALS_NAMESPACE.overlayTopic })
    : null
  return readOverlayCollectionSource(origin, {
    read: async (collectionOrigin) => {
      if (!client) return null
      const { view, creatives } = await readOverlayCollectionView(
        client,
        collectionOrigin,
        options.now ?? new Date(),
      )
      // Retained even when the view is discarded as incomplete: the bytes were
      // proven on arrival and the fallback render displays the same records.
      overlayCreatives.register(creatives)
      return view
    },
    endpoint: ADINALS_OVERLAY_URL,
    ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
  })
}
