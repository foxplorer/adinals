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
import { inspectAdinalsTransactionOutput } from '../protocol/recordEnvelope.js'
import { resolveMintWinners } from './mintResolution.js'
import { classifyLifecycleTransition } from '../protocol/lifecycleRecords.js'
import {
  decodeEmbeddedP2PKH,
  decodeOrdLock,
  decodeP2PKH
} from '../protocol/scriptTemplates.js'
import {
  resolveAdCurrent,
  resolveAdHistory,
  resolveCollectionLiveEvidence,
  resolvePendingDecisionEvidence
} from './lifecycleResolution.js'

export class AdinalsLookupService implements LookupService {
  readonly admissionMode: AdmissionMode = 'whole-tx'
  readonly spendNotificationMode: SpendNotificationMode = 'whole-tx'

  constructor(public readonly storage: AdinalsStorageLike) {}

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
    const lifecycle = classifyLifecycleTransition(tx, [0])
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
    await this.storage.storeOutput({
      txid: tx.id('hex'),
      outputIndex: payload.outputIndex,
      atomicBEEF: payload.atomicBEEF,
      admittedAt: new Date(),
      recordType,
      ...(envelope.valid && envelope.map ? {
        signerAddress: envelope.signerAddress,
        map: envelope.map
      } : {}),
      ...(lifecycle ? {
        lifecycleKind: lifecycle.kind,
        predecessorOutpoint: lifecycle.predecessorOutpoint,
        ownerAddress: lifecycle.ownerAddress
      } : state ? { ownerAddress: state.address } : {}),
      ...(listing ? {
        ownerAddress: listing.seller,
        priceSatoshis: listing.priceSatoshis
      } : {}),
      ...position
    })
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

    if (query.type === 'adsByCollection' || query.type === 'ad') {
      const records = [
        ...await this.storage.findRecords('collection'),
        ...await this.storage.findRecords('collectionItem')
      ]
      let winners = resolveMintWinners(records)
      if (query.type === 'adsByCollection') {
        if (typeof query.collectionId !== 'string') {
          throw new Error('A collection origin is required')
        }
        winners = winners.filter((winner) => {
          try {
            const data = JSON.parse(winner.map?.subTypeData ?? '') as {
              collectionId?: unknown
            }
            return data.collectionId === query.collectionId
          } catch {
            return false
          }
        })
      } else {
        if (typeof query.origin !== 'string') throw new Error('An ad origin is required')
        winners = winners.filter(
          (winner) => `${winner.txid}_${winner.outputIndex}` === query.origin
        )
      }
      return winners.map(({ txid, outputIndex }) => ({ txid, outputIndex }))
    }

    if (query.type === 'history' || query.type === 'adCurrent') {
      if (typeof query.origin !== 'string') throw new Error('An ad origin is required')
      if (!/^([0-9a-f]{64})_(\d+)$/.test(query.origin)) {
        throw new Error('A valid ad origin is required')
      }
      const history = resolveAdHistory(await this.storage.findAllRecords(), query.origin)
      if (!history) return []
      const evidence = query.type === 'history'
        ? history.evidence
        : resolveAdCurrent(history).evidence
      return evidence.map(({ txid, outputIndex }) => ({ txid, outputIndex }))
    }

    if (query.type === 'collectionLive') {
      if (typeof query.origin !== 'string' || !/^([0-9a-f]{64})_(\d+)$/.test(query.origin)) {
        throw new Error('A valid collection origin is required')
      }
      const records = await this.storage.findAllRecords()
      return resolveCollectionLiveEvidence(records, query.origin)
        .map(({ txid, outputIndex }) => ({ txid, outputIndex }))
    }

    if (query.type === 'pendingDecisions') {
      if (typeof query.creator !== 'string' || !query.creator) {
        throw new Error('A creator address is required')
      }
      const records = await this.storage.findAllRecords()
      return resolvePendingDecisionEvidence(records, query.creator)
        .map(({ txid, outputIndex }) => ({ txid, outputIndex }))
    }

    throw new Error('Unknown query type')
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
      version: '0.2.0-history-current',
      informationURL: 'https://adinals.com/protocol'
    }
  }
}

export default (db: Db): AdinalsLookupService => {
  const storage = new AdinalsStorage(db)
  void storage.ensureIndexes().catch((error: unknown) => {
    console.error('Unable to initialize Adinals overlay indexes', error)
  })
  return new AdinalsLookupService(storage)
}
