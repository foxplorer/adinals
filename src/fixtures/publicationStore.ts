import type { ReviewActionResult, SendWithResult } from '@bsv/sdk'
import { COLLECTION_PUBLICATIONS_STORE, openAdinalsDatabase } from './database.ts'
import type { OverlaySubmissionStatus } from '../overlay/submissionQueue.ts'

export type PublicationOutcome = 'submitting' | 'accepted' | 'uncertain' | 'rejected'
export type IndexerOutcome = 'not-submitted' | 'submitted' | 'indexed' | 'not-indexed'

export type CollectionPublicationAttempt = {
  format: 'adinals-brc100-publication-attempt-v1'
  outpoint: string
  identityKey: string
  txid: string
  anchorTxid: string
  startedAt: string
  updatedAt: string
  outcome: PublicationOutcome
  message: string
  sendWithResults: SendWithResult[]
  reviewActionResults: ReviewActionResult[]
  indexerOutcome: IndexerOutcome
  overlayStatus?: OverlaySubmissionStatus
}

export async function saveCollectionPublicationAttempt(
  attempt: CollectionPublicationAttempt,
): Promise<void> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable.')
  const database = await openAdinalsDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(COLLECTION_PUBLICATIONS_STORE, 'readwrite')
      transaction.objectStore(COLLECTION_PUBLICATIONS_STORE).put(attempt)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the publication attempt.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving the publication attempt was aborted.'))
    })
  } finally {
    database.close()
  }
}

export async function loadCollectionPublicationAttempt(
  identityKey: string,
  outpoint: string,
): Promise<CollectionPublicationAttempt | null> {
  if (typeof indexedDB === 'undefined') return null
  const database = await openAdinalsDatabase()
  try {
    const row = await new Promise<CollectionPublicationAttempt | undefined>((resolve, reject) => {
      const request = database.transaction(COLLECTION_PUBLICATIONS_STORE, 'readonly')
        .objectStore(COLLECTION_PUBLICATIONS_STORE)
        .get(outpoint)
      request.onsuccess = () => resolve(request.result as CollectionPublicationAttempt | undefined)
      request.onerror = () => reject(request.error ?? new Error('Could not read the publication attempt.'))
    })
    return row?.identityKey === identityKey ? row : null
  } finally {
    database.close()
  }
}
