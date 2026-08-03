/**
 * Decides when a visitor's wallet should offer its baskets to the overlay.
 *
 * The repair is worth running rarely. Every record this application publishes is
 * already delivered by the write path, so a wallet that only ever acted here
 * finds nothing to submit; what it catches is an Adinal acquired elsewhere, a
 * wallet used with another client, or a node rebuilt from an incomplete
 * backfill. Running it on every page load would spend a round trip per basket
 * output to learn nothing.
 *
 * The interval is per wallet *and* per endpoint. A different node knows a
 * different set of records, so pointing the application at another overlay is a
 * reason to ask again immediately rather than to wait out a timer set against
 * the previous one.
 */
export const BASKET_REPAIR_INTERVAL_MS = 24 * 60 * 60 * 1000

export type BasketRepairSchedule = {
  identityKey: string
  endpoint: string
  lastRunAt: number
}

/** One marker per wallet and endpoint pair. */
export const basketRepairKey = (identityKey: string, endpoint: string): string =>
  `adinals-basket-repair:${identityKey}:${endpoint}`

export function shouldRepairBaskets(options: {
  identityKey: string
  endpoint: string
  lastRunAt: number | null
  now?: number
  intervalMs?: number
}): boolean {
  if (!options.identityKey || !options.endpoint) return false
  if (options.lastRunAt === null) return true
  const now = options.now ?? Date.now()
  const intervalMs = options.intervalMs ?? BASKET_REPAIR_INTERVAL_MS
  // A marker from the future means a clock change rather than a recent run, and
  // should not postpone the repair indefinitely.
  if (options.lastRunAt > now) return true
  return now - options.lastRunAt >= intervalMs
}

export type BasketRepairMarkerStore = {
  read: (key: string) => string | null
  write: (key: string, value: string) => void
}

/** Falls back to no memory when storage is unavailable, which repeats the
 *  repair rather than skipping it. */
export const browserMarkerStore = (): BasketRepairMarkerStore => {
  const available = (): Storage | null => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      return null
    }
  }
  return {
    read: (key) => {
      try {
        return available()?.getItem(key) ?? null
      } catch {
        return null
      }
    },
    write: (key, value) => {
      try {
        available()?.setItem(key, value)
      } catch {
        // A full or blocked store only costs a repeated repair.
      }
    },
  }
}

export const readLastRunAt = (
  store: BasketRepairMarkerStore,
  identityKey: string,
  endpoint: string,
): number | null => {
  const raw = store.read(basketRepairKey(identityKey, endpoint))
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export const writeLastRunAt = (
  store: BasketRepairMarkerStore,
  identityKey: string,
  endpoint: string,
  now = Date.now(),
): void => {
  store.write(basketRepairKey(identityKey, endpoint), String(now))
}
