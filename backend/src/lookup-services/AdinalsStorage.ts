import type { Collection, Db } from 'mongodb'
import { Transaction } from '@bsv/sdk'
import {
  inspectAdinalsTransactionOutput,
  type AdinalsRecordSubtype
} from '../protocol/recordEnvelope.js'

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
}

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
  findOutputs(
    limit: number,
    recordType?: AdinalsOutputType
  ): Promise<Array<{ txid: string; outputIndex: number }>>
  findOutput(
    txid: string,
    outputIndex: number
  ): Promise<{ txid: string; outputIndex: number; recordType?: AdinalsOutputType } | null>
  findRecords(recordType: AdinalsRecordSubtype): Promise<AdmittedOutputRecord[]>
  findAllRecords(): Promise<AdmittedOutputRecord[]>
}

export class AdinalsStorage implements AdinalsStorageLike {
  private readonly outputs: Collection<AdmittedOutputRecord>

  constructor(db: Db) {
    this.outputs = db.collection<AdmittedOutputRecord>('adinals_outputs')
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

  async storeOutput(record: AdmittedOutputRecord): Promise<void> {
    await this.outputs.updateOne(
      { txid: record.txid, outputIndex: record.outputIndex },
      {
        $setOnInsert: record
      },
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

  async findRecords(recordType: AdinalsRecordSubtype): Promise<AdmittedOutputRecord[]> {
    return await this.outputs.find({ recordType }).toArray()
  }

  async findAllRecords(): Promise<AdmittedOutputRecord[]> {
    return await this.outputs.find({}).toArray()
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
