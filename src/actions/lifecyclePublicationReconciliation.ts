import type { ActionStatus, WalletInterface } from '@bsv/sdk'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import type { LifecyclePublicationAttempt } from '../fixtures/lifecyclePublicationStore.ts'
import { readTransactionNetworkStatus, type TransactionNetworkStatus } from '../readers/networkStatus.ts'

export type LifecyclePublicationReconciliation = {
  checkedAt: string
  outcome: 'accepted' | 'uncertain' | 'rejected'
  message: string
  walletStatuses: Record<string, ActionStatus | null>
  network: TransactionNetworkStatus[]
  indexerOutcome: LifecyclePublicationAttempt['indexerOutcome']
}

const walletAccepted = (status: ActionStatus | null): boolean => status === 'completed' || status === 'unproven'

export function classifyLifecyclePublicationReconciliation(
  attempt: Pick<LifecyclePublicationAttempt, 'primaryTxid' | 'txids'>,
  walletStatuses: Record<string, ActionStatus | null>,
  network: TransactionNetworkStatus[],
): LifecyclePublicationReconciliation {
  if (network.length !== attempt.txids.length || attempt.txids.some((txid, index) => network[index]?.txid !== txid)) {
    throw new Error('Lifecycle reconciliation returned evidence for unexpected transaction IDs.')
  }
  const primary = network.find((entry) => entry.txid === attempt.primaryTxid)
  if (!primary) throw new Error('Lifecycle reconciliation is missing the primary transaction.')
  const primaryPublic = primary.whatsOnChain.presence === 'present'
  const allWalletAccepted = attempt.txids.every((txid) => walletAccepted(walletStatuses[txid] ?? null))
  const indexerOutcome = primary.gorillaPool.presence === 'present' ? 'indexed' : 'not-indexed'
  if (primaryPublic || allWalletAccepted) {
    return {
      checkedAt: new Date().toISOString(), outcome: 'accepted',
      message: primaryPublic
        ? 'The exact lifecycle transaction is present on the public network. It must not be submitted again.'
        : 'The wallet reports the exact batch in its accepted broadcast lifecycle. It must not be submitted again.',
      walletStatuses, network, indexerOutcome,
    }
  }
  const anyWalletFailed = attempt.txids.some((txid) => walletStatuses[txid] === 'failed')
  const everyReaderAbsent = network.every((entry) =>
    entry.whatsOnChain.presence === 'absent' && entry.gorillaPool.presence === 'absent')
  if (anyWalletFailed && everyReaderAbsent) {
    return {
      checkedAt: new Date().toISOString(), outcome: 'rejected',
      message: 'The wallet reports a failed exact transaction and every reader reports the batch absent. Keep this attempt closed.',
      walletStatuses, network, indexerOutcome,
    }
  }
  return {
    checkedAt: new Date().toISOString(), outcome: 'uncertain',
    message: 'Wallet and public-reader evidence do not prove a final outcome. Do not publish or replace this chain.',
    walletStatuses, network, indexerOutcome,
  }
}

export async function reconcileLifecyclePublication(
  wallet: Pick<WalletInterface, 'listActions'>,
  attempt: LifecyclePublicationAttempt,
  fetcher: typeof fetch = fetch,
): Promise<LifecyclePublicationReconciliation> {
  const [actions, network] = await Promise.all([
    wallet.listActions({ labels: [ADINALS_NAMESPACE.actionLabel], labelQueryMode: 'all', includeLabels: true, limit: 100 }),
    Promise.all(attempt.txids.map((txid) => readTransactionNetworkStatus(
      txid,
      fetcher,
      txid === attempt.primaryTxid ? attempt.outpoint : undefined,
    ))),
  ])
  const walletStatuses = Object.fromEntries(attempt.txids.map((txid) => [
    txid,
    actions.actions.find((action) => action.txid === txid)?.status ?? null,
  ]))
  return classifyLifecyclePublicationReconciliation(attempt, walletStatuses, network)
}
