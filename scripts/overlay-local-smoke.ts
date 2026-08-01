import { readFile } from 'node:fs/promises'
import { Beef, Transaction } from '@bsv/sdk'
import { parseGorillaPoolTransactionProof } from '../src/readers/rawTransactions.ts'

const endpoint = (process.env.ADINALS_OVERLAY_URL ?? 'http://localhost:8080')
  .replace(/\/$/, '')

type Steak = Record<string, {
  outputsToAdmit: number[]
  coinsToRetain: number[]
}>

type LifecycleFixture = {
  collection: { origin: string }
  ads: Array<{
    origin: string
    ownershipOutpoints: string[]
    listing: { outpoint: string }
    purchase: { outpoint: string }
    update: {
      transitionTxid: string
      predecessorOutpoint: string
      successorOutpoint: string
      recordOutpoint: string
    }
    decision: { outpoint: string }
    expected: {
      currentOutpoint: string
      creativeSourceOutpoint: string
    }
  }>
}

const txidOf = (outpoint: string): string => outpoint.split('_')[0] as string

const submit = async (beef: number[] | Uint8Array): Promise<Steak> => {
  const response = await fetch(`${endpoint}/submit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-topics': JSON.stringify(['tm_adinals'])
    },
    body: Uint8Array.from(beef)
  })
  const body = await response.json() as Steak & { message?: string }
  if (!response.ok) throw new Error(body.message ?? `submit failed: ${response.status}`)
  return body
}

const outputLookup = async (origin: string): Promise<Transaction | null> => {
  const response = await fetch(`${endpoint}/lookup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      service: 'ls_adinals',
      query: { type: 'output', version: 1, origin }
    })
  })
  const lookup = await response.json() as {
    type?: string
    outputs?: Array<{ beef: number[]; outputIndex: number }>
    message?: string
  }
  if (!response.ok) throw new Error(lookup.message ?? `output lookup failed: ${origin}`)
  const expectedIndex = Number(origin.split('_')[1])
  const candidate = lookup.outputs?.find(({ beef, outputIndex }) =>
    outputIndex === expectedIndex && Transaction.fromBEEF(beef).id('hex') === txidOf(origin)
  )
  return candidate ? Transaction.fromBEEF(candidate.beef) : null
}

const waitForOutput = async (origin: string): Promise<Transaction> => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const transaction = await outputLookup(origin)
    if (transaction) return transaction
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`${origin} was neither admitted nor visible after 10 seconds`)
}

const formulaLookup = async (query: Record<string, unknown>): Promise<string[]> => {
  const response = await fetch(`${endpoint}/lookup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      service: 'ls_adinals',
      query: { version: 1, ...query }
    })
  })
  const body = await response.json() as {
    outputs?: Array<{ beef: number[]; outputIndex: number }>
    message?: string
  }
  if (!response.ok) throw new Error(body.message ?? `lookup failed: ${String(query.type)}`)
  return (body.outputs ?? []).map(({ beef, outputIndex }) =>
    `${Transaction.fromBEEF(beef).id('hex')}_${outputIndex}`
  )
}

const historyLookup = (origin: string): Promise<string[]> =>
  formulaLookup({ type: 'history', origin })

const currentLookup = (origin: string): Promise<string[]> =>
  formulaLookup({ type: 'adCurrent', origin })

const developmentFixture = JSON.parse(await readFile(
  'tests/fixtures/collections/published-mainnet-yours-446af364.json',
  'utf8'
)) as { atomicBeef: { data: string } }
const rejected = await submit(Buffer.from(
  developmentFixture.atomicBeef.data,
  'base64'
))
if (rejected.tm_adinals?.outputsToAdmit.length !== 0) {
  throw new Error('development namespace was unexpectedly admitted')
}

const lifecycle = JSON.parse(await readFile(
  'tests/fixtures/overlay/production-lifecycle-b70c33ad.json',
  'utf8'
)) as LifecycleFixture

const proofCache = new Map<string, Transaction>()
const provenTransaction = async (txid: string): Promise<Transaction> => {
  const cached = proofCache.get(txid)
  if (cached) return cached
  const proofResponse = await fetch(
    `https://ordinals.gorillapool.io/api/tx/${txid}`,
    { headers: { accept: 'application/octet-stream' } }
  )
  if (!proofResponse.ok) {
    throw new Error(`GorillaPool proof request failed: ${proofResponse.status}`)
  }
  const transaction = parseGorillaPoolTransactionProof(
    new Uint8Array(await proofResponse.arrayBuffer())
  )
  if (transaction.id('hex') !== txid || !transaction.merklePath) {
    throw new Error(`production proof failed its local identity check: ${txid}`)
  }
  proofCache.set(txid, transaction)
  return transaction
}

/**
 * A proof for the current confirmed transaction normally makes its inputs
 * redundant in BEEF. The Topic Manager still needs the immediate predecessor
 * script for Adinals continuity, so reconciliation uses a valid regular BEEF
 * containing both independently proven transactions.
 */
const withPredecessorEvidence = (
  current: Transaction,
  predecessor: Transaction
): number[] => {
  const beef = new Beef()
  beef.mergeBeef(predecessor.toBEEF())
  beef.mergeBeef(current.toBEEF())
  if (!beef.isValid()) throw new Error('combined lifecycle BEEF is invalid')
  return beef.toBinary()
}

let newlyAdmittedTransactions = 0
let alreadyPresentTransactions = 0
const submitAndVerify = async (
  txid: string,
  outputIndexes: number[],
  predecessorTxid?: string
): Promise<void> => {
  const transaction = await provenTransaction(txid)
  const beef = predecessorTxid
    ? withPredecessorEvidence(transaction, await provenTransaction(predecessorTxid))
    : transaction.toBEEF()
  const result = await submit(beef)
  const admitted = result.tm_adinals?.outputsToAdmit ?? []
  const expected = [...outputIndexes].sort((left, right) => left - right)
  if (admitted.length > 0 && JSON.stringify(admitted) !== JSON.stringify(expected)) {
    throw new Error(`${txid} returned unexpected admission indexes`)
  }
  if (admitted.length > 0) newlyAdmittedTransactions += 1
  else alreadyPresentTransactions += 1

  for (const outputIndex of outputIndexes) {
    const origin = `${txid}_${outputIndex}`
    await waitForOutput(origin)
  }
}

const collectionTxid = txidOf(lifecycle.collection.origin)
await submitAndVerify(collectionTxid, [0])

for (const ad of lifecycle.ads) {
  const mintTxid = txidOf(ad.origin)
  const listingTxid = txidOf(ad.listing.outpoint)
  const purchaseTxid = txidOf(ad.purchase.outpoint)
  const updateTxid = ad.update.transitionTxid
  const decisionTxid = txidOf(ad.decision.outpoint)

  await submitAndVerify(mintTxid, [0])
  await submitAndVerify(listingTxid, [0], mintTxid)
  await submitAndVerify(purchaseTxid, [0], listingTxid)
  await submitAndVerify(updateTxid, [0, 1], purchaseTxid)
  await submitAndVerify(decisionTxid, [0])

  for (const outpoint of [
    ...ad.ownershipOutpoints,
    ad.update.recordOutpoint,
    ad.decision.outpoint
  ]) {
    await waitForOutput(outpoint)
  }

  const expectedHistory = [
    lifecycle.collection.origin,
    ...ad.ownershipOutpoints,
    ad.update.recordOutpoint,
    ad.decision.outpoint
  ]
  const resolvedHistory = await historyLookup(ad.origin)
  if (JSON.stringify(resolvedHistory) !== JSON.stringify(expectedHistory)) {
    throw new Error(`semantic history mismatch: ${ad.origin}`)
  }
  const expectedCurrent = [
    lifecycle.collection.origin,
    ...ad.ownershipOutpoints,
    ad.expected.creativeSourceOutpoint,
    ad.decision.outpoint
  ]
  const resolvedCurrent = await currentLookup(ad.origin)
  if (JSON.stringify(resolvedCurrent) !== JSON.stringify(expectedCurrent)) {
    throw new Error(`current creative mismatch: ${ad.origin}`)
  }
}

const adsResponse = await fetch(`${endpoint}/lookup`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    service: 'ls_adinals',
    query: {
      type: 'adsByCollection',
      version: 1,
      collectionId: lifecycle.collection.origin
    }
  })
})
const ads = await adsResponse.json() as {
  outputs?: Array<{ beef: number[]; outputIndex: number }>
  message?: string
}
if (!adsResponse.ok) throw new Error(ads.message ?? 'mint lookup failed')
for (const ad of lifecycle.ads) {
  if (!ads.outputs?.some((candidate) =>
    candidate.outputIndex === 0 &&
    Transaction.fromBEEF(candidate.beef).id('hex') === txidOf(ad.origin)
  )) throw new Error(`production mint did not resolve: ${ad.origin}`)
}

const expectedCollectionLive = [
  lifecycle.collection.origin,
  ...lifecycle.ads.flatMap((ad) => [
    ...ad.ownershipOutpoints,
    ad.expected.creativeSourceOutpoint,
    ad.decision.outpoint
  ])
]
const collectionLive = await formulaLookup({
  type: 'collectionLive',
  origin: lifecycle.collection.origin
})
const collectionLiveSet = new Set(collectionLive)
const missingCollectionLiveProofs = expectedCollectionLive.filter((outpoint) =>
  !collectionLiveSet.has(outpoint)
)
if (missingCollectionLiveProofs.length > 0) {
  throw new Error(
    `collection-wide live proof is missing fixture evidence: ${missingCollectionLiveProofs.join(', ')}`
  )
}

const pendingDecisions = await formulaLookup({
  type: 'pendingDecisions',
  creator: '1GJ7dV4brVtxKv8nsKreMxKCjkpYsEcF3b'
})
const approvedFixtureUpdates = new Set(lifecycle.ads.map((ad) => ad.update.recordOutpoint))
if (pendingDecisions.some((outpoint) => approvedFixtureUpdates.has(outpoint))) {
  throw new Error('already-approved production updates appeared as pending')
}

console.log(JSON.stringify({
  endpoint,
  rejectedDevelopmentNamespace: true,
  productionCollection: lifecycle.collection.origin,
  verifiedLifecycleAds: lifecycle.ads.map(({ origin }) => origin),
  newlyAdmittedTransactions,
  alreadyPresentTransactions,
  retainedLifecycleOutputsVerified: true,
  semanticHistoriesVerified: true,
  currentCreativeProofsVerified: true,
  collectionLiveProofsVerified: true,
  collectionLiveOutputCount: collectionLive.length,
  pendingDecisionResolutionVerified: true,
  pendingDecisionOutputCount: pendingDecisions.length
}))
