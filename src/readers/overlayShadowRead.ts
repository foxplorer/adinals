import {
  comparePublicLifecycleProjection,
  publicLifecycleProjection,
  type LifecycleProjection,
  type PublicLifecycleProjection,
} from '../overlay/lifecycleParity.ts'
import { readDerivedCollectionProjection } from './derivedApiReader.ts'

/**
 * Stage one of moving reads onto the overlay: compare, never render.
 *
 * The product still displays the current public reader. This runs the same
 * projection against the overlay in the background and records whether the two
 * agree, so a deployed shadow node earns trust from real sessions before
 * anything depends on it. It resolves rather than throws: a slow or absent
 * overlay is a recorded observation, not a user-visible failure.
 *
 * The overlay projection reader is injected because it imports
 * `@1sat/templates`, whose extensionless ESM chain Node cannot resolve. Keeping
 * this module free of that import is what makes the comparison unit-testable.
 */
export type OverlayShadowReadStatus =
  | 'match'
  | 'diverged'
  | 'overlay-unavailable'
  | 'reference-unavailable'

export type OverlayShadowReadResult = {
  origin: string
  endpoint: string
  checkedAt: string
  status: OverlayShadowReadStatus
  errors: string[]
  durationMs: number
}

export const OVERLAY_SHADOW_READ_EVENT = 'adinals-overlay-shadow-read'
export const OVERLAY_SHADOW_READ_TIMEOUT_MS = 12_000
const RETAINED_RESULTS = 20

const retained: OverlayShadowReadResult[] = []

export const retainedOverlayShadowReads = (): readonly OverlayShadowReadResult[] => [...retained]

const withTimeout = async <T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export async function readOverlayShadowComparison(
  origin: string,
  options: {
    overlay: (origin: string) => Promise<LifecycleProjection>
    reference?: (origin: string) => Promise<PublicLifecycleProjection>
    endpoint?: string
    timeoutMs?: number
  },
): Promise<OverlayShadowReadResult> {
  const startedAt = Date.now()
  const timeoutMs = options.timeoutMs ?? OVERLAY_SHADOW_READ_TIMEOUT_MS
  const reference = options.reference ?? readDerivedCollectionProjection
  const result = (status: OverlayShadowReadStatus, errors: string[]): OverlayShadowReadResult => ({
    origin,
    endpoint: options.endpoint ?? '',
    checkedAt: new Date().toISOString(),
    status,
    errors,
    durationMs: Date.now() - startedAt,
  })

  let expected: PublicLifecycleProjection
  try {
    expected = await withTimeout(reference(origin), timeoutMs, 'reference read')
  } catch (error) {
    // The comparison baseline is missing, so the overlay cannot be judged.
    return result('reference-unavailable', [message(error)])
  }

  try {
    const overlay = await withTimeout(options.overlay(origin), timeoutMs, 'overlay read')
    const errors = comparePublicLifecycleProjection(expected, publicLifecycleProjection(overlay))
    return result(errors.length ? 'diverged' : 'match', errors)
  } catch (error) {
    return result('overlay-unavailable', [message(error)])
  }
}

/** Retains one comparison and announces it to any listening panel. */
export function recordOverlayShadowRead(result: OverlayShadowReadResult): OverlayShadowReadResult {
  retained.unshift(result)
  retained.length = Math.min(retained.length, RETAINED_RESULTS)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OVERLAY_SHADOW_READ_EVENT, { detail: result }))
  }
  return result
}
