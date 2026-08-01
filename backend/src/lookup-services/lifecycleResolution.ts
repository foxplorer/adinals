import { Script, Transaction } from '@bsv/sdk'
import type { AdmittedOutputRecord } from './AdinalsStorage.js'
import { resolveMintWinners } from './mintResolution.js'
import {
  decodeOrdLock,
  isOrdLockPurchase,
  scriptsEqual
} from '../protocol/scriptTemplates.js'

const outpoint = (record: Pick<AdmittedOutputRecord, 'txid' | 'outputIndex'>): string =>
  `${record.txid}_${record.outputIndex}`

const parseObject = (value: string | undefined): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(value ?? '')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

const inputZeroSpends = (
  transaction: Transaction,
  predecessor: AdmittedOutputRecord
): boolean => {
  const input = transaction.inputs[0]
  return Boolean(input) &&
    (input.sourceTXID ?? input.sourceTransaction?.id('hex')) === predecessor.txid &&
    input.sourceOutputIndex === predecessor.outputIndex
}

const creativeMatchesCollection = (
  update: AdmittedOutputRecord,
  collection: AdmittedOutputRecord
): boolean => {
  const map = update.map
  const rules = collection.map
  if (!map || !rules || map.adFormat !== rules.adFormat) return false
  if (map.adFormat === 'text') {
    const maximum = Number(rules.adMaxChars)
    return Number.isSafeInteger(maximum) && maximum > 0 &&
      Boolean(map.adText?.trim()) && [...map.adText].length <= maximum
  }
  return rules.adImageProfile === 'image-2x1-v1'
}

export type ResolvedAdHistory = {
  collection: AdmittedOutputRecord
  mint: AdmittedOutputRecord
  states: AdmittedOutputRecord[]
  updates: AdmittedOutputRecord[]
  decisions: AdmittedOutputRecord[]
  decisionUpdateOutpoints: string[]
  current: AdmittedOutputRecord
  currentOwner: string
  ownerEpoch: string
  evidence: AdmittedOutputRecord[]
}

export type ResolvedAdCurrent = {
  history: ResolvedAdHistory
  creative: AdmittedOutputRecord
  decision: AdmittedOutputRecord | null
  displayEligible: boolean
  evidence: AdmittedOutputRecord[]
}

type UpdateContext = {
  update: AdmittedOutputRecord
  successor: AdmittedOutputRecord
  ownerEpoch: string
}

/** Resolves one immutable Adinal origin without trusting candidate arrival order. */
export const resolveAdHistory = (
  records: readonly AdmittedOutputRecord[],
  origin: string
): ResolvedAdHistory | null => {
  const mint = resolveMintWinners(records).find((candidate) => outpoint(candidate) === origin)
  if (!mint?.map || !mint.signerAddress || !mint.ownerAddress) return null
  const mintData = parseObject(mint.map.subTypeData)
  const collectionId = typeof mintData?.collectionId === 'string'
    ? mintData.collectionId
    : ''
  const collection = records.find((candidate) =>
    candidate.recordType === 'collection' && outpoint(candidate) === collectionId
  )
  if (!collection?.map || !collection.signerAddress) return null

  const states: AdmittedOutputRecord[] = [mint]
  const updates: AdmittedOutputRecord[] = []
  const updateContexts = new Map<string, UpdateContext>()
  let current = mint
  let currentOwner = mint.ownerAddress
  let ownerEpoch = origin
  const visited = new Set<string>()

  while (current.spentByTxid && !visited.has(outpoint(current))) {
    visited.add(outpoint(current))
    const successor = records.find((candidate) =>
      candidate.txid === current.spentByTxid &&
      candidate.outputIndex === 0 &&
      (candidate.recordType === 'state' || candidate.recordType === 'listing')
    )
    if (!successor) break

    let spending: Transaction
    try {
      spending = Transaction.fromBEEF(successor.atomicBEEF)
    } catch {
      break
    }
    if (!inputZeroSpends(spending, current)) break

    const successorOrigin = outpoint(successor)
    if (successor.recordType === 'listing') {
      if (!successor.ownerAddress || successor.ownerAddress !== currentOwner) break
    } else if (current.recordType === 'listing') {
      let listingTx: Transaction
      try {
        listingTx = Transaction.fromBEEF(current.atomicBEEF)
      } catch {
        break
      }
      const listingOutput = listingTx.outputs[current.outputIndex]
      const terms = listingOutput ? decodeOrdLock(listingOutput.lockingScript) : null
      const unlockingScript = spending.inputs[0]?.unlockingScript
      if (!terms || !unlockingScript || !successor.ownerAddress) break
      if (isOrdLockPurchase(unlockingScript, terms)) {
        const payout = spending.outputs[1]
        if (
          !payout ||
          payout.satoshis !== terms.priceSatoshis ||
          !scriptsEqual(payout.lockingScript, Script.fromBinary(terms.payoutScript))
        ) break
        currentOwner = successor.ownerAddress
        ownerEpoch = successorOrigin
      } else {
        if (successor.ownerAddress !== terms.seller) break
        currentOwner = successor.ownerAddress
      }
    } else {
      if (!successor.ownerAddress) break
      const update = records.find((candidate) =>
        candidate.txid === successor.txid &&
        candidate.outputIndex === 1 &&
        candidate.recordType === 'adUpdate'
      )
      const map = update?.map
      const validUpdate = Boolean(
        update && map &&
        map.collectionId === collectionId &&
        map.adOrigin === origin &&
        map.adOutpoint === outpoint(current) &&
        map.ownerEpoch === ownerEpoch &&
        map.transition === 'spend-linked-self-v1' &&
        update.signerAddress === currentOwner &&
        successor.ownerAddress === currentOwner &&
        creativeMatchesCollection(update, collection)
      )
      if (validUpdate && update) {
        updates.push(update)
        updateContexts.set(outpoint(update), { update, successor, ownerEpoch })
      } else if (successor.ownerAddress !== currentOwner) {
        currentOwner = successor.ownerAddress
        ownerEpoch = successorOrigin
      }
    }

    states.push(successor)
    current = successor
  }

  const decisionCandidates = records.filter((candidate) => {
    const map = candidate.map
    if (
      candidate.recordType !== 'adDecision' ||
      !map ||
      map.adOrigin !== origin ||
      map.collectionId !== collectionId ||
      candidate.signerAddress !== collection.signerAddress
    ) return false
    const context = updateContexts.get(map.updateOutpoint ?? '')
    if (!context) return false
    return map.revisionOutpoint === map.updateOutpoint &&
      map.transitionTxid === context.update.txid &&
      map.adOutpoint === outpoint(context.successor) &&
      map.ownerEpoch === context.ownerEpoch &&
      (map.decision === 'approved' || map.decision === 'disapproved')
  })

  const decisions: AdmittedOutputRecord[] = []
  const decisionGroups = new Map<string, AdmittedOutputRecord[]>()
  for (const decision of decisionCandidates) {
    const key = decision.map?.updateOutpoint as string
    decisionGroups.set(key, [...(decisionGroups.get(key) ?? []), decision])
  }
  for (const group of decisionGroups.values()) {
    const verdicts = new Set(group.map((decision) => decision.map?.decision))
    if (verdicts.size === 1) decisions.push(...group)
    // Conflicting creator verdicts remain quarantined.
  }

  const decisionUpdateOutpoints = [...decisionGroups.keys()]

  const evidence = [collection, ...states, ...updates, ...decisions]
  return {
    collection,
    mint,
    states,
    updates,
    decisions,
    decisionUpdateOutpoints,
    current,
    currentOwner,
    ownerEpoch,
    evidence
  }
}

const uniqueRecords = (
  records: readonly AdmittedOutputRecord[]
): AdmittedOutputRecord[] => {
  const seen = new Set<string>()
  return records.filter((record) => {
    const key = outpoint(record)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Resolves the creative that is live for the current owner epoch. */
export const resolveAdCurrent = (
  history: ResolvedAdHistory,
  now: Date = new Date()
): ResolvedAdCurrent => {
  const approval = history.collection.map?.adApproval
  const currentEpochUpdates = history.updates.filter(
    (update) => update.map?.ownerEpoch === history.ownerEpoch
  )
  let creative = history.mint
  let decision: AdmittedOutputRecord | null = null

  for (const update of currentEpochUpdates) {
    if (approval === 'open' || update.signerAddress === history.collection.signerAddress) {
      creative = update
      decision = null
      continue
    }
    const approved = history.decisions.find((candidate) =>
      candidate.map?.updateOutpoint === outpoint(update) &&
      candidate.map.decision === 'approved'
    )
    if (approved) {
      creative = update
      decision = approved
    }
  }

  const expiresAt = history.collection.map?.expiresAt
  const expiration = expiresAt ? Date.parse(expiresAt) : Number.POSITIVE_INFINITY
  const displayEligible = Number.isFinite(expiration)
    ? now.getTime() < expiration
    : !expiresAt
  return {
    history,
    creative,
    decision,
    displayEligible,
    evidence: uniqueRecords([
      history.collection,
      ...history.states,
      creative,
      ...(decision ? [decision] : [])
    ])
  }
}

const collectionIdFromMint = (mint: AdmittedOutputRecord): string => {
  const data = parseObject(mint.map?.subTypeData)
  return typeof data?.collectionId === 'string' ? data.collectionId : ''
}

export const resolveCollectionLiveEvidence = (
  records: readonly AdmittedOutputRecord[],
  collectionId: string,
  now: Date = new Date()
): AdmittedOutputRecord[] => {
  const collection = records.find((candidate) =>
    candidate.recordType === 'collection' && outpoint(candidate) === collectionId
  )
  if (!collection) return []
  const evidence: AdmittedOutputRecord[] = [collection]
  for (const mint of resolveMintWinners(records).filter(
    (candidate) => collectionIdFromMint(candidate) === collectionId
  )) {
    const history = resolveAdHistory(records, outpoint(mint))
    if (!history) continue
    const current = resolveAdCurrent(history, now)
    if (current.displayEligible) evidence.push(...current.evidence)
  }
  return uniqueRecords(evidence)
}

export const resolvePendingDecisionEvidence = (
  records: readonly AdmittedOutputRecord[],
  creator: string,
  now: Date = new Date()
): AdmittedOutputRecord[] => {
  const evidence: AdmittedOutputRecord[] = []
  for (const mint of resolveMintWinners(records)) {
    const history = resolveAdHistory(records, outpoint(mint))
    if (
      !history ||
      history.collection.signerAddress !== creator ||
      history.collection.map?.adApproval !== 'creator' ||
      !resolveAdCurrent(history, now).displayEligible
    ) continue
    for (const update of history.updates) {
      const updateOutpoint = outpoint(update)
      if (
        update.map?.ownerEpoch !== history.ownerEpoch ||
        update.signerAddress === creator ||
        history.decisionUpdateOutpoints.includes(updateOutpoint)
      ) continue
      evidence.push(history.collection, ...history.states, update)
    }
  }
  return uniqueRecords(evidence)
}
