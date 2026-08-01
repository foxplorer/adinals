import type { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { Beef, Transaction } from '@bsv/sdk'
import docs from './AdinalsTopicDocs.md.js'
import { collectionRecordErrors } from '../protocol/collectionRules.js'
import { mintCandidateErrors } from '../protocol/mintCandidate.js'
import { inspectAdinalsTransactionOutput } from '../protocol/recordEnvelope.js'
import {
  classifyLifecycleTransition,
  decisionCandidateErrors
} from '../protocol/lifecycleRecords.js'

const reject = (): AdmittanceInstructions => ({
  outputsToAdmit: [],
  coinsToRetain: []
})

/**
 * Admits self-contained records and successors whose exact input-0 ancestry is
 * already in the topic. Cross-record collection authority remains a lookup
 * concern because v3 metadata references do not spend their referenced rows.
 */
export default class AdinalsTopicManager implements TopicManager {
  async identifyAdmissibleOutputs(
    beef: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions> {
    let tx: Transaction
    try {
      tx = Transaction.fromBEEF(beef)
    } catch {
      return reject()
    }

    const packageBeef = Beef.fromBinary(beef)
    for (const inputIndex of previousCoins) {
      const input = tx.inputs[inputIndex]
      const sourceTxid = input?.sourceTXID ?? input?.sourceTransaction?.id('hex')
      if (input && !input.sourceTransaction && sourceTxid) {
        input.sourceTransaction = packageBeef.findTxid(sourceTxid)?.tx
      }
      if (!input?.sourceTransaction) {
        // The overlay interface promises source transactions for topical
        // predecessors. Refuse the submission rather than apply an
        // under-evidenced spend that an enriched retry would then hit as a
        // duplicate.
        throw new Error(`Topical input ${inputIndex} is missing its source transaction`)
      }
    }

    const outputsToAdmit: number[] = []
    for (let outputIndex = 0; outputIndex < tx.outputs.length; outputIndex += 1) {
      const record = inspectAdinalsTransactionOutput(tx, outputIndex)
      if (
        record.subType === 'collection' &&
        collectionRecordErrors(record).length === 0
      ) outputsToAdmit.push(outputIndex)
      else if (
        record.subType === 'collectionItem' &&
        mintCandidateErrors(record).length === 0
      ) outputsToAdmit.push(outputIndex)
      else if (
        record.subType === 'adDecision' &&
        decisionCandidateErrors(record).length === 0
      ) outputsToAdmit.push(outputIndex)
    }

    const lifecycle = classifyLifecycleTransition(tx, previousCoins)
    if (lifecycle) outputsToAdmit.push(...lifecycle.outputsToAdmit)

    if (outputsToAdmit.length === 0 && previousCoins.length === 0) {
      // @bsv/overlay records a non-throwing validation as an applied
      // transaction even when both arrays are empty. Throwing is therefore the
      // fail-closed rejection signal and keeps an evidence-enriched retry from
      // being mistaken for a duplicate.
      throw new Error('Transaction contains no admissible Adinals evidence')
    }

    return {
      outputsToAdmit: [...new Set(outputsToAdmit)].sort((left, right) => left - right),
      coinsToRetain: [...previousCoins]
    }
  }

  async identifyNeededInputs(beef: number[]): Promise<Array<{
    txid: string
    outputIndex: number
  }>> {
    const tx = Transaction.fromBEEF(beef)
    const input = tx.inputs[0]
    const txid = input?.sourceTXID ?? input?.sourceTransaction?.id('hex')
    if (!input || !txid || !tx.outputs[0] || tx.outputs[0].satoshis !== 1) {
      throw new Error('No possible input-0 Adinals transition')
    }
    return [{ txid, outputIndex: input.sourceOutputIndex }]
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
      name: 'Adinals v3 Topic Manager',
      shortDescription:
        'Admits verified records and input-0-linked Adinals lifecycle successors',
      version: '0.4.0-lifecycle-admission',
      informationURL: 'https://adinals.com/protocol'
    }
  }
}
