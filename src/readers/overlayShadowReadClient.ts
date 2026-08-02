import { AdinalsOverlayClient } from '../overlay/client.ts'
import { ADINALS_NAMESPACE, ADINALS_OVERLAY_URL } from '../config/environment.ts'
import { readOverlayLifecycleProjection } from './overlayReader.ts'
import {
  readOverlayShadowComparison,
  recordOverlayShadowRead,
  retainedOverlayShadowReads,
  type OverlayShadowReadResult,
} from './overlayShadowRead.ts'

// Retained comparisons are reachable from the console during the shadow period.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).adinalsOverlayShadowReads =
    retainedOverlayShadowReads
}

/**
 * Wires the shadow comparison to the configured overlay. Separate from
 * `overlayShadowRead.ts` because the projection reader pulls in
 * `@1sat/templates`, which Vite bundles but Node cannot import directly.
 *
 * Returns null when no overlay endpoint is configured, which stays the
 * production default until an operator names one.
 */
export async function runOverlayShadowRead(
  origin: string,
  options: { now?: Date; timeoutMs?: number } = {},
): Promise<OverlayShadowReadResult | null> {
  if (!ADINALS_OVERLAY_URL) {
    console.info('Overlay shadow read skipped: no overlay endpoint is configured')
    return null
  }
  const client = new AdinalsOverlayClient(ADINALS_OVERLAY_URL, {
    topic: ADINALS_NAMESPACE.overlayTopic,
  })
  const result = await readOverlayShadowComparison(origin, {
    overlay: (collectionOrigin) =>
      readOverlayLifecycleProjection(client, collectionOrigin, options.now ?? new Date()),
    endpoint: ADINALS_OVERLAY_URL,
    ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
  })
  return recordOverlayShadowRead(result)
}
