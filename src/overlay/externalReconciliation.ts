export type ConfirmedExternalSpend = {
  txid: string
  beef: number[]
}

export type ExternalReconciliationFailure = {
  outpoint: string
  error: string
}

export type ExternalReconciliationResult = {
  checked: number
  noSpend: number
  alreadyPresent: number
  submitted: number
  failures: ExternalReconciliationFailure[]
}

export type ExternalReconciliationOptions = {
  currentOutpoints: readonly string[]
  discoverConfirmedSpend: (outpoint: string) => Promise<ConfirmedExternalSpend | null>
  submit: (beef: readonly number[]) => Promise<unknown>
  hasOutput: (outpoint: string) => Promise<boolean>
  pollAttempts?: number
  pollIntervalMs?: number
  sleep?: (milliseconds: number) => Promise<void>
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Reconciles one snapshot of current Adinal states.
 *
 * Discovery never grants membership: the submitted proof still passes the
 * normal fail-closed Topic Manager. Every valid lifecycle successor is output
 * zero, so exact visibility there is the durable completion boundary.
 */
export async function reconcileConfirmedExternalSpends(
  options: ExternalReconciliationOptions,
): Promise<ExternalReconciliationResult> {
  const result: ExternalReconciliationResult = {
    checked: 0,
    noSpend: 0,
    alreadyPresent: 0,
    submitted: 0,
    failures: [],
  }
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const pollAttempts = options.pollAttempts ?? 40
  const pollIntervalMs = options.pollIntervalMs ?? 250

  for (const source of [...new Set(options.currentOutpoints)]) {
    result.checked += 1
    try {
      if (!/^[0-9a-f]{64}_\d+$/.test(source)) throw new Error('invalid current overlay outpoint')
      const candidate = await options.discoverConfirmedSpend(source)
      if (!candidate) {
        result.noSpend += 1
        continue
      }
      if (!/^[0-9a-f]{64}$/.test(candidate.txid) || candidate.beef.length === 0) {
        throw new Error('confirmed spend discovery returned invalid evidence')
      }
      const successor = `${candidate.txid}_0`
      if (await options.hasOutput(successor)) {
        result.alreadyPresent += 1
        continue
      }
      await options.submit(candidate.beef)
      let visible = false
      for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        if (await options.hasOutput(successor)) {
          visible = true
          break
        }
        if (attempt + 1 < pollAttempts) await sleep(pollIntervalMs)
      }
      if (!visible) throw new Error('submitted external spend did not produce an exact admitted successor')
      result.submitted += 1
    } catch (error) {
      result.failures.push({ outpoint: source, error: errorMessage(error) })
    }
  }
  return result
}

