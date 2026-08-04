import type { AdmittedOutputRecord } from './AdinalsStorage.js'
import { resolveMintWinners } from './mintResolution.js'
import { resolveAdCurrent, resolveAdHistory } from './lifecycleResolution.js'

/**
 * Derived state, rebuilt from evidence rather than trusted.
 *
 * Every field here is a function of the admitted outputs the node already
 * holds, so the whole layer is disposable: drop it, replay it, and it is
 * identical. `DERIVATION_VERSION` is the trigger — a node whose stored
 * projections carry an older version replays them before serving.
 *
 * Nothing here becomes authority. A projection decides *which* outputs answer a
 * query; the evidence those outputs carry still decides what is true, and every
 * reader re-verifies it. That is what makes denormalising this aggressively
 * safe.
 */
export const DERIVATION_VERSION = 1

export type ProposalStatus = 'none' | 'pending' | 'approved' | 'disapproved'

export type AdProjection = {
  adOrigin: string
  collectionId: string
  creator: string
  slot: number
  currentOutpoint: string
  currentOwner: string
  ownerEpoch: string
  listed: boolean
  priceSatoshis?: number
  adFormat?: string
  liveCreativeOutpoint: string
  proposalStatus: ProposalStatus
  pendingUpdates: string[]
  expiresAt?: string
  /** The `history` answer, as stored outpoints. */
  evidence: string[]
  /** The `adCurrent` answer, as stored outpoints. */
  currentEvidence: string[]
  derivationVersion: number
}

export type CollectionProjection = {
  collectionId: string
  creator: string
  name?: string
  adPlacement?: string
  adFormat?: string
  adApproval?: string
  adMax?: number
  expiresAt?: string
  /** Retained whole so arbitrary MAP metadata stays searchable. */
  map?: Record<string, string>
  adCount: number
  derivationVersion: number
}

export const outpointOf = (
  record: Pick<AdmittedOutputRecord, 'txid' | 'outputIndex'>
): string => `${record.txid}_${record.outputIndex}`

export const parseOutpoint = (
  outpoint: string
): { txid: string; outputIndex: number } => ({
  txid: outpoint.slice(0, 64),
  outputIndex: Number(outpoint.slice(65))
})

/**
 * Deterministic evidence order.
 *
 * The resolver's own order depends on the order storage happened to return
 * rows, which is not reproducible across a replay. Chain position is, so the
 * projection sorts by it and a rebuild yields the identical list. The formula
 * is a set of output references either way — a reader hydrates and re-derives —
 * but a stable order makes the two paths comparable.
 */
const chainSort = (
  records: readonly AdmittedOutputRecord[]
): AdmittedOutputRecord[] =>
  [...records].sort((left, right) =>
    (left.blockHeight ?? Number.MAX_SAFE_INTEGER) -
      (right.blockHeight ?? Number.MAX_SAFE_INTEGER) ||
    (left.transactionIndex ?? Number.MAX_SAFE_INTEGER) -
      (right.transactionIndex ?? Number.MAX_SAFE_INTEGER) ||
    left.txid.localeCompare(right.txid) ||
    left.outputIndex - right.outputIndex
  )

const numberOrUndefined = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

const slotOf = (mint: AdmittedOutputRecord): number => {
  try {
    const data = JSON.parse(mint.map?.subTypeData ?? '') as { mintNumber?: unknown }
    return typeof data.mintNumber === 'number' ? data.mintNumber : 0
  } catch {
    return 0
  }
}

/**
 * Derives every ad in one collection.
 *
 * The semantics are not restated here: `resolveAdHistory` and `resolveAdCurrent`
 * remain the single definition of what a chain means, and this runs them once
 * at write time instead of once per read. That is what keeps the projection
 * incapable of disagreeing with the resolver it replaces.
 */
export const buildCollectionProjection = (
  records: readonly AdmittedOutputRecord[],
  collectionId: string,
  now: Date = new Date()
): { collection: CollectionProjection | null; ads: AdProjection[] } => {
  const collectionRecord = records.find(
    (candidate) =>
      candidate.recordType === 'collection' && outpointOf(candidate) === collectionId
  )
  if (!collectionRecord?.signerAddress) return { collection: null, ads: [] }

  const map = collectionRecord.map ?? {}
  const mints = resolveMintWinners(records).filter((mint) => {
    try {
      const data = JSON.parse(mint.map?.subTypeData ?? '') as { collectionId?: unknown }
      return data.collectionId === collectionId
    } catch {
      return false
    }
  })

  const ads: AdProjection[] = []
  for (const mint of chainSort(mints)) {
    const adOrigin = outpointOf(mint)
    const history = resolveAdHistory(records, adOrigin)
    if (!history) continue
    const current = resolveAdCurrent(history, now)

    const currentEpochUpdates = history.updates.filter(
      (update) => update.map?.ownerEpoch === history.ownerEpoch
    )
    const pendingUpdates = map.adApproval === 'creator'
      ? currentEpochUpdates
        .filter((update) =>
          update.signerAddress !== collectionRecord.signerAddress &&
          !history.decisionUpdateOutpoints.includes(outpointOf(update)))
        .map(outpointOf)
      : []

    const decidedVerdict = current.decision?.map?.decision
    const disapproved = currentEpochUpdates.length > 0 &&
      pendingUpdates.length === 0 &&
      !decidedVerdict &&
      history.decisions.some((decision) => decision.map?.decision === 'disapproved')

    const proposalStatus: ProposalStatus = pendingUpdates.length > 0
      ? 'pending'
      : decidedVerdict === 'approved'
        ? 'approved'
        : disapproved
          ? 'disapproved'
          : 'none'

    ads.push({
      adOrigin,
      collectionId,
      creator: collectionRecord.signerAddress,
      slot: slotOf(mint),
      currentOutpoint: outpointOf(history.current),
      currentOwner: history.currentOwner,
      ownerEpoch: history.ownerEpoch,
      listed: history.current.recordType === 'listing',
      ...(history.current.priceSatoshis === undefined
        ? {}
        : { priceSatoshis: history.current.priceSatoshis }),
      ...(mint.map?.adFormat === undefined ? {} : { adFormat: mint.map.adFormat }),
      liveCreativeOutpoint: outpointOf(current.creative),
      proposalStatus,
      pendingUpdates,
      ...(map.expiresAt === undefined ? {} : { expiresAt: map.expiresAt }),
      // Order is preserved rather than re-sorted. `states` comes from the
      // chain walk and therefore begins at the mint, which readers rely on:
      // `overlayReader` refuses a history whose first ownership state is not
      // the ad's origin. Sorting by chain position would break that for any
      // record ingested without a block height, which is exactly the state the
      // proof-upgrade gap leaves the newest records in. Only `decisions` is
      // gathered by filtering storage, so only `decisions` needs an order
      // imposed on it to survive a replay.
      evidence: [
        history.collection,
        ...history.states,
        ...history.updates,
        ...chainSort(history.decisions)
      ].map(outpointOf),
      currentEvidence: current.evidence.map(outpointOf),
      derivationVersion: DERIVATION_VERSION
    })
  }

  return {
    collection: {
      collectionId,
      creator: collectionRecord.signerAddress,
      ...(map.name === undefined ? {} : { name: map.name }),
      ...(map.adPlacement === undefined ? {} : { adPlacement: map.adPlacement }),
      ...(map.adFormat === undefined ? {} : { adFormat: map.adFormat }),
      ...(map.adApproval === undefined ? {} : { adApproval: map.adApproval }),
      ...(numberOrUndefined(map.adMax) === undefined
        ? {}
        : { adMax: numberOrUndefined(map.adMax) as number }),
      ...(map.expiresAt === undefined ? {} : { expiresAt: map.expiresAt }),
      map,
      adCount: ads.length,
      derivationVersion: DERIVATION_VERSION
    },
    ads
  }
}

/** Display eligibility depends on the clock, so it is decided at read time. */
export const displayEligible = (
  projection: Pick<AdProjection, 'expiresAt'>,
  now: Date = new Date()
): boolean => {
  if (!projection.expiresAt) return true
  const expiration = Date.parse(projection.expiresAt)
  return Number.isFinite(expiration) ? now.getTime() < expiration : false
}

/** Every collection origin the node holds evidence for. */
export const collectionOriginsIn = (
  records: readonly AdmittedOutputRecord[]
): string[] => [
  ...new Set(
    records
      .filter((record) => record.recordType === 'collection')
      .map(outpointOf)
  )
]
