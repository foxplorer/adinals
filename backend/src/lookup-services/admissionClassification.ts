import { Script, type Transaction } from '@bsv/sdk'
import { inspectAdinalsTransactionOutput } from '../protocol/recordEnvelope.js'
import { updateCandidateErrors, type LifecycleKind } from '../protocol/lifecycleRecords.js'
import {
  decodeOrdLock,
  decodeP2PKH,
  isOrdLockPurchase,
  scriptsEqual
} from '../protocol/scriptTemplates.js'

/**
 * Lifecycle classification that needs no BEEF ancestry.
 *
 * `classifyLifecycleTransition` reads the predecessor's locking script out of
 * `input.sourceTransaction`, which the Topic Manager repairs from the submitted
 * BEEF package before it validates. The atomic BEEF the engine hands the lookup
 * service afterwards is subject-scoped: once a transaction carries its own
 * merkle proof the serializer drops its inputs' source transactions, so every
 * confirmed record arrives here with `sourceTransaction` undefined and the
 * annotation silently never happens. Surveyed against the local node, 93 of 93
 * records had `sourceTXID` and 1 of 93 had `sourceTransaction` — that one being
 * the only record without a block proof.
 *
 * The predecessor's facts are already stored on its own row from its own
 * admission, so the successor is classified by joining to that row instead.
 * Admission is fail closed and ordered — the Topic Manager refuses a topical
 * spend whose predecessor is absent — so the row is guaranteed to exist.
 *
 * This annotates; it does not admit. Admission has already happened upstream,
 * and every reader still verifies the evidence it receives.
 */
export type PredecessorFacts = {
  txid: string
  outputIndex: number
  recordType?: string
  ownerAddress?: string
  priceSatoshis?: number
  /** OrdLock terms retained at the listing's own admission, hex encoded. */
  listingPayoutScript?: string
  listingSuffix?: string
  /** Scope inherited by every successor state on the same chain. */
  collectionId?: string
  adOrigin?: string
}

export type AdmissionClassification = {
  kind: LifecycleKind
  predecessorOutpoint: string
  ownerAddress: string
  collectionId?: string
  adOrigin?: string
}

const hex = (bytes: readonly number[]): string =>
  bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')

const bytesFromHex = (value: string): number[] => {
  const bytes: number[] = []
  for (let index = 0; index + 1 < value.length; index += 2) {
    bytes.push(Number.parseInt(value.slice(index, index + 2), 16))
  }
  return bytes
}

/** Retained so a spend of this listing can be classified without its script. */
export const listingAnnotations = (
  script: Script
): { listingPayoutScript: string; listingSuffix: string } | null => {
  const terms = decodeOrdLock(script)
  return terms
    ? {
      listingPayoutScript: hex(terms.payoutScript),
      listingSuffix: hex(terms.suffix)
    }
    : null
}

/** Input 0's outpoint, which needs no ancestry at all. */
export const predecessorOutpointOf = (tx: Transaction): string => {
  const input = tx.inputs[0]
  const txid = input?.sourceTXID ?? input?.sourceTransaction?.id('hex')
  return txid && input ? `${txid}_${input.sourceOutputIndex}` : ''
}

const spendsPredecessor = (tx: Transaction, predecessor: PredecessorFacts): boolean =>
  predecessorOutpointOf(tx) === `${predecessor.txid}_${predecessor.outputIndex}`

export const classifyAgainstPredecessor = (
  tx: Transaction,
  predecessor: PredecessorFacts
): AdmissionClassification | null => {
  if (!spendsPredecessor(tx, predecessor)) return null
  const input = tx.inputs[0]
  const successor = tx.outputs[0]
  if (!input || !successor || successor.satoshis !== 1) return null

  const predecessorOutpoint = `${predecessor.txid}_${predecessor.outputIndex}`
  const scope = {
    ...(predecessor.collectionId === undefined ? {} : { collectionId: predecessor.collectionId }),
    ...(predecessor.adOrigin === undefined ? {} : { adOrigin: predecessor.adOrigin })
  }
  const successorOwner = decodeP2PKH(successor.lockingScript)

  if (predecessor.recordType === 'listing') {
    if (
      !successorOwner ||
      !input.unlockingScript ||
      !predecessor.ownerAddress ||
      predecessor.priceSatoshis === undefined ||
      predecessor.listingPayoutScript === undefined ||
      predecessor.listingSuffix === undefined
    ) return null

    const terms = {
      seller: predecessor.ownerAddress,
      priceSatoshis: predecessor.priceSatoshis,
      payoutScript: bytesFromHex(predecessor.listingPayoutScript),
      suffix: bytesFromHex(predecessor.listingSuffix)
    }

    if (isOrdLockPurchase(input.unlockingScript, terms)) {
      const payout = tx.outputs[1]
      if (
        !payout ||
        payout.satoshis !== terms.priceSatoshis ||
        !scriptsEqual(payout.lockingScript, Script.fromBinary(terms.payoutScript))
      ) return null
      return {
        kind: 'purchase',
        predecessorOutpoint,
        ownerAddress: successorOwner.address,
        ...scope
      }
    }

    if (successorOwner.address !== terms.seller) return null
    return {
      kind: 'cancellation',
      predecessorOutpoint,
      ownerAddress: successorOwner.address,
      ...scope
    }
  }

  const priorOwner = predecessor.ownerAddress
  if (!priorOwner) return null

  const listing = decodeOrdLock(successor.lockingScript)
  if (listing) {
    if (listing.seller !== priorOwner) return null
    return { kind: 'listing', predecessorOutpoint, ownerAddress: priorOwner, ...scope }
  }

  if (!successorOwner) return null

  const update = inspectAdinalsTransactionOutput(tx, 1)
  if (
    update.subType === 'adUpdate' &&
    updateCandidateErrors(update).length === 0 &&
    successorOwner.address === priorOwner &&
    update.signerAddress === priorOwner &&
    (update.map as Record<string, string>).adOutpoint === predecessorOutpoint
  ) {
    return { kind: 'update', predecessorOutpoint, ownerAddress: priorOwner, ...scope }
  }

  return {
    kind: 'transfer',
    predecessorOutpoint,
    ownerAddress: successorOwner.address,
    ...scope
  }
}

/** The collection and ad an immutable record names in its own MAP envelope. */
export const recordScope = (
  recordType: string | undefined,
  outpoint: string,
  map: Record<string, string> | undefined
): { collectionId?: string; adOrigin?: string } => {
  if (!map) return {}
  if (recordType === 'collection') return { collectionId: outpoint }
  if (recordType === 'collectionItem') {
    try {
      const data = JSON.parse(map.subTypeData ?? '') as { collectionId?: unknown }
      return typeof data.collectionId === 'string'
        ? { collectionId: data.collectionId, adOrigin: outpoint }
        : { adOrigin: outpoint }
    } catch {
      return { adOrigin: outpoint }
    }
  }
  if (recordType === 'adUpdate' || recordType === 'adDecision') {
    return {
      ...(typeof map.collectionId === 'string' ? { collectionId: map.collectionId } : {}),
      ...(typeof map.adOrigin === 'string' ? { adOrigin: map.adOrigin } : {})
    }
  }
  return {}
}
