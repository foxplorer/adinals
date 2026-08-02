import { ADINALS_NAMESPACE, ADINALS_OVERLAY_URL } from '../config/environment.ts'
import { openAdinalsDatabase, OVERLAY_SUBMISSIONS_STORE } from '../fixtures/database.ts'
import { AdinalsOverlayClient } from './client.ts'

export type OverlaySubmissionStatus = 'provisional' | 'indexed' | 'retrying' | 'failed'

export type OverlaySubmission = {
  format: 'adinals-overlay-submission-v1'
  key: string
  txid: string
  outpoints: string[]
  atomicBeef: number[]
  topic: string
  status: OverlaySubmissionStatus
  attempts: number
  createdAt: string
  updatedAt: string
  nextRetryAt: string
  error: string
}

export type OverlaySubmissionInput = Pick<
  OverlaySubmission,
  'txid' | 'outpoints' | 'atomicBeef'
>

export interface OverlaySubmissionStore {
  put(record: OverlaySubmission): Promise<void>
  listPending(): Promise<OverlaySubmission[]>
}

export type OverlayDeliveryOptions = {
  client?: Pick<AdinalsOverlayClient, 'submit' | 'hasOutput'>
  store?: OverlaySubmissionStore
  pollAttempts?: number
  pollIntervalMs?: number
  now?: () => Date
  sleep?: (milliseconds: number) => Promise<void>
}

const retryDelayMs = (attempts: number): number =>
  Math.min(5 * 60_000, 2_000 * (2 ** Math.max(0, attempts - 1)))

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const normalizeInput = (input: OverlaySubmissionInput): OverlaySubmissionInput => {
  const txid = input.txid.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(txid)) throw new Error('Overlay submission requires a valid transaction ID.')
  if (input.atomicBeef.length === 0) throw new Error('Overlay submission requires verified Atomic BEEF.')
  const outpoints = [...new Set(input.outpoints.map((outpoint) => outpoint.replace('.', '_').toLowerCase()))]
  if (outpoints.length === 0 || outpoints.some((outpoint) => !new RegExp(`^${txid}_(\\d+)$`).test(outpoint))) {
    throw new Error('Overlay submission outpoints must belong to the submitted transaction.')
  }
  return { txid, outpoints, atomicBeef: [...input.atomicBeef] }
}

export const indexedDbOverlaySubmissionStore: OverlaySubmissionStore = {
  async put(record) {
    if (typeof indexedDB === 'undefined') return
    const database = await openAdinalsDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(OVERLAY_SUBMISSIONS_STORE, 'readwrite')
        transaction.objectStore(OVERLAY_SUBMISSIONS_STORE).put(record)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error ?? new Error('Could not save overlay submission.'))
        transaction.onabort = () => reject(transaction.error ?? new Error('Saving overlay submission was aborted.'))
      })
    } finally {
      database.close()
    }
  },

  async listPending() {
    if (typeof indexedDB === 'undefined') return []
    const database = await openAdinalsDatabase()
    try {
      const rows = await new Promise<OverlaySubmission[]>((resolve, reject) => {
        const request = database.transaction(OVERLAY_SUBMISSIONS_STORE, 'readonly')
          .objectStore(OVERLAY_SUBMISSIONS_STORE).getAll()
        request.onsuccess = () => resolve(request.result as OverlaySubmission[])
        request.onerror = () => reject(request.error ?? new Error('Could not read overlay submissions.'))
      })
      return rows.filter((row) => row.status === 'provisional' || row.status === 'retrying')
    } finally {
      database.close()
    }
  },
}

const announce = (record: OverlaySubmission): void => {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('adinals-overlay-status', { detail: record }))
  }
}

const persist = async (store: OverlaySubmissionStore, record: OverlaySubmission): Promise<void> => {
  await store.put(record).catch(() => undefined)
  announce(record)
}

export async function deliverOverlaySubmission(
  source: OverlaySubmission,
  options: OverlayDeliveryOptions = {},
): Promise<OverlaySubmission> {
  const client = options.client ?? (ADINALS_OVERLAY_URL
    ? new AdinalsOverlayClient(ADINALS_OVERLAY_URL, { topic: source.topic })
    : null)
  if (!client) return source
  const store = options.store ?? indexedDbOverlaySubmissionStore
  const now = options.now ?? (() => new Date())
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const pollAttempts = options.pollAttempts ?? 40
  const pollIntervalMs = options.pollIntervalMs ?? 250
  let record = { ...source, attempts: source.attempts + 1, updatedAt: now().toISOString() }
  await persist(store, record)

  try {
    await client.submit(record.atomicBeef)
    record = { ...record, status: 'provisional', error: '', updatedAt: now().toISOString() }
    await persist(store, record)
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
      if ((await Promise.all(record.outpoints.map((outpoint) => client.hasOutput(outpoint)))).every(Boolean)) {
        record = { ...record, status: 'indexed', nextRetryAt: '', error: '', updatedAt: now().toISOString() }
        await persist(store, record)
        return record
      }
      if (attempt + 1 < pollAttempts) await sleep(pollIntervalMs)
    }
    throw new Error('Overlay acknowledged the transaction but exact output storage is still delayed.')
  } catch (error) {
    const detail = errorMessage(error)
    const permanent = /malformed|invalid|reject|unsupported|requires verified|must belong/i.test(detail)
    const nextRetryAt = permanent
      ? ''
      : new Date(now().getTime() + retryDelayMs(record.attempts)).toISOString()
    record = {
      ...record,
      status: permanent ? 'failed' : 'retrying',
      error: detail,
      nextRetryAt,
      updatedAt: now().toISOString(),
    }
    await persist(store, record)
    return record
  }
}

export async function enqueueOverlaySubmission(
  input: OverlaySubmissionInput,
  options: OverlayDeliveryOptions = {},
): Promise<OverlaySubmission | null> {
  if (!options.client && !ADINALS_OVERLAY_URL) return null
  const normalized = normalizeInput(input)
  const now = (options.now ?? (() => new Date()))().toISOString()
  const record: OverlaySubmission = {
    format: 'adinals-overlay-submission-v1',
    key: normalized.outpoints[0]!,
    ...normalized,
    topic: ADINALS_NAMESPACE.overlayTopic,
    status: 'provisional',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    nextRetryAt: '',
    error: '',
  }
  const store = options.store ?? indexedDbOverlaySubmissionStore
  await persist(store, record)
  return deliverOverlaySubmission(record, { ...options, store })
}

export async function retryPendingOverlaySubmissions(
  options: OverlayDeliveryOptions = {},
): Promise<void> {
  if (!options.client && !ADINALS_OVERLAY_URL) return
  const store = options.store ?? indexedDbOverlaySubmissionStore
  const records = await store.listPending()
  const now = (options.now ?? (() => new Date()))().getTime()
  for (const record of records) {
    if (!record.nextRetryAt || Date.parse(record.nextRetryAt) <= now) {
      await deliverOverlaySubmission(record, { ...options, store })
    }
  }
}
