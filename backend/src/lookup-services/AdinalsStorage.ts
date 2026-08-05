import type { Collection, Db } from 'mongodb'
import { Transaction } from '@bsv/sdk'
import {
  inspectAdinalsTransactionOutput,
  type AdinalsRecordSubtype
} from '../protocol/recordEnvelope.js'
import type { AdProjection, CollectionProjection } from './projections.js'

export type AdinalsOutputType = AdinalsRecordSubtype | 'state' | 'listing'

export interface AdmittedOutputRecord {
  txid: string
  outputIndex: number
  atomicBEEF: number[]
  admittedAt: Date
  recordType?: AdinalsOutputType
  signerAddress?: string
  map?: Record<string, string>
  lifecycleKind?: 'listing' | 'purchase' | 'cancellation' | 'transfer' | 'update'
  predecessorOutpoint?: string
  ownerAddress?: string
  priceSatoshis?: number
  blockHeight?: number
  transactionIndex?: number
  spentByTxid?: string
  spentAt?: Date
  /**
   * Scope carried on every row so a collection or ad can be queried by index
   * instead of scanning. Immutable records take it from their own MAP envelope;
   * successor states inherit it from the predecessor they spend, because a bare
   * P2PKH or OrdLock output names neither.
   */
  collectionId?: string
  adOrigin?: string
  /** OrdLock terms retained so a spend of this listing classifies without it. */
  listingPayoutScript?: string
  listingSuffix?: string
}

/** An admitted row without its evidence, which is all annotation needs. */
export type AdmittedOutputMetadata = Omit<AdmittedOutputRecord, 'atomicBEEF'>

export interface AdinalsStorageLike {
  ensureIndexes(): Promise<void>
  storeOutput(record: AdmittedOutputRecord): Promise<void>
  markOutputSpent(
    txid: string,
    outputIndex: number,
    spendingTxid: string,
    spentAt: Date
  ): Promise<void>
  evictOutput(txid: string, outputIndex: number): Promise<void>
  countOutputs(): Promise<number>
  /** Rows admitted before scope annotation existed, so the backfill can be skipped. */
  countUnscopedOutputs(): Promise<number>
  findOutputs(
    limit: number,
    recordType?: AdinalsOutputType
  ): Promise<Array<{ txid: string; outputIndex: number }>>
  findOutput(
    txid: string,
    outputIndex: number
  ): Promise<{ txid: string; outputIndex: number; recordType?: AdinalsOutputType } | null>
  /**
   * The predecessor row a successor is classified against. Deliberately
   * excludes `atomicBEEF`: classification needs the stored facts, not evidence,
   * and a join that dragged the predecessor's inscription bytes along would
   * reintroduce the cost this annotation exists to remove.
   */
  findOutputRecord(
    txid: string,
    outputIndex: number
  ): Promise<AdmittedOutputMetadata | null>
  annotateOutput(
    txid: string,
    outputIndex: number,
    annotations: Partial<AdmittedOutputRecord>
  ): Promise<void>
  findRecords(recordType: AdinalsRecordSubtype): Promise<AdmittedOutputRecord[]>
  findAllRecords(): Promise<AdmittedOutputRecord[]>
  /** Evidence for one collection, by index. Replaces a findAllRecords() scan. */
  findRecordsByCollection(collectionId: string): Promise<AdmittedOutputRecord[]>

  // Derived projections. Disposable, replayable, never authority.
  replaceCollectionProjection(
    collectionId: string,
    collection: CollectionProjection | null,
    ads: AdProjection[]
  ): Promise<void>
  findAdProjection(adOrigin: string): Promise<AdProjection | null>
  findAdProjectionsByCollection(collectionId: string): Promise<AdProjection[]>
  findAdProjectionsByOwner(owner: string): Promise<AdProjection[]>
  findPendingAdProjections(creator: string): Promise<AdProjection[]>
  findCollectionProjection(collectionId: string): Promise<CollectionProjection | null>
  searchCollectionProjections(
    where: Record<string, unknown>,
    limit: number
  ): Promise<CollectionProjection[]>
  searchAdProjections(
    where: Record<string, unknown>,
    limit: number
  ): Promise<AdProjection[]>
  /** Lowest derivation version stored, so a stale layer can be replayed. */
  staleProjectionCount(version: number): Promise<number>
}

export class AdinalsStorage implements AdinalsStorageLike {
  private readonly outputs: Collection<AdmittedOutputRecord>
  private readonly adProjections: Collection<AdProjection>
  private readonly collectionProjections: Collection<CollectionProjection>

  constructor(db: Db) {
    this.outputs = db.collection<AdmittedOutputRecord>('adinals_outputs')
    this.adProjections = db.collection<AdProjection>('adinals_ads')
    this.collectionProjections = db.collection<CollectionProjection>('adinals_collections')
  }

  async ensureIndexes(): Promise<void> {
    await this.outputs.createIndex(
      { txid: 1, outputIndex: 1 },
      { unique: true, name: 'adinals_outpoint' }
    )
    await this.outputs.createIndex(
      { spentByTxid: 1 },
      { sparse: true, name: 'adinals_spending_txid' }
    )
    await this.outputs.createIndex(
      { recordType: 1, txid: 1, outputIndex: 1 },
      { name: 'adinals_record_type' }
    )

    // Scoped reads. Each of these replaces a findAllRecords() scan.
    await this.outputs.createIndex(
      { collectionId: 1, recordType: 1 },
      { sparse: true, name: 'adinals_collection_scope' }
    )
    await this.outputs.createIndex(
      { adOrigin: 1, blockHeight: 1, transactionIndex: 1 },
      { sparse: true, name: 'adinals_ad_scope' }
    )
    // "My ads": the unspent tip of a chain is the one the owner still holds.
    await this.outputs.createIndex(
      { ownerAddress: 1, spentByTxid: 1 },
      { sparse: true, name: 'adinals_owner' }
    )
    // Creator-scoped reads, including collectionsByCreator and pending verdicts.
    await this.outputs.createIndex(
      { signerAddress: 1, recordType: 1 },
      { sparse: true, name: 'adinals_signer' }
    )
    // Arbitrary MAP metadata equality without a node release per question:
    // name, adPlacement, adFormat, and anything a future record version adds.
    await this.outputs.createIndex(
      { 'map.$**': 1 },
      { name: 'adinals_map_wildcard' }
    )

    await this.adProjections.createIndex(
      { adOrigin: 1 },
      { unique: true, name: 'adinals_ad_origin' }
    )
    await this.adProjections.createIndex(
      { collectionId: 1, slot: 1 },
      { name: 'adinals_ad_by_collection' }
    )
    await this.adProjections.createIndex(
      { currentOwner: 1 },
      { name: 'adinals_ad_by_owner' }
    )
    await this.adProjections.createIndex(
      { creator: 1, proposalStatus: 1 },
      { name: 'adinals_ad_by_creator_status' }
    )
    await this.adProjections.createIndex(
      { derivationVersion: 1 },
      { name: 'adinals_ad_derivation' }
    )
    await this.collectionProjections.createIndex(
      { collectionId: 1 },
      { unique: true, name: 'adinals_collection_origin' }
    )
    await this.collectionProjections.createIndex(
      { creator: 1 },
      { name: 'adinals_collection_by_creator' }
    )
    await this.collectionProjections.createIndex(
      { adPlacement: 1 },
      { sparse: true, name: 'adinals_collection_by_placement' }
    )
    await this.collectionProjections.createIndex(
      { name: 1 },
      { sparse: true, name: 'adinals_collection_by_name' }
    )
    // The label search an application scopes itself with, without a release.
    await this.collectionProjections.createIndex(
      { 'map.$**': 1 },
      { name: 'adinals_collection_map_wildcard' }
    )

    // Local schema upgrade for outputs admitted by the first scaffold build.
    // Evidence is re-derived from stored BEEF rather than guessed from txids.
    for await (const record of this.outputs.find({ recordType: { $exists: false } })) {
      try {
        const tx = Transaction.fromBEEF(record.atomicBEEF)
        const envelope = inspectAdinalsTransactionOutput(tx, record.outputIndex)
        if (!envelope.valid || !envelope.subType || !envelope.map) continue
        const position = transactionPosition(tx)
        await this.outputs.updateOne(
          { txid: record.txid, outputIndex: record.outputIndex },
          {
            $set: {
              recordType: envelope.subType,
              signerAddress: envelope.signerAddress,
              map: envelope.map,
              ...(position.blockHeight === undefined ? {} : {
                blockHeight: position.blockHeight
              }),
              ...(position.transactionIndex === undefined ? {} : {
                transactionIndex: position.transactionIndex
              })
            }
          }
        )
      } catch {
        // Leave corrupt legacy rows unclassified and therefore unqueryable.
      }
    }
  }

  /**
   * Admission is write-once except for chain position.
   *
   * A record submitted from the mempool is admitted with no block height, and
   * nothing in the lookup interface reports one later: the engine's merkle
   * proof handling updates its own storage, not this one. Under a plain
   * `$setOnInsert` such a row stays unconfirmed forever, and every reader built
   * on it keeps describing a mined transaction as pending. Position is
   * therefore the one thing a resubmission may fill in — derived from the
   * verified BEEF, never overwritten with an absence — so evidence that now
   * carries a proof upgrades the row it already admitted.
   */
  async storeOutput(record: AdmittedOutputRecord): Promise<void> {
    await this.outputs.updateOne(
      { txid: record.txid, outputIndex: record.outputIndex },
      outputUpsert(record),
      { upsert: true }
    )
  }

  async markOutputSpent(
    txid: string,
    outputIndex: number,
    spendingTxid: string,
    spentAt: Date
  ): Promise<void> {
    await this.outputs.updateOne(
      { txid, outputIndex },
      {
        $set: {
          spentByTxid: spendingTxid,
          spentAt
        }
      }
    )
  }

  async evictOutput(txid: string, outputIndex: number): Promise<void> {
    await this.outputs.deleteOne({ txid, outputIndex })
  }

  async countOutputs(): Promise<number> {
    return await this.outputs.countDocuments()
  }

  async countUnscopedOutputs(): Promise<number> {
    return await this.outputs.countDocuments({ collectionId: { $exists: false } })
  }

  async findOutputs(
    limit: number,
    recordType?: AdinalsOutputType
  ): Promise<Array<{ txid: string; outputIndex: number }>> {
    return await this.outputs
      .find(
        recordType ? { recordType } : {},
        { projection: { _id: 0, txid: 1, outputIndex: 1 } }
      )
      .sort({ txid: 1, outputIndex: 1 })
      .limit(limit)
      .toArray()
  }

  async findOutput(
    txid: string,
    outputIndex: number
  ): Promise<{ txid: string; outputIndex: number; recordType?: AdinalsOutputType } | null> {
    return await this.outputs.findOne(
      { txid, outputIndex },
      { projection: { _id: 0, txid: 1, outputIndex: 1, recordType: 1 } }
    )
  }

  async findOutputRecord(
    txid: string,
    outputIndex: number
  ): Promise<AdmittedOutputMetadata | null> {
    return await this.outputs.findOne(
      { txid, outputIndex },
      { projection: { _id: 0, atomicBEEF: 0 } }
    ) as AdmittedOutputMetadata | null
  }

  async annotateOutput(
    txid: string,
    outputIndex: number,
    annotations: Partial<AdmittedOutputRecord>
  ): Promise<void> {
    if (Object.keys(annotations).length === 0) return
    await this.outputs.updateOne({ txid, outputIndex }, { $set: annotations })
  }

  async findRecords(recordType: AdinalsRecordSubtype): Promise<AdmittedOutputRecord[]> {
    return await this.outputs.find({ recordType }).toArray()
  }

  async findAllRecords(): Promise<AdmittedOutputRecord[]> {
    return await this.outputs.find({}).toArray()
  }

  async findRecordsByCollection(collectionId: string): Promise<AdmittedOutputRecord[]> {
    return await this.outputs.find({ collectionId }).toArray()
  }

  async replaceCollectionProjection(
    collectionId: string,
    collection: CollectionProjection | null,
    ads: AdProjection[]
  ): Promise<void> {
    // Replace rather than merge: an ad that stopped resolving must disappear,
    // not linger as a stale answer.
    await this.adProjections.deleteMany({ collectionId })
    if (ads.length > 0) await this.adProjections.insertMany(ads as AdProjection[])
    if (collection) {
      await this.collectionProjections.replaceOne(
        { collectionId },
        collection,
        { upsert: true }
      )
    } else {
      await this.collectionProjections.deleteOne({ collectionId })
    }
  }

  async findAdProjection(adOrigin: string): Promise<AdProjection | null> {
    return await this.adProjections.findOne({ adOrigin }, { projection: { _id: 0 } })
  }

  async findAdProjectionsByCollection(collectionId: string): Promise<AdProjection[]> {
    return await this.adProjections
      .find({ collectionId }, { projection: { _id: 0 } })
      .sort({ slot: 1 })
      .toArray()
  }

  async findAdProjectionsByOwner(owner: string): Promise<AdProjection[]> {
    return await this.adProjections
      .find({ currentOwner: owner }, { projection: { _id: 0 } })
      .sort({ collectionId: 1, slot: 1 })
      .toArray()
  }

  async findPendingAdProjections(creator: string): Promise<AdProjection[]> {
    return await this.adProjections
      .find({ creator, proposalStatus: 'pending' }, { projection: { _id: 0 } })
      .sort({ collectionId: 1, slot: 1 })
      .toArray()
  }

  async findCollectionProjection(collectionId: string): Promise<CollectionProjection | null> {
    return await this.collectionProjections.findOne(
      { collectionId },
      { projection: { _id: 0 } }
    )
  }

  async searchCollectionProjections(
    where: Record<string, unknown>,
    limit: number
  ): Promise<CollectionProjection[]> {
    return await this.collectionProjections
      .find(where, { projection: { _id: 0 } })
      .sort({ collectionId: 1 })
      .limit(limit)
      .toArray()
  }

  async searchAdProjections(
    where: Record<string, unknown>,
    limit: number
  ): Promise<AdProjection[]> {
    return await this.adProjections
      .find(where, { projection: { _id: 0 } })
      .sort({ collectionId: 1, slot: 1 })
      .limit(limit)
      .toArray()
  }

  async staleProjectionCount(version: number): Promise<number> {
    return await this.adProjections.countDocuments({
      derivationVersion: { $ne: version }
    })
  }
}

/**
 * The update an admission applies to its row.
 *
 * `$setOnInsert` and `$set` must not name the same field, so position is
 * removed from the admission half and written by the other. On insert `$set`
 * still applies, so a first admission carrying a proof records its position
 * exactly as before.
 */
export const outputUpsert = (
  record: AdmittedOutputRecord
): { $setOnInsert: Omit<AdmittedOutputRecord, 'blockHeight' | 'transactionIndex'>
  $set?: { blockHeight?: number; transactionIndex?: number } } => {
  const { blockHeight, transactionIndex, ...admission } = record
  const position = {
    ...(blockHeight === undefined ? {} : { blockHeight }),
    ...(transactionIndex === undefined ? {} : { transactionIndex })
  }
  return {
    $setOnInsert: admission,
    ...(Object.keys(position).length > 0 && { $set: position })
  }
}

export const transactionPosition = (
  tx: Transaction
): { blockHeight?: number; transactionIndex?: number } => {
  const merklePath = tx.merklePath
  if (!merklePath) return {}
  const leaf = merklePath.path[0]?.find((entry) => entry.hash === tx.id('hex'))
  return {
    blockHeight: merklePath.blockHeight,
    ...(leaf ? { transactionIndex: leaf.offset } : {})
  }
}
