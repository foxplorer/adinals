import type { AdinalsCollectionRehearsal } from '../actions/index.ts'
import type { AdinalsNoSendAction } from '../actions/lifecycle.ts'
import {
  COLLECTION_PUBLICATIONS_STORE,
  COLLECTION_REHEARSALS_STORE,
  LIFECYCLE_PUBLICATIONS_STORE,
  LIFECYCLE_REHEARSALS_STORE,
  openAdinalsDatabase,
  OVERLAY_SUBMISSIONS_STORE,
} from '../fixtures/database.ts'
import type { LifecyclePublicationAttempt } from '../fixtures/lifecyclePublicationStore.ts'
import type { CollectionPublicationAttempt } from '../fixtures/publicationStore.ts'
import { enqueueOverlaySubmission, type OverlaySubmission } from './submissionQueue.ts'

type StoredResult<T> = { outpoint: string; result: T }

const all = <T>(store: IDBObjectStore): Promise<T[]> => new Promise((resolve, reject) => {
  const request = store.getAll()
  request.onsuccess = () => resolve(request.result as T[])
  request.onerror = () => reject(request.error ?? new Error('Could not read retained overlay recovery evidence.'))
})

/**
 * Rebuild missing queue entries from wallet-accepted publications and their
 * retained Atomic BEEF. This closes the gap between broadcast acceptance and
 * queue creation without weakening overlay admission or relying on an indexer.
 */
export async function recoverAcceptedOverlaySubmissions(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0
  const database = await openAdinalsDatabase()
  try {
    const transaction = database.transaction([
      COLLECTION_PUBLICATIONS_STORE,
      COLLECTION_REHEARSALS_STORE,
      LIFECYCLE_PUBLICATIONS_STORE,
      LIFECYCLE_REHEARSALS_STORE,
      OVERLAY_SUBMISSIONS_STORE,
    ], 'readonly')
    const [collectionAttempts, collectionRows, lifecycleAttempts, lifecycleRows, queued] = await Promise.all([
      all<CollectionPublicationAttempt>(transaction.objectStore(COLLECTION_PUBLICATIONS_STORE)),
      all<StoredResult<AdinalsCollectionRehearsal>>(transaction.objectStore(COLLECTION_REHEARSALS_STORE)),
      all<LifecyclePublicationAttempt>(transaction.objectStore(LIFECYCLE_PUBLICATIONS_STORE)),
      all<StoredResult<AdinalsNoSendAction>>(transaction.objectStore(LIFECYCLE_REHEARSALS_STORE)),
      all<OverlaySubmission>(transaction.objectStore(OVERLAY_SUBMISSIONS_STORE)),
    ])
    const existing = new Set(queued.map((row) => row.key))
    const collections = new Map(collectionRows.map((row) => [row.outpoint, row.result]))
    const lifecycle = new Map(lifecycleRows.map((row) => [row.outpoint, row.result]))
    const candidates = [
      ...collectionAttempts.flatMap((attempt) => {
        const rehearsal = collections.get(attempt.outpoint)
        return attempt.outcome === 'accepted' && rehearsal?.txid === attempt.txid
          ? [{ txid: rehearsal.txid, outpoints: [rehearsal.outpoint], atomicBeef: rehearsal.atomicBeef }]
          : []
      }),
      ...lifecycleAttempts.flatMap((attempt) => {
        const rehearsal = lifecycle.get(attempt.outpoint)
        if (attempt.outcome !== 'accepted' || rehearsal?.txid !== attempt.primaryTxid) return []
        const outpoints = rehearsal.kind === 'update' && rehearsal.stateOutpoint
          ? [rehearsal.stateOutpoint, rehearsal.outpoint]
          : [rehearsal.outpoint]
        return [{ txid: rehearsal.txid, outpoints, atomicBeef: rehearsal.atomicBeef }]
      }),
    ]
    let recovered = 0
    for (const candidate of candidates) {
      if (existing.has(candidate.outpoints[0]!)) continue
      const queuedSubmission = await enqueueOverlaySubmission(candidate)
      if (queuedSubmission) {
        existing.add(queuedSubmission.key)
        recovered += 1
      }
    }
    return recovered
  } finally {
    database.close()
  }
}
