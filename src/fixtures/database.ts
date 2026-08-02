const DATABASE = 'adinals-brc100'
const VERSION = 5

export const COLLECTION_REHEARSALS_STORE = 'collection-rehearsals'
export const COLLECTION_PUBLICATIONS_STORE = 'collection-publication-attempts'
export const LIFECYCLE_REHEARSALS_STORE = 'lifecycle-rehearsals'
export const LIFECYCLE_PUBLICATIONS_STORE = 'lifecycle-publication-attempts'
export const OVERLAY_SUBMISSIONS_STORE = 'overlay-submissions'

export const openAdinalsDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DATABASE, VERSION)
  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains(COLLECTION_REHEARSALS_STORE)) {
      database.createObjectStore(COLLECTION_REHEARSALS_STORE, { keyPath: 'outpoint' })
    }
    if (!database.objectStoreNames.contains(COLLECTION_PUBLICATIONS_STORE)) {
      database.createObjectStore(COLLECTION_PUBLICATIONS_STORE, { keyPath: 'outpoint' })
    }
    if (!database.objectStoreNames.contains(LIFECYCLE_REHEARSALS_STORE)) {
      database.createObjectStore(LIFECYCLE_REHEARSALS_STORE, { keyPath: 'outpoint' })
    }
    if (!database.objectStoreNames.contains(LIFECYCLE_PUBLICATIONS_STORE)) {
      database.createObjectStore(LIFECYCLE_PUBLICATIONS_STORE, { keyPath: 'outpoint' })
    }
    if (!database.objectStoreNames.contains(OVERLAY_SUBMISSIONS_STORE)) {
      database.createObjectStore(OVERLAY_SUBMISSIONS_STORE, { keyPath: 'key' })
    }
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('Could not open the Adinals browser database.'))
})
