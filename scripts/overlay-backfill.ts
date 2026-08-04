import { Beef, Transaction } from '@bsv/sdk'
import {
  readIndexedAdinalsSummary,
  type IndexedAdinalsRecord
} from '../src/readers/adinalsIndex.ts'
import { parseGorillaPoolTransactionProof } from '../src/readers/rawTransactions.ts'

const endpoint = (process.env.ADINALS_OVERLAY_URL ?? 'http://localhost:8080')
  .replace(/\/$/, '')
const dryRun = process.argv.includes('--dry-run')
const collectionArgument = process.argv.find((argument) =>
  argument.startsWith('--collection=')
)?.slice('--collection='.length).replace('.', '_')

if (collectionArgument && !/^[0-9a-f]{64}_\d+$/i.test(collectionArgument)) {
  throw new Error('--collection must be an immutable outpoint')
}

const outpointTxid = (outpoint: string): string =>
  outpoint.replace('.', '_').split('_')[0] as string
const normalizedOutpoint = (outpoint: string): string => outpoint.replace('.', '_')

const collectionIdOf = (row: IndexedAdinalsRecord): string => {
  const raw = row.map.subTypeData
  if (raw && typeof raw === 'object') {
    const collectionId = (raw as { collectionId?: unknown }).collectionId
    return typeof collectionId === 'string' ? normalizedOutpoint(collectionId) : ''
  }
  try {
    const data = JSON.parse(String(raw ?? '')) as {
      collectionId?: unknown
    }
    return typeof data.collectionId === 'string'
      ? normalizedOutpoint(data.collectionId)
      : ''
  } catch {
    return ''
  }
}

const uniqueOrigins = (rows: readonly IndexedAdinalsRecord[]): IndexedAdinalsRecord[] => {
  const byOrigin = new Map<string, IndexedAdinalsRecord>()
  for (const row of rows) {
    const origin = normalizedOutpoint(row.origin)
    const existing = byOrigin.get(origin)
    if (!existing || normalizedOutpoint(row.outpoint) === origin) {
      byOrigin.set(origin, row)
    }
  }
  return [...byOrigin.values()]
}

type ChainTransition = {
  txid: string
  predecessorTxid: string
  successorOutpoint: string
}

const confirmedChain = (
  origin: string,
  rows: readonly IndexedAdinalsRecord[]
): { transitions: ChainTransition[]; unresolvedSpend: string } => {
  const history = rows.filter((row) => normalizedOutpoint(row.origin) === origin)
  let current = history.find((row) => normalizedOutpoint(row.outpoint) === origin)
  const transitions: ChainTransition[] = []
  const visited = new Set<string>()

  while (current?.spend && !visited.has(normalizedOutpoint(current.outpoint))) {
    visited.add(normalizedOutpoint(current.outpoint))
    const spendTxid = outpointTxid(current.spend)
    const next = history.find((row) => outpointTxid(row.outpoint) === spendTxid)
    if (!next || next.height === null) {
      return { transitions, unresolvedSpend: spendTxid }
    }
    transitions.push({
      txid: spendTxid,
      predecessorTxid: outpointTxid(current.outpoint),
      successorOutpoint: normalizedOutpoint(next.outpoint)
    })
    current = next
  }
  return { transitions, unresolvedSpend: '' }
}

const summary = await readIndexedAdinalsSummary()
const collectionRows = uniqueOrigins(summary.collections).filter((row) =>
  !collectionArgument || normalizedOutpoint(row.origin) === collectionArgument
)
const collectionOrigins = new Set(collectionRows.map((row) => normalizedOutpoint(row.origin)))
const mintRows = uniqueOrigins(summary.ads).filter((row) =>
  collectionOrigins.has(collectionIdOf(row))
)
const updateRows = uniqueOrigins(summary.updates).filter((row) =>
  collectionOrigins.has(normalizedOutpoint(String(row.map.collectionId ?? '')))
)
const decisionRows = uniqueOrigins(summary.decisions).filter((row) =>
  collectionOrigins.has(normalizedOutpoint(String(row.map.collectionId ?? '')))
)
const updateTransitionTxids = new Set(updateRows.map((row) =>
  String(row.map.transitionTxid ?? outpointTxid(row.origin))
))

const chains = mintRows.map((mint) => ({
  origin: normalizedOutpoint(mint.origin),
  ...confirmedChain(normalizedOutpoint(mint.origin), summary.ads)
}))
const transitions = chains.flatMap((chain) => chain.transitions)
const unresolvedSpends = chains
  .filter((chain) => chain.unresolvedSpend)
  .map((chain) => ({ origin: chain.origin, spendTxid: chain.unresolvedSpend }))

const discovery = {
  endpoint,
  scope: collectionArgument ?? 'all-production-v3',
  collections: collectionRows.length,
  mints: mintRows.length,
  lifecycleTransitions: transitions.length,
  updates: updateRows.length,
  decisions: decisionRows.length,
  unresolvedConfirmedSpendLinks: unresolvedSpends
}

if (dryRun) {
  console.log(JSON.stringify({ dryRun: true, ...discovery }))
  process.exit(0)
}

type Steak = Record<string, {
  outputsToAdmit: number[]
  coinsToRetain: number[]
}>

const proofCache = new Map<string, Transaction>()
const provenTransaction = async (txid: string): Promise<Transaction> => {
  const cached = proofCache.get(txid)
  if (cached) return cached
  const response = await fetch(`https://ordinals.gorillapool.io/api/tx/${txid}`, {
    headers: { accept: 'application/octet-stream' }
  })
  if (!response.ok) throw new Error(`proof request failed for ${txid}: ${response.status}`)
  const transaction = parseGorillaPoolTransactionProof(
    new Uint8Array(await response.arrayBuffer())
  )
  if (transaction.id('hex') !== txid || !transaction.merklePath) {
    throw new Error(`proof identity failed for ${txid}`)
  }
  proofCache.set(txid, transaction)
  return transaction
}

const submit = async (beef: number[]): Promise<Steak> => {
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

const lookupExists = async (origin: string): Promise<boolean> => {
  const response = await fetch(`${endpoint}/lookup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      service: 'ls_adinals',
      query: { type: 'output', version: 1, origin }
    })
  })
  if (!response.ok) return false
  const body = await response.json() as {
    outputs?: Array<{ beef: number[]; outputIndex: number }>
  }
  const expectedTxid = outpointTxid(origin)
  const expectedIndex = Number(normalizedOutpoint(origin).split('_')[1])
  return Boolean(body.outputs?.some(({ beef, outputIndex }) =>
    outputIndex === expectedIndex && Transaction.fromBEEF(beef).id('hex') === expectedTxid
  ))
}

const waitForOutput = async (origin: string): Promise<void> => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await lookupExists(origin)) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`output was not visible after submission: ${origin}`)
}

const packaged = async (txid: string, predecessorTxid?: string): Promise<number[]> => {
  const current = await provenTransaction(txid)
  if (!predecessorTxid) return current.toBEEF()
  // `mergeBeef` folds in serialized bytes and drops the merkle paths those
  // transactions carried, so the engine then refuses the package for a missing
  // source transaction. `mergeTransaction` keeps each proof attached to its
  // transaction. This is the same lesson the wallet repair path already
  // learned: a proof survives only if the thing carrying it is merged whole.
  const beef = new Beef()
  beef.mergeTransaction(await provenTransaction(predecessorTxid))
  beef.mergeTransaction(current)
  if (!beef.isValid()) throw new Error(`combined BEEF is invalid: ${txid}`)
  return beef.toBinary()
}

let newlyAdmitted = 0
let alreadyPresent = 0
const failures: Array<{ txid: string; error: string }> = []
/**
 * A record the chain has confirmed but no proof is available for yet. This is
 * not a failure: the confirmed-only backfill correctly declines to submit
 * evidence it cannot anchor, and a later run picks the record up.
 */
const unproven: Array<{ txid: string; reason: string }> = []
const proofUnavailable = /proof (request|identity) failed/
const submitOne = async (
  txid: string,
  expectedOutpoints: string[],
  predecessorTxid?: string
): Promise<void> => {
  try {
    const result = await submit(await packaged(txid, predecessorTxid))
    if ((result.tm_adinals?.outputsToAdmit.length ?? 0) > 0) newlyAdmitted += 1
    else alreadyPresent += 1
    for (const origin of expectedOutpoints) await waitForOutput(origin)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (proofUnavailable.test(message)) {
      unproven.push({ txid, reason: message })
      return
    }
    failures.push({ txid, error: message })
  }
}

for (const collection of collectionRows) {
  const origin = normalizedOutpoint(collection.origin)
  await submitOne(outpointTxid(origin), [origin])
}
for (const mint of mintRows) {
  const origin = normalizedOutpoint(mint.origin)
  await submitOne(outpointTxid(origin), [origin])
}
for (const transition of transitions) {
  const expected = [`${transition.txid}_0`]
  if (updateTransitionTxids.has(transition.txid)) expected.push(`${transition.txid}_1`)
  await submitOne(transition.txid, expected, transition.predecessorTxid)
}
for (const decision of decisionRows) {
  const origin = normalizedOutpoint(decision.origin)
  await submitOne(outpointTxid(origin), [origin])
}

const result = {
  dryRun: false,
  ...discovery,
  newlyAdmitted,
  alreadyPresent,
  unproven,
  failures
}
console.log(JSON.stringify(result))
if (failures.length > 0) process.exitCode = 1
