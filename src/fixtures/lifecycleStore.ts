import type { AdinalsNoSendAction } from '../actions/lifecycle.ts'
import { LIFECYCLE_REHEARSALS_STORE, openAdinalsDatabase } from './database.ts'

type StoredLifecycleAction = {
  outpoint: string
  identityKey: string
  savedAt: string
  result: AdinalsNoSendAction
}

export type StoredLifecycleProof = Pick<
  AdinalsNoSendAction,
  'kind' | 'txid' | 'outpoint' | 'atomicBeef'
>

export async function saveLifecycleRehearsal(identityKey: string, result: AdinalsNoSendAction): Promise<void> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable.')
  const database = await openAdinalsDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LIFECYCLE_REHEARSALS_STORE, 'readwrite')
      transaction.objectStore(LIFECYCLE_REHEARSALS_STORE).put({
        outpoint: result.outpoint, identityKey, savedAt: new Date().toISOString(), result,
      } satisfies StoredLifecycleAction)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the lifecycle rehearsal.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving the lifecycle rehearsal was aborted.'))
    })
  } finally {
    database.close()
  }
}

export async function loadLifecycleRehearsals(identityKey: string): Promise<AdinalsNoSendAction[]> {
  if (typeof indexedDB === 'undefined') return []
  const database = await openAdinalsDatabase()
  try {
    const rows = await new Promise<StoredLifecycleAction[]>((resolve, reject) => {
      const request = database.transaction(LIFECYCLE_REHEARSALS_STORE, 'readonly').objectStore(LIFECYCLE_REHEARSALS_STORE).getAll()
      request.onsuccess = () => resolve(request.result as StoredLifecycleAction[])
      request.onerror = () => reject(request.error ?? new Error('Could not read lifecycle rehearsals.'))
    })
    return rows.filter((row) => row.identityKey === identityKey).sort((a, b) => a.savedAt.localeCompare(b.savedAt)).map((row) => row.result)
  } finally {
    database.close()
  }
}

/**
 * Returns only immutable public transaction material for an exact outpoint.
 * Wallet-local abort references and derived key identifiers are deliberately
 * excluded so a wallet switch cannot inherit another identity's capabilities.
 */
export async function loadStoredLifecycleProof(outpoint: string): Promise<StoredLifecycleProof | null> {
  if (typeof indexedDB === 'undefined') return null
  const database = await openAdinalsDatabase()
  try {
    const row = await new Promise<StoredLifecycleAction | undefined>((resolve, reject) => {
      const request = database.transaction(LIFECYCLE_REHEARSALS_STORE, 'readonly')
        .objectStore(LIFECYCLE_REHEARSALS_STORE)
        .get(outpoint)
      request.onsuccess = () => resolve(request.result as StoredLifecycleAction | undefined)
      request.onerror = () => reject(request.error ?? new Error('Could not read the lifecycle proof.'))
    })
    if (!row) return null
    return {
      kind: row.result.kind,
      txid: row.result.txid,
      outpoint: row.result.outpoint,
      atomicBeef: [...row.result.atomicBeef],
    }
  } finally {
    database.close()
  }
}

export async function deleteLifecycleRehearsal(identityKey: string, outpoint: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const database = await openAdinalsDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LIFECYCLE_REHEARSALS_STORE, 'readwrite')
      const store = transaction.objectStore(LIFECYCLE_REHEARSALS_STORE)
      const request = store.get(outpoint)
      request.onsuccess = () => {
        const row = request.result as StoredLifecycleAction | undefined
        if (row?.identityKey === identityKey) store.delete(outpoint)
      }
      request.onerror = () => reject(request.error ?? new Error('Could not inspect the lifecycle rehearsal.'))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete the lifecycle rehearsal.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Deleting the lifecycle rehearsal was aborted.'))
    })
  } finally {
    database.close()
  }
}
