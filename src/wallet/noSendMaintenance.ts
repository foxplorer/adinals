import type { ListActionsResult, WalletInterface } from '@bsv/sdk'

/**
 * Wallet-side release for no-send actions whose abort reference the application
 * no longer holds.
 *
 * `abortAction` needs the opaque reference returned by `createAction`, and
 * `listActions` never returns one, so an action whose reference was lost is
 * unreachable through BRC-100 alone. `@bsv/wallet-toolbox` adds a reserved
 * `listActions` label that filters to `nosend` status, and with the literal
 * label `abort` its storage layer calls `abortAction` for each match using the
 * reference it holds internally.
 *
 * This is a wallet-toolbox extension rather than a BRC-100 guarantee. A wallet
 * that does not implement it treats the reserved value as an ordinary label,
 * matches nothing, and releases nothing, which is a safe outcome rather than a
 * silent partial one.
 *
 * Releasing is deliberately blunt: it aborts every `nosend` action for the
 * connected wallet user, not only Adinals rehearsals, so a rehearsal that was
 * about to be published is destroyed along with the stranded ones.
 */
export const SPEC_OP_NO_SEND_ACTIONS =
  'ac6b20a3bb320adafecd637b25c84b792ad828d3aa510d05dc841481f664277d'

export type NoSendMaintenanceWallet = Pick<WalletInterface, 'listActions'>

export type NoSendActionSummary = {
  totalActions: number
  satoshis: number
  actions: Array<{ txid: string; satoshis: number; status: string; description: string }>
}

const summarize = (result: ListActionsResult): NoSendActionSummary => {
  const actions = result.actions.map((action) => ({
    txid: action.txid,
    satoshis: action.satoshis,
    status: action.status,
    description: action.description,
  }))
  return {
    totalActions: result.totalActions,
    satoshis: actions.reduce((total, action) => total + Math.abs(action.satoshis), 0),
    actions,
  }
}

/**
 * Lists the wallet's `nosend` actions, or releases them when `abort` is set.
 * Reading is safe to run at any time; releasing is not reversible.
 */
export async function reviewNoSendActions(
  wallet: NoSendMaintenanceWallet,
  options: { abort?: boolean; limit?: number } = {},
): Promise<NoSendActionSummary> {
  const labels = [SPEC_OP_NO_SEND_ACTIONS]
  if (options.abort) labels.push('abort')
  return summarize(await wallet.listActions({
    labels,
    labelQueryMode: 'any',
    includeLabels: false,
    limit: options.limit ?? 100,
  }))
}
