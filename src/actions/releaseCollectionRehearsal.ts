import type { WalletInterface } from '@bsv/sdk'

/**
 * Releases a completed no-send collection rehearsal that will not be published.
 *
 * A no-send action keeps its inputs reserved inside the wallet: the balance
 * still shows them, but they cannot fund anything else. Abandoning a rehearsal
 * without aborting it therefore strands real satoshis, one anchor reserve and
 * one funding output at a time.
 *
 * Unlike `abortLifecycleRehearsal`, this never throws. It runs while another
 * failure is already being reported, so a wallet that refuses to release an
 * action must not replace the original explanation with its own.
 */
export type AbortingWallet = Pick<WalletInterface, 'abortAction'>

export type ReleasedRehearsal = {
  childAborted: boolean
  anchorAborted: boolean | null
  notes: string[]
}

const abort = async (
  wallet: AbortingWallet,
  reference: string,
  label: string,
  notes: string[],
): Promise<boolean> => {
  if (!reference) {
    notes.push(`${label} had no abort reference`)
    return false
  }
  try {
    const result = await wallet.abortAction({ reference })
    notes.push(result.aborted ? `${label} released` : `${label} retained`)
    return result.aborted
  } catch (error) {
    notes.push(`${label} cleanup unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

export async function releaseCollectionRehearsal(
  wallet: AbortingWallet,
  references: { actionReference: string; anchorReference: string },
): Promise<ReleasedRehearsal> {
  const notes: string[] = []
  // The child spends the anchor, so it is always released first.
  const childAborted = await abort(wallet, references.actionReference, 'collection action', notes)
  if (!childAborted) return { childAborted, anchorAborted: null, notes }
  const anchorAborted = await abort(wallet, references.anchorReference, 'anchor', notes)
  return { childAborted, anchorAborted, notes }
}
