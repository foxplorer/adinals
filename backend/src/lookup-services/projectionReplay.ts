import type { AdinalsStorageLike } from './AdinalsStorage.js'
import {
  DERIVATION_VERSION,
  buildCollectionProjection,
  collectionOriginsIn
} from './projections.js'

export type ReplayReport = {
  collections: number
  ads: number
  emptyCollections: number
  milliseconds: number
}

/**
 * Rebuilds the whole derived layer from evidence the node already holds.
 *
 * This is the operation that makes the projection schema free to change: bump
 * `DERIVATION_VERSION`, deploy, and the layer is replayed locally in
 * milliseconds. It reads no network, asks no indexer, and touches the chain not
 * at all — the evidence store is the input and it is append-only.
 *
 * Chain re-ingestion is a different operation with different risks and belongs
 * to `overlay:backfill`, which exists to *discover* records nobody submitted.
 */
export const replayProjections = async (
  storage: AdinalsStorageLike,
  now: Date = new Date()
): Promise<ReplayReport> => {
  const started = Date.now()
  // The one remaining full read, at replay time rather than per request.
  const records = await storage.findAllRecords()
  const report: ReplayReport = {
    collections: 0,
    ads: 0,
    emptyCollections: 0,
    milliseconds: 0
  }

  for (const collectionId of collectionOriginsIn(records)) {
    const { collection, ads } = buildCollectionProjection(records, collectionId, now)
    await storage.replaceCollectionProjection(collectionId, collection, ads)
    if (!collection) continue
    report.collections += 1
    report.ads += ads.length
    if (ads.length === 0) report.emptyCollections += 1
  }

  report.milliseconds = Date.now() - started
  return report
}

/**
 * Re-derives one collection after its evidence changed.
 *
 * Scoped by the `collectionId` annotation carried on every row, so an admission
 * costs one collection's worth of work rather than the namespace's. A record
 * that has no scope yet cannot be placed, and the caller replays instead.
 */
export const replayCollection = async (
  storage: AdinalsStorageLike,
  collectionId: string,
  now: Date = new Date()
): Promise<number> => {
  const records = await storage.findRecordsByCollection(collectionId)
  const { collection, ads } = buildCollectionProjection(records, collectionId, now)
  await storage.replaceCollectionProjection(collectionId, collection, ads)
  return ads.length
}

/** Replays only when the stored layer was built by older derivation code. */
export const replayIfStale = async (
  storage: AdinalsStorageLike,
  now: Date = new Date()
): Promise<ReplayReport | null> => {
  const stale = await storage.staleProjectionCount(DERIVATION_VERSION)
  const records = await storage.findAllRecords()
  const expected = collectionOriginsIn(records).length
  if (stale === 0 && expected === 0) return null

  // An empty projection layer against non-empty evidence is also stale.
  if (stale === 0) {
    let present = 0
    for (const collectionId of collectionOriginsIn(records)) {
      if (await storage.findCollectionProjection(collectionId)) present += 1
    }
    if (present === expected) return null
  }
  return await replayProjections(storage, now)
}
