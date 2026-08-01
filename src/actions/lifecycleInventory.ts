import type { ActionStatus, WalletAction, WalletInterface } from '@bsv/sdk'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import type { AdinalsNoSendAction } from './lifecycle.ts'

export type LifecycleInventoryWallet = Pick<WalletInterface, 'listActions' | 'abortAction'>

export type LifecycleInventoryAction = {
  txid: string
  status: ActionStatus
  description: string
  kind: AdinalsNoSendAction['kind'] | 'anchor' | 'other'
  sourceOutpoints: string[]
}

export type LifecycleInventoryPair = {
  child: LifecycleInventoryAction
  anchor: LifecycleInventoryAction | null
}

export type LifecycleInventory = {
  checkedAt: string
  pairs: LifecycleInventoryPair[]
  unpairedAnchors: LifecycleInventoryAction[]
  otherActions: LifecycleInventoryAction[]
}

const kindFromDescription = (description: string): LifecycleInventoryAction['kind'] => {
  if (
    description === 'Prepare Adinals mint anchor'
    || description === 'Prepare Adinals decision anchor'
    || description.startsWith('Prepare Adinals mint fee reserve')
    || description.startsWith('Prepare Adinals decision fee reserve')
  ) return 'anchor'
  if (description === 'Rehearse Adinals ad mint') return 'mint'
  if (description === 'Rehearse Adinals owner update') return 'update'
  if (description === 'Rehearse Adinals decision') return 'decision'
  if (description === 'Rehearse Adinals listing') return 'listing'
  if (description === 'Rehearse Adinals purchase') return 'purchase'
  return 'other'
}

const normalizeOutpoint = (outpoint: string): string => outpoint.replace(/_(\d+)$/, '.$1').toLowerCase()

export function classifyLifecycleActions(actions: WalletAction[], now = new Date()): LifecycleInventory {
  const summarized = actions.map((action): LifecycleInventoryAction => ({
    txid: action.txid.toLowerCase(),
    status: action.status,
    description: action.description,
    kind: kindFromDescription(action.description),
    sourceOutpoints: (action.inputs ?? []).map((input) => normalizeOutpoint(input.sourceOutpoint)),
  }))
  const anchors = summarized.filter((action) => action.kind === 'anchor')
  const children = summarized.filter((action) => action.kind !== 'anchor' && action.kind !== 'other')
  const pairedAnchorTxids = new Set<string>()
  const pairs = children.map((child): LifecycleInventoryPair => {
    const anchor = anchors.find((candidate) => child.sourceOutpoints.includes(`${candidate.txid}.0`)) ?? null
    if (anchor) pairedAnchorTxids.add(anchor.txid)
    return { child, anchor }
  })
  return {
    checkedAt: now.toISOString(),
    pairs,
    unpairedAnchors: anchors.filter((anchor) => !pairedAnchorTxids.has(anchor.txid)),
    otherActions: summarized.filter((action) => action.kind === 'other'),
  }
}

/** Read-only: this requests labeled wallet history and never mutates an action. */
export async function inventoryNoSendLifecycle(wallet: LifecycleInventoryWallet): Promise<LifecycleInventory> {
  const result = await wallet.listActions({
    labels: [ADINALS_NAMESPACE.actionLabel],
    labelQueryMode: 'all',
    includeLabels: true,
    includeInputs: true,
    includeOutputs: true,
    limit: 100,
  })
  return classifyLifecycleActions(result.actions)
}

export type AbortLifecycleResult = {
  childAborted: boolean
  anchorAborted: boolean | null
}

/**
 * Releases one exact browser-retained no-send rehearsal. The child is always
 * aborted before its optional anchor. Opaque references are never inferred
 * from txids and are deliberately excluded from exported fixtures.
 */
export async function abortLifecycleRehearsal(
  wallet: LifecycleInventoryWallet,
  action: AdinalsNoSendAction,
): Promise<AbortLifecycleResult> {
  if (action.broadcast || action.status !== 'rehearsed') throw new Error('Only a no-send rehearsal can be released.')
  if (!action.actionReference) {
    throw new Error('This older candidate has no retained wallet abort reference. Use the wallet’s own action-management UI if it offers one.')
  }
  const child = await wallet.abortAction({ reference: action.actionReference })
  if (!child.aborted) throw new Error('The wallet retained the child action; its anchor was not touched.')
  if (!action.anchorReference) return { childAborted: true, anchorAborted: null }
  const anchor = await wallet.abortAction({ reference: action.anchorReference })
  return { childAborted: true, anchorAborted: anchor.aborted }
}
