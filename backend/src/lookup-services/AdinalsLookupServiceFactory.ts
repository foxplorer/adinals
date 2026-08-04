import type {
  AdmissionMode,
  LookupFormula,
  LookupQuestion,
  LookupService,
  OutputAdmittedByTopic,
  OutputSpent,
  SpendNotificationMode
} from '@bsv/overlay'
import { Transaction } from '@bsv/sdk'
import type { Db } from 'mongodb'
import docs from './AdinalsLookupDocs.md.js'
import {
  AdinalsStorage,
  transactionPosition,
  type AdinalsStorageLike
} from './AdinalsStorage.js'
import { backfillAnnotations } from './annotationBackfill.js'
import { inspectAdinalsTransactionOutput } from '../protocol/recordEnvelope.js'
import { classifyLifecycleTransition } from '../protocol/lifecycleRecords.js'
import {
  classifyAgainstPredecessor,
  listingAnnotations,
  predecessorOutpointOf,
  recordScope,
  type AdmissionClassification
} from './admissionClassification.js'
import {
  decodeEmbeddedP2PKH,
  decodeOrdLock,
  decodeP2PKH
} from '../protocol/scriptTemplates.js'
import { DERIVATION_VERSION, displayEligible, parseOutpoint } from './projections.js'
import { replayCollection, replayIfStale } from './projectionReplay.js'
import { CollectionReplayQueue } from './replayQueue.js'

/** Whitelists that keep a query on an index instead of into a scan. */
const COLLECTION_SEARCH_KEYS = new Set([
  'collectionId', 'creator', 'name', 'adPlacement', 'adFormat', 'adApproval', 'map.*'
])
const AD_SEARCH_KEYS = new Set([
  'adOrigin', 'collectionId', 'creator', 'currentOwner', 'ownerEpoch',
  'proposalStatus', 'adFormat', 'listed', 'slot'
])

const boundedLimit = (requested: unknown): number => {
  const value = typeof requested === 'number' ? requested : 100
  return Math.max(1, Math.min(500, Math.floor(value)))
}

const dedupe = (outpoints: readonly string[]): string[] => [...new Set(outpoints)]

const formulaFrom = (outpoints: readonly string[]): LookupFormula =>
  outpoints.map((outpoint) => parseOutpoint(outpoint))

export class AdinalsLookupService implements LookupService {
  readonly admissionMode: AdmissionMode = 'whole-tx'
  readonly spendNotificationMode: SpendNotificationMode = 'whole-tx'
  readonly replays = new CollectionReplayQueue()

  constructor(public readonly storage: AdinalsStorageLike) {}

  /** One rebuild at a time per collection, coalescing a burst into one. */
  private async rederive(collectionId: string): Promise<void> {
    await this.replays.request(collectionId, async () => {
      await replayCollection(this.storage, collectionId)
    })
  }

  async outputAdmittedByTopic(payload: OutputAdmittedByTopic): Promise<void> {
    if (payload.mode !== 'whole-tx') {
      throw new Error(
        `Expected whole-tx admission payload, received ${payload.mode}`
      )
    }

    const tx = Transaction.fromBEEF(payload.atomicBEEF)
    const envelope = inspectAdinalsTransactionOutput(tx, payload.outputIndex)
    const output = tx.outputs[payload.outputIndex]
    if (!output) throw new Error('Topic admitted an output that does not exist')
    // The engine's atomic BEEF is subject-scoped, so a confirmed transaction
    // arrives with no `sourceTransaction` on its inputs and the ancestry-based
    // classifier can never fire. The predecessor's own admitted row carries the
    // same facts, so the successor is classified by joining to it instead.
    const predecessorOutpoint = predecessorOutpointOf(tx)
    const predecessor = predecessorOutpoint
      ? await this.storage.findOutputRecord(
        predecessorOutpoint.slice(0, 64),
        Number(predecessorOutpoint.slice(65))
      )
      : null
    // Without a stored predecessor the ancestry-based classifier is still tried,
    // which is the one case it can answer: a record ingested while unconfirmed
    // still carries its source transactions. It knows no scope to inherit.
    const ancestryLifecycle = predecessor ? null : classifyLifecycleTransition(tx, [0])
    const lifecycle: AdmissionClassification | null = predecessor
      ? classifyAgainstPredecessor(tx, predecessor)
      : ancestryLifecycle
        ? {
          kind: ancestryLifecycle.kind,
          predecessorOutpoint: ancestryLifecycle.predecessorOutpoint,
          ownerAddress: ancestryLifecycle.ownerAddress
        }
        : null
    const listing = decodeOrdLock(output.lockingScript)
    const state = decodeP2PKH(output.lockingScript) ??
      decodeEmbeddedP2PKH(output.lockingScript)
    const recordType = envelope.valid && envelope.subType && envelope.map
      ? envelope.subType
      : listing
        ? 'listing'
        : state
          ? 'state'
          : null
    if (!recordType) throw new Error('Topic admitted an unclassifiable Adinals output')
    const position = transactionPosition(tx)
    const txid = tx.id('hex')
    // A sibling `adUpdate` at output 1 is a record, not the state the
    // transaction moved, so it takes its scope from its own MAP envelope and is
    // never labelled with the transition.
    const isStateSuccessor = payload.outputIndex === 0
    const ownScope = recordScope(
      recordType,
      `${txid}_${payload.outputIndex}`,
      envelope.valid && envelope.map ? envelope.map : undefined
    )
    await this.storage.storeOutput({
      txid,
      outputIndex: payload.outputIndex,
      atomicBEEF: payload.atomicBEEF,
      admittedAt: new Date(),
      recordType,
      ...(envelope.valid && envelope.map ? {
        signerAddress: envelope.signerAddress,
        map: envelope.map
      } : {}),
      // Derivable from input 0 alone, so it is retained even when the
      // transition itself does not classify.
      ...(predecessorOutpoint && isStateSuccessor ? { predecessorOutpoint } : {}),
      ...(lifecycle && isStateSuccessor ? {
        lifecycleKind: lifecycle.kind,
        ownerAddress: lifecycle.ownerAddress
      } : state ? { ownerAddress: state.address } : {}),
      ...(listing ? {
        ownerAddress: listing.seller,
        priceSatoshis: listing.priceSatoshis,
        ...listingAnnotations(output.lockingScript)
      } : {}),
      ...ownScope,
      ...(lifecycle && isStateSuccessor ? {
        ...(lifecycle.collectionId === undefined ? {} : { collectionId: lifecycle.collectionId }),
        ...(lifecycle.adOrigin === undefined ? {} : { adOrigin: lifecycle.adOrigin })
      } : {}),
      ...position
    })

    const scopedCollection = ownScope.collectionId ?? lifecycle?.collectionId
    if (scopedCollection) await this.rederive(scopedCollection)
  }

  async outputSpent(payload: OutputSpent): Promise<void> {
    if (payload.mode !== 'whole-tx') {
      throw new Error(
        `Expected whole-tx spend payload, received ${payload.mode}`
      )
    }

    const spendingTx = Transaction.fromBEEF(payload.spendingAtomicBEEF)
    await this.storage.markOutputSpent(
      payload.txid,
      payload.outputIndex,
      spendingTx.id('hex'),
      new Date()
    )
    // A spend moves the tip of a chain, so the collection's derived state is
    // stale until it is rebuilt. The scope annotation makes that one
    // collection's work rather than the namespace's.
    const spent = await this.storage.findOutputRecord(payload.txid, payload.outputIndex)
    if (spent?.collectionId) await this.rederive(spent.collectionId)
  }

  /** Legal eviction is distinct from an ordinary lifecycle spend. */
  async outputEvicted(txid: string, outputIndex: number): Promise<void> {
    await this.storage.evictOutput(txid, outputIndex)
  }

  async lookup(question: LookupQuestion): Promise<LookupFormula> {
    if (question.service !== 'ls_adinals') {
      throw new Error('Lookup service not supported')
    }
    if (
      !question.query ||
      typeof question.query !== 'object' ||
      Array.isArray(question.query)
    ) {
      throw new Error('A versioned Adinals query object must be provided')
    }

    const query = question.query as Record<string, unknown>
    if (query.version !== 1) throw new Error('Unsupported query version')

    if (query.type === 'status') {
      // LookupFormula is always an array of verifiable output references.
      // Service phase/version belongs in getMetaData(), never in an invented
      // free-form response shape.
      await this.storage.countOutputs()
      return []
    }

    if (query.type === 'collections') {
      const requestedLimit = typeof query.limit === 'number' ? query.limit : 100
      const limit = Math.max(1, Math.min(500, Math.floor(requestedLimit)))
      return await this.storage.findOutputs(limit, 'collection')
    }

    if (query.type === 'collection' || query.type === 'output') {
      if (typeof query.origin !== 'string') {
        throw new Error('A collection origin is required')
      }
      const match = /^([0-9a-f]{64})_(\d+)$/.exec(query.origin.toLowerCase())
      if (!match) throw new Error('A valid collection origin is required')
      const outputIndex = Number(match[2])
      if (!Number.isSafeInteger(outputIndex)) {
        throw new Error('A valid collection origin is required')
      }
      const output = await this.storage.findOutput(match[1], outputIndex)
      if (!output || (query.type === 'collection' && output.recordType !== 'collection')) {
        return []
      }
      return [{ txid: output.txid, outputIndex: output.outputIndex }]
    }

    if (query.type === 'adsByCollection') {
      if (typeof query.collectionId !== 'string') {
        throw new Error('A collection origin is required')
      }
      const ads = await this.storage.findAdProjectionsByCollection(query.collectionId)
      return formulaFrom(ads.map((ad) => ad.adOrigin))
    }

    if (query.type === 'ad') {
      if (typeof query.origin !== 'string') throw new Error('An ad origin is required')
      const ad = await this.storage.findAdProjection(query.origin)
      return ad ? formulaFrom([ad.adOrigin]) : []
    }

    if (query.type === 'history' || query.type === 'adCurrent') {
      if (typeof query.origin !== 'string') throw new Error('An ad origin is required')
      if (!/^([0-9a-f]{64})_(\d+)$/.test(query.origin)) {
        throw new Error('A valid ad origin is required')
      }
      const ad = await this.storage.findAdProjection(query.origin)
      if (!ad) return []
      return formulaFrom(query.type === 'history' ? ad.evidence : ad.currentEvidence)
    }

    if (query.type === 'collectionLive') {
      if (typeof query.origin !== 'string' || !/^([0-9a-f]{64})_(\d+)$/.test(query.origin)) {
        throw new Error('A valid collection origin is required')
      }
      const collection = await this.storage.findCollectionProjection(query.origin)
      if (!collection) return []
      const ads = await this.storage.findAdProjectionsByCollection(query.origin)
      const live = ads.filter((ad) => displayEligible(ad))
      // The collection record is returned even when nothing is display
      // eligible: an expired collection answers with an empty display set, not
      // with an absent collection.
      return formulaFrom(dedupe([
        query.origin,
        ...live.flatMap((ad) => ad.currentEvidence)
      ]))
    }

    if (query.type === 'collectionProjection') {
      if (typeof query.origin !== 'string' || !/^([0-9a-f]{64})_(\d+)$/.test(query.origin)) {
        throw new Error('A valid collection origin is required')
      }
      const collection = await this.storage.findCollectionProjection(query.origin)
      if (!collection) return []
      const ads = await this.storage.findAdProjectionsByCollection(query.origin)
      return formulaFrom(dedupe([query.origin, ...ads.flatMap((ad) => ad.evidence)]))
    }

    if (query.type === 'pendingDecisions') {
      if (typeof query.creator !== 'string' || !query.creator) {
        throw new Error('A creator address is required')
      }
      const ads = await this.storage.findPendingAdProjections(query.creator)
      const eligible = ads.filter((ad) => displayEligible(ad))
      return formulaFrom(dedupe(eligible.flatMap((ad) => [
        ad.collectionId,
        ...ad.evidence.filter((outpoint) => outpoint !== ad.collectionId &&
          !ad.pendingUpdates.includes(outpoint)),
        ...ad.pendingUpdates
      ])))
    }

    if (query.type === 'collectionsByCreator') {
      if (typeof query.creator !== 'string' || !query.creator) {
        throw new Error('A creator address is required')
      }
      const collections = await this.storage.searchCollectionProjections(
        { creator: query.creator },
        boundedLimit(query.limit)
      )
      return formulaFrom(collections.map((collection) => collection.collectionId))
    }

    if (query.type === 'adsByOwner') {
      if (typeof query.owner !== 'string' || !query.owner) {
        throw new Error('An owner address is required')
      }
      const ads = await this.storage.findAdProjectionsByOwner(query.owner)
      return formulaFrom(ads.map((ad) => ad.currentOutpoint))
    }

    if (query.type === 'search') {
      return await this.search(query)
    }

    throw new Error('Unknown query type')
  }

  /**
   * One indexed metadata query, so an application can scope itself to its own
   * records without a node release per question.
   *
   * The accepted keys are whitelisted against what is actually indexed. An
   * unknown key is refused rather than silently tipping the node into a
   * collection scan, which is the failure mode this whole layer removes. A
   * label is not authority — anyone can write `adPlacement` — so an application
   * that needs its own records should pair a label with `creator`, which is
   * SIGMA verified.
   */
  private async search(query: Record<string, unknown>): Promise<LookupFormula> {
    const where = query.where
    if (!where || typeof where !== 'object' || Array.isArray(where)) {
      throw new Error('A search requires a where object')
    }
    const scope = query.scope === 'ad' ? 'ad' : 'collection'
    const allowed = scope === 'ad' ? AD_SEARCH_KEYS : COLLECTION_SEARCH_KEYS
    const filter: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
      const field = key.startsWith('map.') ? 'map.*' : key
      if (!allowed.has(field)) {
        throw new Error(
          `Unsupported search field "${key}". Indexed fields are: ` +
          `${[...allowed].join(', ')}`
        )
      }
      if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      ) {
        throw new Error(`Search field "${key}" accepts only a scalar value`)
      }
      filter[key] = value
    }
    if (Object.keys(filter).length === 0) {
      throw new Error('A search requires at least one indexed field')
    }

    const limit = boundedLimit(query.limit)
    if (scope === 'ad') {
      const ads = await this.storage.searchAdProjections(filter, limit)
      return formulaFrom(ads.map((ad) => ad.currentOutpoint))
    }
    const collections = await this.storage.searchCollectionProjections(filter, limit)
    return formulaFrom(collections.map((collection) => collection.collectionId))
  }

  async getDocumentation(): Promise<string> {
    return docs
  }

  async getMetaData(): Promise<{
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }> {
    return {
      name: 'Adinals v3 Lookup Service',
      shortDescription: 'Retains complete Adinals lifecycle history',
      // Bumped so a deployed node identifies itself over HTTP. Without this a
      // release cannot be confirmed as live from outside the container.
      version: '0.3.1-text-limits',
      informationURL: 'https://adinals.com/protocol'
    }
  }
}

export default (db: Db): AdinalsLookupService => {
  const storage = new AdinalsStorage(db)
  void storage.ensureIndexes().then(async () => {
    // Rows admitted before scope annotation existed cannot be reached by an
    // indexed query, so they are upgraded once. `storeOutput` upserts with
    // `$setOnInsert`, so re-submission would never repair them.
    const unscoped = await storage.countUnscopedOutputs()
    if (unscoped === 0) return
    console.log(`Annotating ${unscoped} Adinals outputs admitted before scope indexing`)
    const report = await backfillAnnotations(storage)
    console.log(
      `Adinals annotation backfill: ${report.annotated} annotated, ` +
      `${report.unresolved.length} unresolved of ${report.scanned} scanned`
    )
    for (const item of report.unresolved) console.warn('  unresolved:', item)
  }).then(async () => {
    // The derived layer is disposable: if it was built by older derivation
    // code, or is missing entirely, it is replayed from evidence already held.
    const replay = await replayIfStale(storage)
    if (replay) {
      console.log(
        `Adinals projection replay (v${DERIVATION_VERSION}): ${replay.collections} ` +
        `collections, ${replay.ads} ads in ${replay.milliseconds} ms`
      )
    }
  }).catch((error: unknown) => {
    console.error('Unable to initialize Adinals overlay indexes', error)
  })
  return new AdinalsLookupService(storage)
}
