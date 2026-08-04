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
import type { AdProjection, CollectionProjection } from './projections.js'

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

  async findOutputRecord(
    txid: string,
    outputIndex: number
  ): Promise<Omit<AdmittedOutputRecord, 'atomicBEEF'> | null> {
    const record = this.outputs.get(`${txid}_${outputIndex}`)
    if (!record) return null
    const { atomicBEEF, ...metadata } = record
    return metadata
  }

  async annotateOutput(
    txid: string,
    outputIndex: number,
    annotations: Partial<AdmittedOutputRecord>
  ): Promise<void> {
    const key = `${txid}_${outputIndex}`
    const existing = this.outputs.get(key)
    if (existing) this.outputs.set(key, { ...existing, ...annotations })
  }

  async countOutputs(): Promise<number> {
    return this.outputs.size
  }

  async countUnscopedOutputs(): Promise<number> {
    return [...this.outputs.values()].filter((output) => !output.collectionId).length
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

  readonly adProjections = new Map<string, AdProjection>()
  readonly collectionProjections = new Map<string, CollectionProjection>()

  async findRecordsByCollection(collectionId: string): Promise<AdmittedOutputRecord[]> {
    return [...this.outputs.values()].filter((output) => output.collectionId === collectionId)
  }

  async replaceCollectionProjection(
    collectionId: string,
    collection: CollectionProjection | null,
    ads: AdProjection[]
  ): Promise<void> {
    for (const [key, ad] of [...this.adProjections]) {
      if (ad.collectionId === collectionId) this.adProjections.delete(key)
    }
    for (const ad of ads) this.adProjections.set(ad.adOrigin, ad)
    if (collection) this.collectionProjections.set(collectionId, collection)
    else this.collectionProjections.delete(collectionId)
  }

  async findAdProjection(adOrigin: string): Promise<AdProjection | null> {
    return this.adProjections.get(adOrigin) ?? null
  }

  async findAdProjectionsByCollection(collectionId: string): Promise<AdProjection[]> {
    return [...this.adProjections.values()]
      .filter((ad) => ad.collectionId === collectionId)
      .sort((left, right) => left.slot - right.slot)
  }

  async findAdProjectionsByOwner(owner: string): Promise<AdProjection[]> {
    return [...this.adProjections.values()].filter((ad) => ad.currentOwner === owner)
  }

  async findPendingAdProjections(creator: string): Promise<AdProjection[]> {
    return [...this.adProjections.values()]
      .filter((ad) => ad.creator === creator && ad.proposalStatus === 'pending')
  }

  async findCollectionProjection(collectionId: string): Promise<CollectionProjection | null> {
    return this.collectionProjections.get(collectionId) ?? null
  }

  private matches(document: Record<string, unknown>, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, value]) => {
      const actual = key.startsWith('map.')
        ? (document.map as Record<string, unknown> | undefined)?.[key.slice(4)]
        : document[key]
      return actual === value
    })
  }

  async searchCollectionProjections(
    where: Record<string, unknown>,
    limit: number
  ): Promise<CollectionProjection[]> {
    return [...this.collectionProjections.values()]
      .filter((collection) => this.matches(collection as unknown as Record<string, unknown>, where))
      .slice(0, limit)
  }

  async searchAdProjections(
    where: Record<string, unknown>,
    limit: number
  ): Promise<AdProjection[]> {
    return [...this.adProjections.values()]
      .filter((ad) => this.matches(ad as unknown as Record<string, unknown>, where))
      .slice(0, limit)
  }

  async staleProjectionCount(version: number): Promise<number> {
    return [...this.adProjections.values()]
      .filter((ad) => ad.derivationVersion !== version).length
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

const AD_ORIGIN = `${'1'.repeat(64)}_0`
const COLLECTION_ORIGIN = `${'2'.repeat(64)}_0`
const CURRENT_OUTPOINT = `${'3'.repeat(64)}_0`
const PENDING_UPDATE = `${'4'.repeat(64)}_1`
const CREATOR = 'creator-address'
const OWNER = 'owner-address'

const seededService = (): { service: AdinalsLookupService; storage: MemoryStorage } => {
  const storage = new MemoryStorage()
  storage.collectionProjections.set(COLLECTION_ORIGIN, {
    collectionId: COLLECTION_ORIGIN,
    creator: CREATOR,
    name: 'marathon signups',
    adPlacement: 'marathon.signups.v1',
    adFormat: 'text',
    adApproval: 'creator',
    map: { name: 'marathon signups', adPlacement: 'marathon.signups.v1', app: 'adinals' },
    adCount: 1,
    derivationVersion: 1
  })
  storage.adProjections.set(AD_ORIGIN, {
    adOrigin: AD_ORIGIN,
    collectionId: COLLECTION_ORIGIN,
    creator: CREATOR,
    slot: 1,
    currentOutpoint: CURRENT_OUTPOINT,
    currentOwner: OWNER,
    ownerEpoch: AD_ORIGIN,
    listed: false,
    adFormat: 'text',
    liveCreativeOutpoint: AD_ORIGIN,
    proposalStatus: 'pending',
    pendingUpdates: [PENDING_UPDATE],
    evidence: [COLLECTION_ORIGIN, AD_ORIGIN, CURRENT_OUTPOINT, PENDING_UPDATE],
    currentEvidence: [COLLECTION_ORIGIN, AD_ORIGIN, CURRENT_OUTPOINT],
    derivationVersion: 1
  })
  return { service: new AdinalsLookupService(storage), storage }
}

const ask = async (
  service: AdinalsLookupService,
  query: Record<string, unknown>
): Promise<string[]> =>
  (await service.lookup({ service: 'ls_adinals', query }))
    .map(({ txid, outputIndex }) => `${txid}_${outputIndex}`)

test('a collection projection is served from the derived layer', async () => {
  const { service } = seededService()
  assert.deepEqual(
    await ask(service, { type: 'collectionProjection', version: 1, origin: COLLECTION_ORIGIN }),
    [COLLECTION_ORIGIN, AD_ORIGIN, CURRENT_OUTPOINT, PENDING_UPDATE]
  )
})

test('an unknown collection answers empty rather than throwing', async () => {
  const { service } = seededService()
  assert.deepEqual(
    await ask(service, {
      type: 'collectionProjection', version: 1, origin: `${'9'.repeat(64)}_0`
    }),
    []
  )
})

test('adsByOwner returns the outpoint each owner currently holds', async () => {
  const { service } = seededService()
  assert.deepEqual(
    await ask(service, { type: 'adsByOwner', version: 1, owner: OWNER }),
    [CURRENT_OUTPOINT]
  )
  assert.deepEqual(
    await ask(service, { type: 'adsByOwner', version: 1, owner: 'someone-else' }),
    []
  )
})

test('collectionsByCreator is scoped to the signing creator', async () => {
  const { service } = seededService()
  assert.deepEqual(
    await ask(service, { type: 'collectionsByCreator', version: 1, creator: CREATOR }),
    [COLLECTION_ORIGIN]
  )
  assert.deepEqual(
    await ask(service, { type: 'collectionsByCreator', version: 1, creator: 'nobody' }),
    []
  )
})

test('pendingDecisions returns the creator\'s undecided proposals', async () => {
  const { service } = seededService()
  const answer = await ask(service, {
    type: 'pendingDecisions', version: 1, creator: CREATOR
  })
  assert.ok(answer.includes(PENDING_UPDATE))
  assert.ok(answer.includes(COLLECTION_ORIGIN))
  assert.deepEqual(
    await ask(service, { type: 'pendingDecisions', version: 1, creator: 'nobody' }),
    []
  )
})

test('search finds a collection by an arbitrary MAP label', async () => {
  const { service } = seededService()
  assert.deepEqual(
    await ask(service, {
      type: 'search', version: 1, where: { 'map.adPlacement': 'marathon.signups.v1' }
    }),
    [COLLECTION_ORIGIN]
  )
  assert.deepEqual(
    await ask(service, {
      type: 'search', version: 1, where: { 'map.adPlacement': 'something.else' }
    }),
    []
  )
})

test('search pairs a squattable label with the verified creator', async () => {
  const { service } = seededService()
  assert.deepEqual(
    await ask(service, {
      type: 'search',
      version: 1,
      where: { 'map.adPlacement': 'marathon.signups.v1', creator: CREATOR }
    }),
    [COLLECTION_ORIGIN]
  )
  // The same label claimed by anyone else is not this application's collection.
  assert.deepEqual(
    await ask(service, {
      type: 'search',
      version: 1,
      where: { 'map.adPlacement': 'marathon.signups.v1', creator: 'impostor' }
    }),
    []
  )
})

test('search can be scoped to ads', async () => {
  const { service } = seededService()
  assert.deepEqual(
    await ask(service, {
      type: 'search', version: 1, scope: 'ad', where: { proposalStatus: 'pending' }
    }),
    [CURRENT_OUTPOINT]
  )
})

test('search refuses a field that is not indexed', async () => {
  const { service } = seededService()
  await assert.rejects(
    service.lookup({
      service: 'ls_adinals',
      query: { type: 'search', version: 1, where: { adText: 'anything' } }
    }),
    /Unsupported search field "adText"/
  )
})

test('search refuses a non-scalar value and an empty where', async () => {
  const { service } = seededService()
  await assert.rejects(
    service.lookup({
      service: 'ls_adinals',
      query: { type: 'search', version: 1, where: { creator: { $ne: null } } }
    }),
    /accepts only a scalar value/
  )
  await assert.rejects(
    service.lookup({
      service: 'ls_adinals',
      query: { type: 'search', version: 1, where: {} }
    }),
    /at least one indexed field/
  )
})
