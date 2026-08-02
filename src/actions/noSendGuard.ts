import type { AbortingWallet } from './releaseCollectionRehearsal.ts'

/**
 * Runs the verification that follows a completed no-send action, releasing the
 * action's reserved funding if that verification refuses it.
 *
 * `noSend: true` withholds the broadcast, not the commitment: the wallet has
 * already selected real inputs and signed a real transaction, so it reserves
 * those inputs and its own no-send change until the action is published or
 * aborted. A rehearsal that throws on the way to being returned therefore takes
 * its funding with it, and its abort reference is lost with the stack frame.
 *
 * The original failure is always what propagates. A wallet that refuses to
 * abort must not replace the reason the rehearsal was rejected.
 */
export async function releaseOnFailure<T>(
  wallet: AbortingWallet,
  reference: string | undefined,
  work: () => Promise<T> | T,
): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (reference) {
      await wallet.abortAction({ reference }).catch(() => undefined)
    }
    throw error
  }
}
