import type { ActionStatus, WalletInterface } from '@bsv/sdk'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import type { AdinalsNoSendAction } from './lifecycle.ts'
import {
  classifyPublicationError,
  classifyPublicationResponse,
  type CollectionPublicationResult,
} from './publishCollection.ts'
import {
  readTransactionNetworkStatus,
  type TransactionNetworkStatus,
} from '../readers/networkStatus.ts'

export type LifecyclePublicationWallet = Pick<WalletInterface, 'createAction' | 'listActions'>

export type LifecyclePublicationPreflight = {
  checkedAt: string
  txids: string[]
  walletStatuses: Record<string, ActionStatus | null>
  network: TransactionNetworkStatus[]
  allReadersAbsent: boolean
}

const PREFLIGHT_MAX_AGE_MS = 2 * 60 * 1000

export function lifecyclePublicationTxids(action: AdinalsNoSendAction): string[] {
  if (action.kind === 'mint' || action.kind === 'decision') {
    if (!action.anchorTxid) throw new Error(`The ${action.kind} is missing its retained SIGMA anchor.`)
    return [action.anchorTxid, action.txid]
  }
  if (action.kind === 'update' || action.kind === 'listing' || action.kind === 'purchase' || action.kind === 'cancel') {
    return [action.txid]
  }
  throw new Error('This lifecycle action cannot be published.')
}

export function validateLifecyclePublicationReadiness(
  action: AdinalsNoSendAction,
  preflight: LifecyclePublicationPreflight,
  now = new Date(),
): void {
  if (action.broadcast || action.status !== 'rehearsed') throw new Error('Only a retained no-send rehearsal can be published.')
  const expected = lifecyclePublicationTxids(action)
  if (preflight.txids.length !== expected.length || expected.some((txid, index) => preflight.txids[index] !== txid)) {
    throw new Error('The publication preflight does not describe this exact transaction batch.')
  }
  if (expected.some((txid) => preflight.walletStatuses[txid] !== 'nosend')) {
    throw new Error('Every exact wallet action must still report nosend before publication.')
  }
  if (preflight.network.length !== expected.length || expected.some((txid, index) => preflight.network[index]?.txid !== txid)) {
    throw new Error('The network preflight returned evidence for unexpected transaction IDs.')
  }
  if (!preflight.allReadersAbsent) {
    const evidence = preflight.network.map((entry) =>
      `${entry.txid.slice(0, 8)}: WhatsOnChain ${entry.whatsOnChain.presence} (${entry.whatsOnChain.detail}); GorillaPool ${entry.gorillaPool.presence} (${entry.gorillaPool.detail})`,
    ).join(' | ')
    throw new Error(`Every configured public reader must report the exact batch absent before first publication. ${evidence}`)
  }
  const checkedAt = Date.parse(preflight.checkedAt)
  if (!Number.isFinite(checkedAt) || now.getTime() - checkedAt > PREFLIGHT_MAX_AGE_MS || checkedAt > now.getTime() + 5_000) {
    throw new Error('The lifecycle publication preflight is stale. Check readiness again.')
  }
}

export async function readLifecyclePublicationPreflight(
  wallet: Pick<WalletInterface, 'listActions'>,
  action: AdinalsNoSendAction,
  fetcher: typeof fetch = fetch,
): Promise<LifecyclePublicationPreflight> {
  const txids = lifecyclePublicationTxids(action)
  const [actions, network] = await Promise.all([
    wallet.listActions({
      labels: [ADINALS_NAMESPACE.actionLabel],
      labelQueryMode: 'all',
      includeLabels: true,
      limit: 100,
    }),
    Promise.all(txids.map((txid) => readTransactionNetworkStatus(
      txid,
      fetcher,
      txid === action.txid ? action.outpoint : undefined,
    ))),
  ])
  const walletStatuses = Object.fromEntries(txids.map((txid) => [
    txid,
    actions.actions.find((actionRecord) => actionRecord.txid === txid)?.status ?? null,
  ]))
  const statuses = network.flatMap((transaction) => [transaction.whatsOnChain, transaction.gorillaPool])
  return {
    checkedAt: new Date().toISOString(),
    txids,
    walletStatuses,
    network,
    allReadersAbsent: statuses.every((status) => status.presence === 'absent'),
  }
}

export async function publishLifecycleAction(
  wallet: Pick<WalletInterface, 'createAction'>,
  action: AdinalsNoSendAction,
  preflight: LifecyclePublicationPreflight,
): Promise<CollectionPublicationResult> {
  validateLifecyclePublicationReadiness(action, preflight)
  const txids = lifecyclePublicationTxids(action)
  try {
    const response = await wallet.createAction({
      description: `Publish verified Adinals ${action.kind}`,
      labels: [ADINALS_NAMESPACE.actionLabel],
      options: {
        acceptDelayedBroadcast: false,
        returnTXIDOnly: true,
        sendWith: txids,
      },
    })
    return classifyPublicationResponse(txids, response)
  } catch (error) {
    return classifyPublicationError(error)
  }
}
