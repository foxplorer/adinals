import { Transaction } from '@bsv/sdk'
import {
  buyAdinal,
  cancelAdinalListing,
  createAdinal,
  decideAdinal,
  listAdinal,
  updateAdinal,
  type AdinalsNoSendAction,
} from '../actions/lifecycle.ts'
import { createAdinalsCollection } from '../actions/index.ts'
import {
  publishLifecycleAction,
  readLifecyclePublicationPreflight,
} from '../actions/publishLifecycle.ts'
import { publishRecoveredCollection } from '../actions/publishCollection.ts'
import { recoverNoSendCollection } from '../actions/recovery.ts'
import {
  COLLECTION_PUBLISH_ENABLED,
  LIFECYCLE_PUBLISH_ENABLED,
} from '../config/environment.ts'
import { saveLifecyclePublicationAttempt } from '../fixtures/lifecyclePublicationStore.ts'
import {
  loadStoredLifecycleProof,
  saveLifecycleRehearsal,
} from '../fixtures/lifecycleStore.ts'
import { saveCollectionPublicationAttempt } from '../fixtures/publicationStore.ts'
import { saveCollectionRehearsal } from '../fixtures/rehearsalStore.ts'
import { readCollectionNetworkPreflight } from '../readers/networkStatus.ts'
import { parseGorillaPoolTransactionProof } from '../readers/rawTransactions.ts'
import type { OwnedCustodyOutput } from '../readers/custodyRouting.ts'
import type { OverlaySubmissionStatus } from '../overlay/submissionQueue.ts'
import {
  productOwnershipEffect,
  rememberOwnedAd,
  normalizedOutpoint as normalized,
  type LabKeys,
} from './productOwnership.ts'

export {
  createConnectedLabKeys,
  ownsAd,
  ownsCollection,
  ownsListing,
  type LabKeys,
} from './productOwnership.ts'

export type InscriptionContent = { data: Uint8Array; type: string }

export type LabWriteResult = {
  txid?: string
  outpoint?: string
  stateOutpoint?: string
  broadcastStatus?: 'accepted' | 'uncertain'
  error?: string
  rawtx?: string
  overlayStatus?: OverlaySubmissionStatus
}

const publicationResult = (
  action: AdinalsNoSendAction,
  outcome: 'accepted' | 'uncertain',
  overlayStatus?: OverlaySubmissionStatus,
): LabWriteResult => ({
  txid: action.txid,
  outpoint: action.outpoint,
  ...(action.stateOutpoint && { stateOutpoint: action.stateOutpoint }),
  broadcastStatus: outcome,
  rawtx: action.rawtx,
  ...(overlayStatus && { overlayStatus }),
})

async function publishLifecycle(keys: LabKeys, action: AdinalsNoSendAction): Promise<LabWriteResult> {
  await saveLifecycleRehearsal(keys.identityKey, action)
  const preflight = await readLifecyclePublicationPreflight(keys.wallet, action)
  const now = new Date().toISOString()
  const started = {
    format: 'adinals-brc100-lifecycle-publication-v1' as const,
    outpoint: action.outpoint,
    ...(action.stateOutpoint && { stateOutpoint: action.stateOutpoint }),
    identityKey: keys.identityKey,
    kind: action.kind,
    primaryTxid: action.txid,
    txids: preflight.txids,
    startedAt: now,
    updatedAt: now,
    outcome: 'submitting' as const,
    message: 'The exact wallet publication request has started. Do not retry it.',
    sendWithResults: [],
    reviewActionResults: [],
    indexerOutcome: 'not-submitted' as const,
  }
  await saveLifecyclePublicationAttempt(started)
  const result = await publishLifecycleAction(keys.wallet, action, preflight)
  await saveLifecyclePublicationAttempt({
    ...started,
    updatedAt: new Date().toISOString(),
    outcome: result.outcome,
    message: result.message,
    sendWithResults: result.sendWithResults,
    reviewActionResults: result.reviewActionResults,
  })
  if (result.outcome === 'rejected') return { error: result.message, rawtx: action.rawtx }
  return publicationResult(action, result.outcome, result.overlaySubmission?.status)
}

async function rememberOwnedAction(keys: LabKeys, action: AdinalsNoSendAction): Promise<LabWriteResult> {
  const result = await publishLifecycle(keys, action)
  if (!result.txid) return result
  keys.ordAddress = action.ownerAddress
  keys.payAddress = action.ownerAddress
  const ownershipEffect = productOwnershipEffect(action.kind)
  if (ownershipEffect.linkAdOrigin) {
    keys.ownedAdOrigins.add(normalized(action.map?.adOrigin ?? action.outpoint))
  }
  if (ownershipEffect.storeCustodyRoute) {
    keys.outputRoutes.set(normalized(action.stateOutpoint ?? action.outpoint), {
      kind: action.kind === 'mint' ? 'mint' : action.kind === 'listing' ? 'listing' : 'state',
      outpoint: action.stateOutpoint ?? action.outpoint,
      walletOutpoint: (action.stateOutpoint ?? action.outpoint).replace('_', '.'),
      txid: action.txid,
      vout: Number((action.stateOutpoint ?? action.outpoint).split('_')[1] ?? 0),
      satoshis: 1,
      ownerKeyID: action.ownerKeyID,
      signerKeyID: action.signerKeyID ?? '',
      derivedOwner: action.ownerAddress,
      scriptOwner: action.ownerAddress,
      signer: action.verification?.signerAddress ?? action.ownerAddress,
      map: action.map ?? null,
      sigmaSource: action.anchorOutpoint ?? '',
      stateOutpoint: action.stateOutpoint ?? '',
      recordOutpoint: action.kind === 'update' ? action.outpoint : '',
      listing: null,
      spendable: true,
      tags: [],
      atomicBeef: action.atomicBeef,
      errors: [],
      verified: true,
    })
  }
  if (action.kind === 'listing') keys.ownedListings.add(normalized(action.outpoint))
  if (action.kind === 'cancel' || action.kind === 'purchase') keys.ownedListings.delete(normalized(action.outpoint))
  return result
}

export async function createCollection(
  keys: LabKeys,
  collection: {
    name: string
    description: string
    max: number
    approval: 'creator' | 'open'
    contentPolicy: 'family-friendly' | 'unspecified'
    format: 'text' | 'image'
    maxChars: number
    placement: string
    expiresAt?: string
    cover?: InscriptionContent
  },
): Promise<LabWriteResult> {
  if (!COLLECTION_PUBLISH_ENABLED) return { error: 'Collection publication is disabled in this build.' }
  try {
    const rehearsal = await createAdinalsCollection(keys.wallet, {
      name: collection.name,
      description: collection.description,
      maxSupply: collection.max,
      approval: collection.approval,
      contentPolicy: collection.contentPolicy,
      format: collection.format,
      maxChars: collection.maxChars,
      placement: collection.placement,
      expiresAt: collection.expiresAt,
      cover: collection.cover,
    }, { basket: keys.basket })
    await saveCollectionRehearsal(keys.identityKey, rehearsal)
    const audit = await recoverNoSendCollection(keys.wallet, keys.basket, rehearsal.outpoint)
    if (!audit.candidate?.valid) throw new Error(audit.candidate?.errors.join('; ') || 'Wallet recovery could not verify the collection.')
    const preflight = await readCollectionNetworkPreflight(
      rehearsal.anchorTxid,
      rehearsal.txid,
      fetch,
      rehearsal.outpoint,
    )
    const now = new Date().toISOString()
    const started = {
      format: 'adinals-brc100-publication-attempt-v1' as const,
      outpoint: rehearsal.outpoint,
      identityKey: keys.identityKey,
      txid: rehearsal.txid,
      anchorTxid: rehearsal.anchorTxid,
      startedAt: now,
      updatedAt: now,
      outcome: 'submitting' as const,
      message: 'The exact wallet publication request has started. Do not retry it.',
      sendWithResults: [],
      reviewActionResults: [],
      indexerOutcome: 'not-submitted' as const,
    }
    await saveCollectionPublicationAttempt(started)
    const result = await publishRecoveredCollection(keys.wallet, audit.candidate, preflight)
    await saveCollectionPublicationAttempt({
      ...started,
      updatedAt: new Date().toISOString(),
      outcome: result.outcome,
      message: result.message,
      sendWithResults: result.sendWithResults,
      reviewActionResults: result.reviewActionResults,
    })
    if (result.outcome === 'rejected') return { error: result.message, rawtx: rehearsal.rawtx }
    keys.collectionRoutes.set(normalized(rehearsal.outpoint), {
      keyID: rehearsal.keyID,
      address: rehearsal.ownerAddress,
    })
    keys.ordAddress = rehearsal.ownerAddress
    keys.payAddress = rehearsal.ownerAddress
    return {
      txid: rehearsal.txid,
      outpoint: rehearsal.outpoint,
      broadcastStatus: result.outcome,
      rawtx: rehearsal.rawtx,
      ...(result.overlaySubmission && { overlayStatus: result.overlaySubmission.status }),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export async function mintAd(
  keys: LabKeys,
  ad: {
    collectionId: string
    name: string
    serial: number
    url?: string
    format: 'text' | 'image'
    text?: string
    maxChars?: number
    image?: { data: Uint8Array; type: string }
  },
): Promise<LabWriteResult> {
  if (!LIFECYCLE_PUBLISH_ENABLED) return { error: 'Lifecycle publication is disabled in this build.' }
  const creator = keys.collectionRoutes.get(normalized(ad.collectionId))
  if (!creator) return { error: 'Connect the BRC-100 wallet that owns this collection.' }
  try {
    const action = await createAdinal(keys.wallet, {
      collectionId: ad.collectionId,
      creatorKeyID: creator.keyID,
      creatorAddress: creator.address,
      name: ad.name,
      serial: ad.serial,
      format: ad.format,
      text: ad.text,
      maxChars: ad.maxChars,
      image: ad.image,
      url: ad.url,
    }, { basket: keys.basket })
    return rememberOwnedAction(keys, action)
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

const routeFor = (keys: LabKeys, outpoint: string): OwnedCustodyOutput | null =>
  keys.outputRoutes.get(normalized(outpoint)) ?? null

export async function publishUpdate(
  keys: LabKeys,
  update: {
    collectionId: string
    adOrigin: string
    adOutpoint: string
    ownerEpoch: string
    url?: string
    format: 'text' | 'image'
    text?: string
    maxChars?: number
    image?: { data: Uint8Array; type: string }
  },
): Promise<LabWriteResult> {
  if (!LIFECYCLE_PUBLISH_ENABLED) return { error: 'Lifecycle publication is disabled in this build.' }
  const route = routeFor(keys, update.adOutpoint)
  if (!route) return { error: 'The connected wallet does not hold the current Adinal output.' }
  try {
    return rememberOwnedAction(keys, await updateAdinal(keys.wallet, {
      ...update,
      atomicBeef: route.atomicBeef,
      ownerKeyID: route.ownerKeyID,
    }, { basket: keys.basket }))
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export async function decideUpdate(
  keys: LabKeys,
  decision: {
    collectionId: string
    adOrigin: string
    updateOutpoint: string
    adOutpoint: string
    ownerEpoch: string
    verdict: 'approved' | 'disapproved'
    reasonCode: string
  },
): Promise<LabWriteResult> {
  if (!LIFECYCLE_PUBLISH_ENABLED) return { error: 'Lifecycle publication is disabled in this build.' }
  const creator = keys.collectionRoutes.get(normalized(decision.collectionId))
  if (!creator) return { error: 'The connected wallet does not own this collection.' }
  try {
    return publishLifecycle(keys, await decideAdinal(keys.wallet, {
      ...decision,
      creatorKeyID: creator.keyID,
      creatorAddress: creator.address,
    }, { basket: keys.basket }))
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export async function listAdForSale(
  keys: LabKeys,
  options: { adOutpoint: string; priceSatoshis: number },
): Promise<LabWriteResult> {
  if (!LIFECYCLE_PUBLISH_ENABLED) return { error: 'Lifecycle publication is disabled in this build.' }
  const route = routeFor(keys, options.adOutpoint)
  if (!route) return { error: 'The connected wallet does not hold this Adinal.' }
  try {
    return rememberOwnedAction(keys, await listAdinal(keys.wallet, {
      ...options,
      atomicBeef: route.atomicBeef,
      ownerKeyID: route.ownerKeyID,
    }, { basket: keys.basket }))
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export async function cancelAdListing(
  keys: LabKeys,
  options: { listingOutpoint: string },
): Promise<LabWriteResult> {
  if (!LIFECYCLE_PUBLISH_ENABLED) return { error: 'Lifecycle publication is disabled in this build.' }
  const route = routeFor(keys, options.listingOutpoint)
  if (!route) return { error: 'The connected wallet does not hold this listing.' }
  try {
    return rememberOwnedAction(keys, await cancelAdinalListing(keys.wallet, {
      ...options,
      atomicBeef: route.atomicBeef,
      ownerKeyID: route.ownerKeyID,
    }, { basket: keys.basket }))
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

async function publicListingBeef(outpoint: string): Promise<number[]> {
  const exactOutpoint = normalized(outpoint)
  const [txid, voutText] = exactOutpoint.split('_') as [string, string]
  const vout = Number(voutText)
  try {
    const stored = await loadStoredLifecycleProof(exactOutpoint)
    if (stored?.kind === 'listing' && normalized(stored.outpoint) === exactOutpoint) {
      const transaction = Transaction.fromAtomicBEEF(stored.atomicBeef)
      if (transaction.id('hex') !== txid) throw new Error('Stored listing proof failed its txid check.')
      if (!transaction.outputs[vout]) throw new Error('Stored listing proof does not contain the requested output.')
      return stored.atomicBeef
    }
  } catch {
    // A damaged or unavailable browser snapshot is never trusted. Continue to
    // the independently verified public proof source for cross-device buyers.
  }

  const response = await fetch(`https://ordinals.gorillapool.io/api/tx/${txid}`, {
    headers: { Accept: 'application/octet-stream' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    throw new Error(`The listing proof package is still propagating (${response.status}). No purchase transaction was created.`)
  }
  const transaction = parseGorillaPoolTransactionProof(
    new Uint8Array(await response.arrayBuffer()),
  )
  if (transaction.id('hex') !== txid) throw new Error('The listing proof package failed its txid check.')
  if (!transaction.outputs[vout]) throw new Error('The listing proof package does not contain the requested output.')
  return transaction.toAtomicBEEF()
}

export async function buyAd(
  keys: LabKeys,
  options: { listingOutpoint: string; adOrigin: string; expiresAt: string },
): Promise<LabWriteResult> {
  if (!LIFECYCLE_PUBLISH_ENABLED) return { error: 'Lifecycle publication is disabled in this build.' }
  try {
    const action = await buyAdinal(keys.wallet, {
      listingOutpoint: options.listingOutpoint,
      atomicBeef: await publicListingBeef(options.listingOutpoint),
      expiresAt: options.expiresAt,
    }, { basket: keys.basket })
    const result = await rememberOwnedAction(keys, action)
    if (result.txid) {
      rememberOwnedAd(keys, options.adOrigin, result.outpoint ?? `${result.txid}_0`)
    }
    return result
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
