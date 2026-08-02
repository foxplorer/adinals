import type {
  CreateActionResult,
  ReviewActionResult,
  SendWithResult,
  WalletInterface,
} from '@bsv/sdk'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import type { RecoveredCollectionCandidate } from './recovery.ts'
import type { CollectionNetworkPreflight } from '../readers/networkStatus.ts'
import {
  enqueueOverlaySubmission,
  type OverlayDeliveryOptions,
  type OverlaySubmission,
} from '../overlay/submissionQueue.ts'

export type PublicationWallet = Pick<WalletInterface, 'createAction'>

export type CollectionPublicationResult = {
  outcome: 'accepted' | 'uncertain' | 'rejected'
  message: string
  sendWithResults: SendWithResult[]
  reviewActionResults: ReviewActionResult[]
  overlaySubmission: OverlaySubmission | null
}

const PREFLIGHT_MAX_AGE_MS = 2 * 60 * 1000

const sameTxids = (actual: string[], expected: string[]): boolean =>
  actual.length === expected.length && expected.every((txid) => actual.includes(txid))

export function validatePublicationReadiness(
  candidate: RecoveredCollectionCandidate,
  preflight: CollectionNetworkPreflight,
  now = new Date(),
): void {
  if (!candidate.valid) throw new Error('The recovered collection is not byte-valid.')
  if (candidate.actionStatus !== 'nosend' || candidate.anchorActionStatus !== 'nosend') {
    throw new Error('Both wallet actions must still report nosend before publication.')
  }
  if (preflight.collection.txid !== candidate.txid || preflight.anchor.txid !== candidate.anchorTxid) {
    throw new Error('The public-reader preflight does not describe this exact anchor and collection.')
  }
  if (!preflight.allReadersAbsent) {
    throw new Error('Every configured public reader must report both transactions absent before first publication.')
  }
  const checkedAt = Date.parse(preflight.checkedAt)
  if (!Number.isFinite(checkedAt) || now.getTime() - checkedAt > PREFLIGHT_MAX_AGE_MS || checkedAt > now.getTime() + 5_000) {
    throw new Error('The public-reader preflight is stale. Check public network status again.')
  }
}

const errorArrays = (error: unknown): {
  reviewActionResults: ReviewActionResult[]
  sendWithResults: SendWithResult[]
} => {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  return {
    reviewActionResults: Array.isArray(value.reviewActionResults)
      ? value.reviewActionResults as ReviewActionResult[]
      : [],
    sendWithResults: Array.isArray(value.sendWithResults)
      ? value.sendWithResults as SendWithResult[]
      : [],
  }
}

export function classifyPublicationResponse(
  expectedTxids: string[],
  response: Pick<CreateActionResult, 'sendWithResults'>,
): CollectionPublicationResult {
  const sendWithResults = response.sendWithResults ?? []
  const resultTxids = sendWithResults.map((result) => result.txid)
  if (!sameTxids(resultTxids, expectedTxids)) {
    return {
      outcome: 'uncertain',
      message: 'The wallet did not return statuses for the exact publication batch. Reconcile these txids before any retry.',
      sendWithResults,
      reviewActionResults: [],
      overlaySubmission: null,
    }
  }
  if (sendWithResults.some((result) => result.status === 'failed')) {
    return {
      outcome: 'rejected',
      message: 'The wallet reported a failed transaction in the publication batch. Do not retry until reconciled.',
      sendWithResults,
      reviewActionResults: [],
      overlaySubmission: null,
    }
  }
  if (sendWithResults.some((result) => result.status === 'sending')) {
    return {
      outcome: 'uncertain',
      message: 'The wallet is still sending the publication batch. Do not submit another batch.',
      sendWithResults,
      reviewActionResults: [],
      overlaySubmission: null,
    }
  }
  return {
    outcome: 'accepted',
    message: 'The wallet accepted the exact transaction batch into its broadcast lifecycle.',
    sendWithResults,
    reviewActionResults: [],
    overlaySubmission: null,
  }
}

export function classifyPublicationError(error: unknown): CollectionPublicationResult {
  const { reviewActionResults, sendWithResults } = errorArrays(error)
  if (reviewActionResults.some((result) => result.status === 'doubleSpend' || result.status === 'invalidTx')) {
    return {
      outcome: 'rejected',
      message: 'The wallet reported an invalid or double-spent transaction. Do not retry this chain.',
      sendWithResults,
      reviewActionResults,
      overlaySubmission: null,
    }
  }
  if (reviewActionResults.length > 0 && reviewActionResults.every((result) => result.status === 'success')) {
    return {
      outcome: 'accepted',
      message: 'The wallet review results report successful network acceptance.',
      sendWithResults,
      reviewActionResults,
      overlaySubmission: null,
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return {
    outcome: 'uncertain',
    message: `${message} The exact txids must be reconciled before any retry.`,
    sendWithResults,
    reviewActionResults,
    overlaySubmission: null,
  }
}

export async function queueCollectionForOverlay(
  candidate: RecoveredCollectionCandidate,
  options: OverlayDeliveryOptions = {},
): Promise<OverlaySubmission | null> {
  return enqueueOverlaySubmission({
    txid: candidate.txid,
    outpoints: [candidate.outpoint],
    atomicBeef: candidate.atomicBeef,
  }, options).catch(() => null)
}

export async function publishRecoveredCollection(
  wallet: PublicationWallet,
  candidate: RecoveredCollectionCandidate,
  preflight: CollectionNetworkPreflight,
  overlayOptions: OverlayDeliveryOptions = {},
): Promise<CollectionPublicationResult> {
  validatePublicationReadiness(candidate, preflight)
  const txids = [candidate.anchorTxid, candidate.txid]
  try {
    const response = await wallet.createAction({
      description: 'Publish verified Adinals collection',
      labels: [ADINALS_NAMESPACE.actionLabel],
      options: {
        acceptDelayedBroadcast: false,
        returnTXIDOnly: true,
        sendWith: txids,
      },
    })
    const result = classifyPublicationResponse(txids, response)
    return result.outcome === 'accepted'
      ? { ...result, overlaySubmission: await queueCollectionForOverlay(candidate, overlayOptions) }
      : result
  } catch (error) {
    const result = classifyPublicationError(error)
    return result.outcome === 'accepted'
      ? { ...result, overlaySubmission: await queueCollectionForOverlay(candidate, overlayOptions) }
      : result
  }
}
