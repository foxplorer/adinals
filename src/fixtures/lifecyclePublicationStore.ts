import type { ReviewActionResult, SendWithResult } from '@bsv/sdk'
import type { IndexerOutcome, PublicationOutcome } from './publicationStore.ts'
import { LIFECYCLE_PUBLICATIONS_STORE, openAdinalsDatabase } from './database.ts'

export type LifecyclePublicationAttempt = {
  format: 'adinals-brc100-lifecycle-publication-v1'
  outpoint: string
  stateOutpoint?: string
  identityKey: string
  kind: 'mint' | 'update' | 'decision' | 'listing' | 'purchase' | 'cancel'
  primaryTxid: string
  txids: string[]
  startedAt: string
  updatedAt: string
  outcome: PublicationOutcome
  message: string
  sendWithResults: SendWithResult[]
  reviewActionResults: ReviewActionResult[]
  indexerOutcome: IndexerOutcome
}

export async function saveLifecyclePublicationAttempt(attempt: LifecyclePublicationAttempt): Promise<void> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable.')
  const database = await openAdinalsDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LIFECYCLE_PUBLICATIONS_STORE, 'readwrite')
      transaction.objectStore(LIFECYCLE_PUBLICATIONS_STORE).put(attempt)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the lifecycle publication attempt.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving the lifecycle publication attempt was aborted.'))
    })
  } finally {
    database.close()
  }
}

export async function loadLifecyclePublicationAttempts(identityKey: string): Promise<LifecyclePublicationAttempt[]> {
  if (typeof indexedDB === 'undefined') return []
  const database = await openAdinalsDatabase()
  try {
    const rows = await new Promise<LifecyclePublicationAttempt[]>((resolve, reject) => {
      const request = database.transaction(LIFECYCLE_PUBLICATIONS_STORE, 'readonly')
        .objectStore(LIFECYCLE_PUBLICATIONS_STORE)
        .getAll()
      request.onsuccess = () => resolve(request.result as LifecyclePublicationAttempt[])
      request.onerror = () => reject(request.error ?? new Error('Could not read lifecycle publication attempts.'))
    })
    return rows
      .filter((row) => row.identityKey === identityKey)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  } finally {
    database.close()
  }
}
