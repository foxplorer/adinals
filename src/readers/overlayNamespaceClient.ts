import { AdinalsOverlayClient } from '../overlay/client.ts'
import { ADINALS_NAMESPACE, ADINALS_OVERLAY_URL } from '../config/environment.ts'
import { overlayCreatives, type Creative } from './creativeStore.ts'
import {
  overlayCreativeBytes,
  overlayEvidence,
  readOverlayFormula,
} from './overlayReader.ts'
import { addOverlayEvidenceToSnapshot } from './overlayIndexSnapshot.ts'
import { deriveCollectionView, type EvidenceRecord } from './overlayViewModel.ts'
import { emptyIndexSnapshot, type IndexSnapshot } from './ownershipModel.ts'
import {
  mapWithConcurrency,
  readOverlayNamespace,
  OVERLAY_NAMESPACE_CONCURRENCY,
  type OverlayNamespaceResult,
} from './overlayNamespace.ts'

/**
 * Wires namespace reads to the configured overlay. Separate from
 * `overlayNamespace.ts` because the hydrating reader imports `@1sat/templates`,
 * which Vite bundles but Node cannot execute directly.
 *
 * The rendered model and the ownership index are two shapes of one answer, so
 * the evidence behind them is read once and derived twice. Reading it twice
 * would double the slowest part of a page load to produce the same bytes.
 */
type NamespaceEvidence = {
  origins: string[]
  byCollection: Map<string, EvidenceRecord[]>
  creatives: Creative[]
}

/**
 * One in-flight read is shared and a completed one is reused briefly. The
 * window is deliberately short: this is deduplication within a page
 * interaction, not a cache with its own staleness rules.
 */
const EVIDENCE_REUSE_MS = 15_000
let retained: { at: number; work: Promise<NamespaceEvidence | null> } | null = null

const readNamespaceEvidence = (): Promise<NamespaceEvidence | null> => {
  if (retained && Date.now() - retained.at < EVIDENCE_REUSE_MS) return retained.work

  const work = (async (): Promise<NamespaceEvidence | null> => {
    if (!ADINALS_OVERLAY_URL) return null
    const client = new AdinalsOverlayClient(ADINALS_OVERLAY_URL, {
      topic: ADINALS_NAMESPACE.overlayTopic,
    })
    // Hydrated rather than taken at its word: each listed collection is a
    // verified record before its origin is used to read anything else.
    const origins = (await readOverlayFormula(client, {
      type: 'collections', version: 1, limit: 500,
    }))
      .filter((record) => record.recordType === 'collection')
      .map((record) => record.outpoint)

    const byCollection = new Map<string, EvidenceRecord[]>()
    const creatives: Creative[] = []
    const projections = await mapWithConcurrency(
      origins,
      OVERLAY_NAMESPACE_CONCURRENCY,
      async (origin) => ({
        origin,
        records: await readOverlayFormula(client, {
          type: 'collectionProjection', version: 1, origin,
        }),
      }),
    )
    for (const projection of projections) {
      byCollection.set(projection.origin, overlayEvidence(projection.records))
      creatives.push(...overlayCreativeBytes(projection.records))
    }
    return { origins, byCollection, creatives }
  })()

  retained = { at: Date.now(), work }
  // A failed read must not be reused as a cached failure.
  void work.catch(() => { retained = null })
  return work
}

/** Discards retained evidence, so the next read is fresh. */
export const forgetOverlayNamespace = (): void => { retained = null }

export async function runOverlayNamespaceRead(
  options: { now?: Date; timeoutMs?: number } = {},
): Promise<OverlayNamespaceResult> {
  const now = options.now ?? new Date()
  let evidence: NamespaceEvidence | null = null

  return readOverlayNamespace({
    enabled: Boolean(ADINALS_OVERLAY_URL),
    ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
    listCollections: async () => {
      evidence = await readNamespaceEvidence()
      if (!evidence) return []
      // Covers and creatives for the whole namespace arrive with the evidence,
      // so collection cards no longer depend on a public content host either.
      overlayCreatives.register(evidence.creatives)
      return evidence.origins
    },
    // Already in hand: deriving the view issues no further request.
    readCollection: async (origin) => {
      const records = evidence?.byCollection.get(origin)
      return records ? deriveCollectionView(records, origin, now) : null
    },
  })
}

/**
 * The same evidence as an ownership index snapshot.
 *
 * Returns null when no overlay is configured or the node lists nothing, which
 * the ownership reader treats as unknown and answers from the public index.
 */
export async function readOverlayOwnershipSnapshot(): Promise<IndexSnapshot | null> {
  const evidence = await readNamespaceEvidence()
  if (!evidence || !evidence.origins.length) return null

  const snapshot = emptyIndexSnapshot()
  for (const [origin, records] of evidence.byCollection) {
    addOverlayEvidenceToSnapshot(snapshot, origin, records)
  }
  return snapshot
}
