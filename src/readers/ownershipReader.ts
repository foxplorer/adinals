import { Transaction, type WalletInterface } from '@bsv/sdk'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import {
  parseProtocolOutpoint,
  validateSpendLinkedRecord,
} from '../protocol/transitions.ts'
import { reconstructChains } from './adinalsChain.ts'
import {
  readCollectionAds,
  readCollectionSubmissions,
  readIndexedRecord,
  type IndexedAdinalsRecord,
} from './adinalsIndex.ts'
import { readOwnedCustody, type CustodyWallet } from './ownedCustody.ts'
import {
  assembleOwnership,
  emptyIndexSnapshot,
  type IndexSnapshot,
  type OwnershipModel,
} from './ownershipModel.ts'
import {
  createRawTransactionReader,
  readRawTransaction as sharedRawTransactionReader,
  type RawTransactionReader,
} from './rawTransactions.ts'

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Proves an update really spends the Adinal it claims to, from immutable raw
 * transactions rather than the indexer's word. A record whose proof cannot be
 * obtained stays unproven, and the model treats unproven as invalid.
 */
async function proveTransition(
  readRawTransaction: RawTransactionReader,
  recordOutpoint: string,
  predecessorOutpoint: string,
) {
  const record = parseProtocolOutpoint(recordOutpoint)
  const predecessor = parseProtocolOutpoint(predecessorOutpoint)
  if (!record || !predecessor) return null
  const [transaction, predecessorTransaction] = await Promise.all([
    readRawTransaction(record.txid),
    readRawTransaction(predecessor.txid),
  ])
  return validateSpendLinkedRecord(
    transaction as Transaction,
    predecessorTransaction as Transaction,
    predecessor.normalized,
    record.normalized,
  )
}

export type OwnershipReadOptions = {
  basket?: string
  fetcher?: typeof fetch
  readRawTransaction?: RawTransactionReader
  now?: Date
}

type OwnershipWallet = CustodyWallet & Partial<Pick<WalletInterface, 'listActions'>>

async function retainedNoSendTxids(wallet: OwnershipWallet): Promise<Set<string>> {
  if (typeof wallet.listActions !== 'function') return new Set()
  try {
    const result = await wallet.listActions({
      labels: [ADINALS_NAMESPACE.actionLabel],
      labelQueryMode: 'all',
      limit: 100,
    })
    return new Set(
      result.actions
        .filter((action) => action.status === 'nosend' && action.txid)
        .map((action) => action.txid as string),
    )
  } catch {
    // Some wallets permit basket reads but not action-history reads. Ownership
    // still works; it just cannot suppress lookups for retained rehearsals.
    return new Set()
  }
}

/**
 * Reads everything this wallet owns and joins it to verified public history.
 *
 * Read-only: it enumerates the basket, queries the public index, fetches raw
 * transactions, and validates. It never creates, signs, aborts, internalizes,
 * or broadcasts anything.
 */
export async function readOwnership(
  wallet: OwnershipWallet,
  options: OwnershipReadOptions = {},
): Promise<OwnershipModel> {
  const fetcher = options.fetcher ?? fetch
  const readRawTransaction = options.readRawTransaction
    ?? (options.fetcher ? undefined : sharedRawTransactionReader)
    ?? createRawTransactionReader(fetcher)
  const basket = options.basket ?? ADINALS_NAMESPACE.basket

  const [custody, noSendTxids] = await Promise.all([
    readOwnedCustody(wallet, basket),
    retainedNoSendTxids(wallet),
  ])
  const snapshot = emptyIndexSnapshot()
  const notices: string[] = []

  // Discovery is best-effort: a wallet's own custody must still render when
  // the public index is unreachable, so every network step degrades instead
  // of failing the whole read.
  const collectionOrigins = custody.outputs
    .filter((output) => output.kind === 'collection')
    .map((output) => output.outpoint)

  const lookups = new Set<string>([
    ...collectionOrigins,
    ...custody.outputs
      .filter((output) => output.kind === 'mint' || output.kind === 'state' || output.kind === 'listing')
      .map((output) => output.outpoint),
  ])

  await Promise.all([...lookups].filter(
    (outpoint) => !noSendTxids.has(outpoint.split(/[._]/)[0] ?? ''),
  ).map(async (outpoint) => {
    try {
      const record = await readIndexedRecord(outpoint, fetcher)
      if (record) snapshot.byOutpoint.set(outpoint, record)
    } catch (error) {
      notices.push(`Index lookup for ${outpoint.slice(0, 12)}… failed: ${errorMessage(error)}`)
    }
  }))

  await Promise.all(collectionOrigins.map(async (origin) => {
    const [submissions, ads] = await Promise.allSettled([
      readCollectionSubmissions(origin, fetcher),
      readCollectionAds(origin, fetcher),
    ])

    if (submissions.status === 'fulfilled') snapshot.submissions.set(origin, submissions.value)
    else notices.push(`Submissions for collection ${origin.slice(0, 12)}… are unavailable: ${errorMessage(submissions.reason)}`)

    if (ads.status === 'fulfilled') {
      snapshot.ads.set(origin, ads.value)
      // The MAP search returns every txo on each ad's chain, so ownership
      // history is rebuilt here without further requests.
      for (const [adOrigin, chain] of reconstructChains(ads.value)) {
        snapshot.chains.set(adOrigin, chain.ownershipOutpoints)
        for (const row of chain.chain) snapshot.byOutpoint.set(row.outpoint, row)
      }
    } else {
      notices.push(`Ads for collection ${origin.slice(0, 12)}… are unavailable: ${errorMessage(ads.reason)}`)
    }
  }))

  const updates: IndexedAdinalsRecord[] = [...snapshot.submissions.values()].flatMap(
    (entry) => entry.updates,
  )
  await Promise.all(updates.map(async (update) => {
    const predecessor = String(update.map.adOutpoint ?? '')
    if (!predecessor) return
    try {
      const proof = await proveTransition(readRawTransaction, update.origin, predecessor)
      if (proof) snapshot.transitions.set(update.origin, proof)
    } catch (error) {
      notices.push(`Update ${update.origin.slice(0, 12)}… could not be independently proven: ${errorMessage(error)}`)
    }
  }))

  const model = assembleOwnership(custody, snapshot, options.now)
  return { ...model, notices: [...model.notices, ...notices] }
}

export type { IndexSnapshot, OwnershipModel }
