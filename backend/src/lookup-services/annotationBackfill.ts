import { Transaction } from '@bsv/sdk'
import type { AdinalsStorageLike, AdmittedOutputRecord } from './AdinalsStorage.js'
import {
  classifyAgainstPredecessor,
  listingAnnotations,
  predecessorOutpointOf,
  recordScope
} from './admissionClassification.js'

export type AnnotationBackfillReport = {
  scanned: number
  annotated: number
  unresolved: string[]
}

const outpoint = (record: Pick<AdmittedOutputRecord, 'txid' | 'outputIndex'>): string =>
  `${record.txid}_${record.outputIndex}`

/** Predecessors before successors, so an inherited scope is always available. */
const chainOrder = (left: AdmittedOutputRecord, right: AdmittedOutputRecord): number =>
  (left.blockHeight ?? Number.MAX_SAFE_INTEGER) - (right.blockHeight ?? Number.MAX_SAFE_INTEGER) ||
  (left.transactionIndex ?? Number.MAX_SAFE_INTEGER) -
    (right.transactionIndex ?? Number.MAX_SAFE_INTEGER) ||
  left.outputIndex - right.outputIndex

/**
 * Adds scope and lifecycle annotations to rows admitted before they existed.
 *
 * `storeOutput` upserts with `$setOnInsert`, so an already-present row never
 * gains a field by being re-submitted; the annotation has to be written
 * explicitly. This reads evidence only to recover what the admission path can
 * now derive directly, and is idempotent — a second run annotates nothing.
 */
export const backfillAnnotations = async (
  storage: AdinalsStorageLike
): Promise<AnnotationBackfillReport> => {
  const records = [...await storage.findAllRecords()].sort(chainOrder)
  const known = new Map(records.map((record) => [outpoint(record), { ...record }]))
  const report: AnnotationBackfillReport = { scanned: records.length, annotated: 0, unresolved: [] }

  for (const record of records) {
    const key = outpoint(record)
    const current = known.get(key) as AdmittedOutputRecord
    const annotations: Partial<AdmittedOutputRecord> = {}

    const scope = recordScope(record.recordType, key, record.map)
    if (scope.collectionId && !current.collectionId) annotations.collectionId = scope.collectionId
    if (scope.adOrigin && !current.adOrigin) annotations.adOrigin = scope.adOrigin

    const spendShaped = record.outputIndex === 0 &&
      (record.recordType === 'state' || record.recordType === 'listing')

    if (spendShaped) {
      let tx: Transaction | null = null
      try {
        tx = Transaction.fromBEEF(record.atomicBEEF)
      } catch {
        report.unresolved.push(`${key} (unparseable BEEF)`)
      }

      if (tx) {
        const predecessorOutpoint = predecessorOutpointOf(tx)
        if (predecessorOutpoint && !current.predecessorOutpoint) {
          annotations.predecessorOutpoint = predecessorOutpoint
        }
        const predecessor = known.get(predecessorOutpoint)
        if (!predecessor) {
          report.unresolved.push(`${key} (predecessor ${predecessorOutpoint || 'unknown'} absent)`)
        } else {
          const lifecycle = classifyAgainstPredecessor(tx, predecessor)
          if (!lifecycle) {
            report.unresolved.push(`${key} (unclassifiable against ${predecessorOutpoint})`)
          } else {
            if (!current.lifecycleKind) annotations.lifecycleKind = lifecycle.kind
            if (lifecycle.collectionId && !current.collectionId) {
              annotations.collectionId = lifecycle.collectionId
            }
            if (lifecycle.adOrigin && !current.adOrigin) {
              annotations.adOrigin = lifecycle.adOrigin
            }
          }
        }

        if (record.recordType === 'listing' && current.listingSuffix === undefined) {
          const output = tx.outputs[record.outputIndex]
          const terms = output ? listingAnnotations(output.lockingScript) : null
          if (terms) Object.assign(annotations, terms)
        }
      }
    }

    if (Object.keys(annotations).length > 0) {
      await storage.annotateOutput(record.txid, record.outputIndex, annotations)
      known.set(key, { ...current, ...annotations })
      report.annotated += 1
    }
  }

  return report
}
