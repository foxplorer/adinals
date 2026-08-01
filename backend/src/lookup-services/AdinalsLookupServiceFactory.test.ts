import assert from 'node:assert/strict'
import test from 'node:test'
import type { OutputSpent } from '@bsv/overlay'
import { P2PKH, PrivateKey, Transaction } from '@bsv/sdk'
import {
  AdinalsLookupService
} from './AdinalsLookupServiceFactory.js'
import type {
  AdinalsOutputType,
  AdinalsStorageLike,
  AdmittedOutputRecord
} from './AdinalsStorage.js'
import type { AdinalsRecordSubtype } from '../protocol/recordEnvelope.js'

class MemoryStorage implements AdinalsStorageLike {
  readonly outputs = new Map<string, AdmittedOutputRecord>()

  async ensureIndexes(): Promise<void> {}

  async storeOutput(record: AdmittedOutputRecord): Promise<void> {
    this.outputs.set(`${record.txid}_${record.outputIndex}`, record)
  }

  async markOutputSpent(
    txid: string,
    outputIndex: number,
    spendingTxid: string,
    spentAt: Date
  ): Promise<void> {
    const key = `${txid}_${outputIndex}`
    const existing = this.outputs.get(key)
    if (existing) this.outputs.set(key, { ...existing, spentByTxid: spendingTxid, spentAt })
  }

  async evictOutput(txid: string, outputIndex: number): Promise<void> {
    this.outputs.delete(`${txid}_${outputIndex}`)
  }

  async countOutputs(): Promise<number> {
    return this.outputs.size
  }

  async findOutputs(
    limit: number,
    recordType?: AdinalsOutputType
  ): Promise<Array<{ txid: string; outputIndex: number }>> {
    return [...this.outputs.values()]
      .filter((output) => !recordType || output.recordType === recordType)
      .map(({ txid, outputIndex }) => ({ txid, outputIndex }))
      .sort((left, right) =>
        left.txid.localeCompare(right.txid) || left.outputIndex - right.outputIndex
      )
      .slice(0, limit)
  }

  async findOutput(
    txid: string,
    outputIndex: number
  ): Promise<{ txid: string; outputIndex: number; recordType?: AdinalsOutputType } | null> {
    const output = this.outputs.get(`${txid}_${outputIndex}`)
    return output ? {
      txid: output.txid,
      outputIndex: output.outputIndex,
      recordType: output.recordType
    } : null
  }

  async findRecords(recordType: AdinalsRecordSubtype): Promise<AdmittedOutputRecord[]> {
    return [...this.outputs.values()].filter(
      (output) => output.recordType === recordType
    )
  }

  async findAllRecords(): Promise<AdmittedOutputRecord[]> {
    return [...this.outputs.values()]
  }
}

const beefTransaction = (): Transaction => {
  const privateKey = PrivateKey.fromRandom()
  const tx = new Transaction()
  tx.addOutput({
    satoshis: 1,
    lockingScript: new P2PKH().lock(privateKey.toPublicKey().toAddress())
  })
  return tx
}

test('lookup requests whole transactions for admissions and spends', () => {
  const service = new AdinalsLookupService(new MemoryStorage())
  assert.equal(service.admissionMode, 'whole-tx')
  assert.equal(service.spendNotificationMode, 'whole-tx')
})

test('ordinary spend retains and annotates historical output', async () => {
  const storage = new MemoryStorage()
  const service = new AdinalsLookupService(storage)
  const admitted = beefTransaction()
  const txid = admitted.id('hex')

  await storage.storeOutput({
    txid,
    outputIndex: 0,
    atomicBEEF: admitted.toBEEF(),
    admittedAt: new Date(),
    recordType: 'collection'
  })

  const spending = beefTransaction()
  await service.outputSpent({
    mode: 'whole-tx',
    topic: 'tm_adinals',
    txid,
    outputIndex: 0,
    spendingAtomicBEEF: spending.toBEEF()
  } as OutputSpent)

  const retained = storage.outputs.get(`${txid}_0`)
  assert.ok(retained)
  assert.equal(retained.spentByTxid, spending.id('hex'))
  assert.equal(storage.outputs.size, 1)
})

test('status query returns a valid empty output-reference formula', async () => {
  const service = new AdinalsLookupService(new MemoryStorage())
  assert.deepEqual(
    await service.lookup({
      service: 'ls_adinals',
      query: { type: 'status', version: 1 }
    }),
    []
  )
})

test('collection queries return deterministic output references', async () => {
  const storage = new MemoryStorage()
  const service = new AdinalsLookupService(storage)
  const tx = beefTransaction()
  await storage.storeOutput({
    txid: tx.id('hex'),
    outputIndex: 0,
    atomicBEEF: tx.toBEEF(),
    admittedAt: new Date(),
    recordType: 'collection'
  })

  const expected = [{ txid: tx.id('hex'), outputIndex: 0 }]
  assert.deepEqual(
    await service.lookup({
      service: 'ls_adinals',
      query: { type: 'collections', version: 1 }
    }),
    expected
  )
  assert.deepEqual(
    await service.lookup({
      service: 'ls_adinals',
      query: { type: 'collection', version: 1, origin: `${tx.id('hex')}_0` }
    }),
    expected
  )
  assert.deepEqual(
    await service.lookup({
      service: 'ls_adinals',
      query: { type: 'output', version: 1, origin: `${tx.id('hex')}_0` }
    }),
    expected
  )
})
