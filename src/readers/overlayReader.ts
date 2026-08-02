import { Inscription } from '@1sat/templates'
import { Hash, Transaction, Utils } from '@bsv/sdk'
import type { LifecycleProjection } from '../overlay/lifecycleParity.ts'
import {
  decodeMapSet,
  extractUnsignedSigmaScript,
  verifyCollectionScript,
} from '../protocol/collectionScript.ts'
import {
  decodeEmbeddedP2PKHScript,
  decodeOrdLockScript,
  decodeP2PKHScript,
} from '../protocol/scriptTemplates.ts'
import type { AdinalsOverlayClient, OverlayQuery } from '../overlay/client.ts'

export type OverlayRecordType =
  | 'collection'
  | 'collectionItem'
  | 'adUpdate'
  | 'adDecision'
  | 'listing'
  | 'state'

export type OverlayVerifiedOutput = {
  outpoint: string
  transaction: Transaction
  outputIndex: number
  recordType: OverlayRecordType
  map: Record<string, string> | null
  signer: string
  owner: string
  listing: { price: number; seller: string } | null
  contentType: string
  content: number[]
  height: number | null
  index: number
}

export type OverlayLookupClient = Pick<AdinalsOverlayClient, 'lookup'>

export type DualReadLifecycleResult = {
  status: 'match' | 'diverged' | 'overlay-unavailable'
  authoritative: 'reference'
  reference: LifecycleProjection
  overlay: LifecycleProjection | null
  errors: string[]
}

const outpointPattern = /^([0-9a-f]{64})_(\d+)$/

const transactionPosition = (transaction: Transaction): { height: number | null; index: number } => {
  const path = transaction.merklePath
  if (!path) return { height: null, index: 0 }
  const leaf = path.path[0]?.find((entry) => entry.hash === transaction.id('hex'))
  return { height: path.blockHeight, index: leaf?.offset ?? 0 }
}

const inspectOutput = (
  transaction: Transaction,
  outputIndex: number,
): OverlayVerifiedOutput => {
  const output = transaction.outputs[outputIndex]
  const exactOutpoint = `${transaction.id('hex')}_${outputIndex}`
  if (!output || output.satoshis !== 1) {
    throw new Error(`Overlay formula references a missing or non-one-satoshi output: ${exactOutpoint}`)
  }
  const txid = transaction.id('hex')
  const map = decodeMapSet(output.lockingScript)?.data ?? null
  const inscription = Inscription.decode(output.lockingScript)
  let recordType: OverlayRecordType
  let signer = ''
  let owner = ''
  let listing: OverlayVerifiedOutput['listing'] = null

  if (map) {
    if (
      map.subType !== 'collection' &&
      map.subType !== 'collectionItem' &&
      map.subType !== 'adUpdate' &&
      map.subType !== 'adDecision'
    ) throw new Error('Overlay formula contains an unsupported Adinals record subtype.')
    if (!inscription) throw new Error('Overlay record is missing its inscription envelope.')
    const unsigned = extractUnsignedSigmaScript(output.lockingScript)
    const input = transaction.inputs[0]
    const sourceTxid = input?.sourceTXID ?? input?.sourceTransaction?.id('hex') ?? ''
    if (!unsigned || !sourceTxid || input?.sourceOutputIndex === undefined) {
      throw new Error('Overlay record is missing its SIGMA source evidence.')
    }
    const verification = verifyCollectionScript(
      output.lockingScript,
      unsigned,
      { txid: sourceTxid, vout: input.sourceOutputIndex },
      map as never,
    )
    if (!verification.valid) {
      throw new Error(`Overlay record SIGMA verification failed: ${verification.errors.join('; ')}`)
    }
    recordType = map.subType
    signer = verification.signerAddress
    owner = decodeEmbeddedP2PKHScript(output.lockingScript)?.address ?? ''
    if (!owner) throw new Error('Overlay record has no unambiguous executable owner lock.')
  } else {
    const ordLock = decodeOrdLockScript(output.lockingScript)
    if (ordLock) {
      listing = { price: ordLock.priceSatoshis, seller: ordLock.seller }
      recordType = 'listing'
      owner = listing.seller
    } else {
      owner = decodeP2PKHScript(output.lockingScript)?.address ?? ''
      if (!owner) throw new Error(`Overlay lifecycle output has no recognized custody lock: ${exactOutpoint}`)
      recordType = 'state'
    }
  }

  const position = transactionPosition(transaction)
  return {
    outpoint: `${txid}_${outputIndex}`,
    transaction,
    outputIndex,
    recordType,
    map,
    signer,
    owner,
    listing,
    contentType: inscription?.file.type ?? '',
    content: inscription ? [...inscription.file.content] : [],
    ...position,
  }
}

export async function readOverlayFormula(
  client: OverlayLookupClient,
  query: OverlayQuery,
): Promise<OverlayVerifiedOutput[]> {
  const formula = await client.lookup(query)
  const records: OverlayVerifiedOutput[] = []
  const seen = new Set<string>()
  for (const candidate of formula.outputs) {
    if (!Number.isSafeInteger(candidate.outputIndex) || candidate.outputIndex < 0) {
      throw new Error('Overlay formula returned an invalid output index.')
    }
    let transaction: Transaction
    try {
      transaction = Transaction.fromBEEF(candidate.beef)
    } catch (error) {
      throw new Error(`Overlay formula BEEF could not be parsed: ${error instanceof Error ? error.message : String(error)}`)
    }
    const record = inspectOutput(transaction, candidate.outputIndex)
    if (seen.has(record.outpoint)) throw new Error('Overlay formula returned a duplicate output reference.')
    seen.add(record.outpoint)
    records.push(record)
  }
  return records
}

const sourceOutpoint = (record: OverlayVerifiedOutput): string => {
  const input = record.transaction.inputs[0]
  const txid = input?.sourceTXID ?? input?.sourceTransaction?.id('hex') ?? ''
  return txid && input?.sourceOutputIndex !== undefined
    ? `${txid}_${input.sourceOutputIndex}`
    : ''
}

const subtypeData = (record: OverlayVerifiedOutput): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(record.map?.subTypeData ?? '')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

const requireOne = (
  records: readonly OverlayVerifiedOutput[],
  predicate: (record: OverlayVerifiedOutput) => boolean,
  message: string,
): OverlayVerifiedOutput => {
  const matches = records.filter(predicate)
  if (matches.length !== 1) throw new Error(message)
  return matches[0]!
}

const deriveAdProjection = async (
  client: OverlayLookupClient,
  collection: OverlayVerifiedOutput,
  mint: OverlayVerifiedOutput,
): Promise<LifecycleProjection['ads'][number]> => {
  const history = await readOverlayFormula(client, { type: 'history', version: 1, origin: mint.outpoint })
  const currentFormula = await readOverlayFormula(client, { type: 'adCurrent', version: 1, origin: mint.outpoint })
  const historyCollection = requireOne(
    history,
    (record) => record.outpoint === collection.outpoint && record.recordType === 'collection',
    'Overlay history does not contain exactly one referenced collection.',
  )
  if (historyCollection.signer !== collection.signer) {
    throw new Error('Overlay history collection authority differs from collection lookup.')
  }
  const historyMint = requireOne(
    history,
    (record) => record.outpoint === mint.outpoint && record.recordType === 'collectionItem',
    'Overlay history does not contain exactly one requested mint.',
  )
  const states = history.filter((record) =>
    record.recordType === 'collectionItem' || record.recordType === 'listing' || record.recordType === 'state')
  if (states[0]?.outpoint !== mint.outpoint) throw new Error('Overlay ownership history does not begin at its mint origin.')
  for (let index = 1; index < states.length; index += 1) {
    if (sourceOutpoint(states[index]!) !== states[index - 1]!.outpoint) {
      throw new Error('Overlay ownership history contains a broken input-0 link.')
    }
  }
  const current = states.at(-1)
  if (!current) throw new Error('Overlay history has no current ownership state.')

  let ownerEpoch = mint.outpoint
  let previousOwner = historyMint.owner
  for (let index = 1; index < states.length; index += 1) {
    const previous = states[index - 1]!
    const state = states[index]!
    if (state.recordType !== 'listing' && state.owner !== previousOwner) {
      ownerEpoch = state.outpoint
      previousOwner = state.owner
    } else if (previous.recordType === 'listing' && state.recordType !== 'listing') {
      previousOwner = state.owner
    }
  }

  const updates = history.filter((record) => record.recordType === 'adUpdate')
  const decisions = history.filter((record) => record.recordType === 'adDecision')
  const epochUpdates = updates.filter((record) =>
    record.map?.collectionId === collection.outpoint &&
    record.map.adOrigin === mint.outpoint &&
    record.map.ownerEpoch === ownerEpoch &&
    record.signer === current.owner)
  let creative = historyMint
  let proposalStatus: LifecycleProjection['ads'][number]['proposalStatus'] = 'live'
  const approval = collection.map?.adApproval
  for (const update of epochUpdates) {
    const selfApproved = approval === 'open' || update.signer === collection.signer
    const decision = decisions.find((candidate) =>
      candidate.map?.updateOutpoint === update.outpoint &&
      candidate.signer === collection.signer)
    const approved = selfApproved || decision?.map?.decision === 'approved'
    if (approved) creative = update
    proposalStatus = approved
      ? 'live'
      : decision?.map?.decision === 'disapproved'
        ? 'rejected'
        : 'pending'
  }

  const currentOutpoints = new Set(currentFormula.map((record) => record.outpoint))
  for (const required of [collection.outpoint, ...states.map((record) => record.outpoint), creative.outpoint]) {
    if (!currentOutpoints.has(required)) {
      throw new Error('Overlay current formula omits required lifecycle evidence.')
    }
  }

  const mintFacts = subtypeData(mint)
  const slot = Number(mintFacts.mintNumber)
  if (!Number.isSafeInteger(slot) || slot < 1) throw new Error('Overlay mint has an invalid collection slot.')
  const kind = creative.map?.adFormat === 'image' ? 'image' : 'text'
  return {
    origin: mint.outpoint,
    slot,
    currentOutpoint: current.outpoint,
    owner: current.owner,
    ownerEpoch,
    ownershipOutpoints: states.map((record) => record.outpoint),
    listing: current.listing,
    proposalStatus,
    creative: {
      kind,
      text: kind === 'text' ? creative.map?.adText ?? '' : '',
      contentHash: kind === 'image' ? Utils.toHex(Hash.sha256(creative.content)) : '',
      sourceOutpoint: creative.outpoint,
    },
  }
}

export async function readOverlayLifecycleProjection(
  client: OverlayLookupClient,
  collectionOrigin: string,
  now = new Date(),
): Promise<LifecycleProjection> {
  const match = outpointPattern.exec(collectionOrigin.toLowerCase())
  if (!match) throw new Error('A valid collection origin is required for overlay projection.')
  const collectionRecords = await readOverlayFormula(client, {
    type: 'collection', version: 1, origin: collectionOrigin.toLowerCase(),
  })
  const collection = requireOne(
    collectionRecords,
    (record) => record.outpoint === collectionOrigin.toLowerCase() && record.recordType === 'collection',
    'Overlay collection lookup did not return the exact verified collection.',
  )
  const map = collection.map ?? {}
  const capacity = Number(map.adMax)
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Overlay collection capacity is invalid.')
  if (map.adApproval !== 'open' && map.adApproval !== 'creator') throw new Error('Overlay collection approval rule is invalid.')
  if (map.adFormat !== 'text' && map.adFormat !== 'image') throw new Error('Overlay collection format is invalid.')
  const expiresAt = map.expiresAt || null
  const expiration = expiresAt ? Date.parse(expiresAt) : Number.POSITIVE_INFINITY
  if (expiresAt && !Number.isFinite(expiration)) throw new Error('Overlay collection expiration is invalid.')

  const mintRecords = await readOverlayFormula(client, {
    type: 'adsByCollection', version: 1, collectionId: collection.outpoint,
  })
  const mints = mintRecords.filter((record) =>
    record.recordType === 'collectionItem' &&
    subtypeData(record).collectionId === collection.outpoint &&
    record.signer === collection.signer)
  if (mints.length !== mintRecords.length) throw new Error('Overlay collection membership formula contains an invalid mint.')
  const ads = await Promise.all(mints.map((mint) => deriveAdProjection(client, collection, mint)))
  ads.sort((left, right) => left.slot - right.slot || left.origin.localeCompare(right.origin))
  return {
    collection: {
      origin: collection.outpoint,
      creator: collection.signer,
      capacity,
      approval: map.adApproval,
      format: map.adFormat,
      expiresAt,
      displayEligible: !expiresAt || now.getTime() < expiration,
    },
    ads,
  }
}

export async function dualReadLifecycle(
  referenceReader: () => Promise<LifecycleProjection>,
  overlayReader: () => Promise<LifecycleProjection>,
  compare: (reference: LifecycleProjection, overlay: LifecycleProjection) => string[],
): Promise<DualReadLifecycleResult> {
  const reference = await referenceReader()
  try {
    const overlay = await overlayReader()
    const errors = compare(reference, overlay)
    return {
      status: errors.length ? 'diverged' : 'match',
      authoritative: 'reference',
      reference,
      overlay,
      errors,
    }
  } catch (error) {
    return {
      status: 'overlay-unavailable',
      authoritative: 'reference',
      reference,
      overlay: null,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
}
