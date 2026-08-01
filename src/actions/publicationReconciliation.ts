import type { ActionStatus, WalletInterface } from '@bsv/sdk'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import type { CollectionPublicationAttempt } from '../fixtures/publicationStore.ts'
import {
  readCollectionNetworkPreflight,
  type CollectionNetworkPreflight,
} from '../readers/networkStatus.ts'

export type PublicationReconciliationWallet = Pick<WalletInterface, 'listActions'>

export type CollectionPublicationReconciliation = {
  checkedAt: string
  outcome: 'accepted' | 'uncertain' | 'rejected'
  message: string
  anchorActionStatus: ActionStatus | null
  collectionActionStatus: ActionStatus | null
  network: CollectionNetworkPreflight
  indexerOutcome: CollectionPublicationAttempt['indexerOutcome']
}

const acceptedWalletStatus = (status: ActionStatus | null): boolean =>
  status === 'completed' || status === 'unproven'

export function classifyPublicationReconciliation(
  attempt: Pick<CollectionPublicationAttempt, 'anchorTxid' | 'txid'>,
  statuses: { anchor: ActionStatus | null; collection: ActionStatus | null },
  network: CollectionNetworkPreflight,
): CollectionPublicationReconciliation {
  if (network.anchor.txid !== attempt.anchorTxid || network.collection.txid !== attempt.txid) {
    throw new Error('Publication reconciliation returned evidence for unexpected transaction IDs.')
  }

  const collectionPublic = network.collection.whatsOnChain.presence === 'present'
  const anchorPublic = network.anchor.whatsOnChain.presence === 'present'
  const walletAccepted = acceptedWalletStatus(statuses.anchor) && acceptedWalletStatus(statuses.collection)
  const indexerOutcome = network.collection.gorillaPool.presence === 'present'
    ? 'indexed'
    : 'not-indexed'

  if (collectionPublic || (anchorPublic && walletAccepted) || walletAccepted) {
    return {
      checkedAt: network.checkedAt,
      outcome: 'accepted',
      message: collectionPublic
        ? 'The exact collection transaction is present on the public network. Publication is accepted and must not be repeated.'
        : 'The wallet reports both exact transactions in its accepted broadcast lifecycle. Publication must not be repeated.',
      anchorActionStatus: statuses.anchor,
      collectionActionStatus: statuses.collection,
      network,
      indexerOutcome,
    }
  }

  const walletFailed = statuses.anchor === 'failed' || statuses.collection === 'failed'
  const everyReaderAbsent = network.allReadersAbsent
  if (walletFailed && everyReaderAbsent) {
    return {
      checkedAt: network.checkedAt,
      outcome: 'rejected',
      message: 'The wallet reports a failed exact transaction and every public reader reports the batch absent. Keep the attempt closed; create a separately reviewed candidate instead of retrying it.',
      anchorActionStatus: statuses.anchor,
      collectionActionStatus: statuses.collection,
      network,
      indexerOutcome,
    }
  }

  return {
    checkedAt: network.checkedAt,
    outcome: 'uncertain',
    message: 'Wallet and public-reader evidence do not yet prove one final outcome. Do not publish or replace this transaction chain.',
    anchorActionStatus: statuses.anchor,
    collectionActionStatus: statuses.collection,
    network,
    indexerOutcome,
  }
}

export async function reconcileCollectionPublication(
  wallet: PublicationReconciliationWallet,
  attempt: CollectionPublicationAttempt,
  fetcher: typeof fetch = fetch,
): Promise<CollectionPublicationReconciliation> {
  const [actions, network] = await Promise.all([
    wallet.listActions({
      labels: [ADINALS_NAMESPACE.actionLabel],
      labelQueryMode: 'all',
      includeLabels: true,
      limit: 100,
    }),
    readCollectionNetworkPreflight(attempt.anchorTxid, attempt.txid, fetcher, attempt.outpoint),
  ])
  const anchor = actions.actions.find((action) => action.txid === attempt.anchorTxid)?.status ?? null
  const collection = actions.actions.find((action) => action.txid === attempt.txid)?.status ?? null
  return classifyPublicationReconciliation(attempt, { anchor, collection }, network)
}
