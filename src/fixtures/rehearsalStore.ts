import type { AdinalsCollectionRehearsal } from '../actions/index.ts'
import { COLLECTION_REHEARSALS_STORE, openAdinalsDatabase } from './database.ts'

type StoredRehearsal = {
  outpoint: string
  identityKey: string
  savedAt: string
  result: AdinalsCollectionRehearsal
}

export async function saveCollectionRehearsal(
  identityKey: string,
  result: AdinalsCollectionRehearsal,
): Promise<void> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable.')
  const database = await openAdinalsDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(COLLECTION_REHEARSALS_STORE, 'readwrite')
      transaction.objectStore(COLLECTION_REHEARSALS_STORE).put({
        outpoint: result.outpoint,
        identityKey,
        savedAt: new Date().toISOString(),
        result,
      } satisfies StoredRehearsal)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the rehearsal.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving the rehearsal was aborted.'))
    })
  } finally {
    database.close()
  }
}

export async function loadLatestCollectionRehearsal(
  identityKey: string,
): Promise<AdinalsCollectionRehearsal | null> {
  if (typeof indexedDB === 'undefined') return null
  const database = await openAdinalsDatabase()
  try {
    const rows = await new Promise<StoredRehearsal[]>((resolve, reject) => {
      const request = database.transaction(COLLECTION_REHEARSALS_STORE, 'readonly').objectStore(COLLECTION_REHEARSALS_STORE).getAll()
      request.onsuccess = () => resolve(request.result as StoredRehearsal[])
      request.onerror = () => reject(request.error ?? new Error('Could not read saved rehearsals.'))
    })
    return rows
      .filter((row) => row.identityKey === identityKey)
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt))[0]?.result ?? null
  } finally {
    database.close()
  }
}
