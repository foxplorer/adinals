import { Beef, Transaction, type WalletInterface } from '@bsv/sdk'
import { ACTIVE_BASKET_CANDIDATES, ADINALS_NAMESPACE, ADINALS_OVERLAY_URL } from '../config/environment.ts'
import { ADINALS_PROTOCOL_VERSION } from '../protocol/collectionMetadata.ts'
import { decodeMapSet } from '../protocol/collectionScript.ts'
import { parseProtocolOutpoint } from '../protocol/transitions.ts'
import { AdinalsOverlayClient } from './client.ts'
import {
  planBasketRepair,
  summarizeBasketRepair,
  type BasketLineage,
  type BasketRepairPlan,
  type BasketRepairSummary,
  type BasketStep,
} from './basketRepair.ts'
import {
  browserMarkerStore,
  readLastRunAt,
  shouldRepairBaskets,
  writeLastRunAt,
  type BasketRepairMarkerStore,
} from './basketRepairSchedule.ts'

/**
 * Reads what a connected wallet holds and offers it to the overlay.
 *
 * Everything that needs a wallet, a script decoder, or the network lives here;
 * `basketRepair.ts` holds the decision this feeds. A run is read-only unless
 * `submit` is set, so the ordinary use is to inspect first and see exactly which
 * transactions would be sent.
 */
export type BasketRepairWallet = Pick<WalletInterface, 'listOutputs'>

export type BasketRepairResult = BasketRepairSummary & {
  endpoint: string
  submitted: number
  failures: Array<{ outpoint: string; error: string }>
  /**
   * Baskets that did not answer, with the wallet's reason.
   *
   * Production asks for the BRC-99 `p 1sat ordinals` basket first and falls back
   * to the portable `adinals` name, so a wallet that does not implement that
   * scheme refuses one of the two by design. A refusal here means the basket was
   * not read, not that anything is wrong with what was.
   */
  unread: Array<{ basket: string; error: string }>
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const isAdinalsRecord = (map: Record<string, string> | null): boolean =>
  map?.app === ADINALS_NAMESPACE.app &&
  map.type === 'ord' &&
  map.protocolVersion === ADINALS_PROTOCOL_VERSION

/** A record that admits with no prior overlay state: a collection or a mint. */
const isSelfContained = (map: Record<string, string> | null): boolean =>
  map?.subType === 'collection' || map?.subType === 'collectionItem'

const inputZeroSource = (transaction: Transaction): string => {
  const input = transaction.inputs[0]
  const txid = input?.sourceTXID ?? input?.sourceTransaction?.id('hex') ?? ''
  return txid && input?.sourceOutputIndex !== undefined
    ? `${txid}_${input.sourceOutputIndex}`
    : ''
}

/**
 * Walks a basket output back through the transactions its own BEEF carries.
 *
 * The walk stops at a self-contained record, which needs nothing behind it, or
 * where the wallet's evidence is pruned. Both endings are reported honestly:
 * the planner decides what a pruned lineage means, and never guesses at a
 * transaction it does not hold.
 */
export const readBasketLineage = (beef: Beef, outpoint: string): BasketLineage => {
  const parsed = parseProtocolOutpoint(outpoint)
  const lineage: BasketLineage = {
    outpoint: parsed?.normalized ?? outpoint,
    adinals: false,
    skipped: '',
    steps: [],
  }
  if (!parsed) {
    lineage.skipped = 'unreadable outpoint'
    return lineage
  }

  const steps: BasketStep[] = []
  let cursor: { txid: string; vout: number } | null = { txid: parsed.txid, vout: parsed.vout }
  const visited = new Set<string>()
  while (cursor) {
    const current = `${cursor.txid}_${cursor.vout}`
    if (visited.has(current)) break
    visited.add(current)

    let transaction: Transaction | null = null
    try {
      transaction = beef.findAtomicTransaction(cursor.txid) ?? null
    } catch {
      transaction = null
    }
    if (!transaction) break

    const output = transaction.outputs[cursor.vout]
    if (!output || output.satoshis !== 1) {
      // Following an input that is not the one-satoshi Adinal leaves the chain:
      // funding inputs and change are not part of a record's history.
      break
    }
    const map = decodeMapSet(output.lockingScript)?.data ?? null
    const selfContained = isAdinalsRecord(map) && isSelfContained(map)
    const predecessor = inputZeroSource(transaction)
    steps.unshift({ outpoint: current, txid: cursor.txid, predecessor, selfContained })
    if (steps.length === 1) lineage.adinals = true

    if (selfContained || !predecessor) break
    const source = parseProtocolOutpoint(predecessor)
    cursor = source ? { txid: source.txid, vout: source.vout } : null
  }

  lineage.steps = steps
  if (!steps.length) {
    lineage.adinals = false
    lineage.skipped = 'the wallet evidence does not contain this output as a one-satoshi record'
  }
  return lineage
}

const readBasket = async (
  wallet: BasketRepairWallet,
  basket: string,
  limit: number,
): Promise<{ beef: Beef | null; outpoints: string[]; error: string }> => {
  try {
    const result = await wallet.listOutputs({
      basket,
      include: 'entire transactions',
      limit,
      offset: 0,
    })
    if (!result.BEEF) {
      return { beef: null, outpoints: [], error: 'the wallet returned basket outputs without their transactions' }
    }
    return {
      beef: Beef.fromBinary(result.BEEF),
      outpoints: result.outputs.map((output) => output.outpoint),
      error: '',
    }
  } catch (error) {
    return { beef: null, outpoints: [], error: message(error) }
  }
}

/**
 * Runs the repair once per wallet and endpoint, in the background.
 *
 * Silent on success: a visitor did not ask for this and has nothing to do about
 * it. It submits without asking because every record involved is already public
 * on chain and the application already delivers exactly this evidence for every
 * action it performs; the wallet-connect copy says so rather than hiding it.
 * Failure is recorded in the console and never reaches the interface, because an
 * overlay is an operational detail and the records are permanent.
 */
export async function repairOverlayFromBasketsOnce(
  wallet: BasketRepairWallet,
  identityKey: string,
  options: { store?: BasketRepairMarkerStore; now?: number; intervalMs?: number } = {},
): Promise<BasketRepairResult | null> {
  const endpoint = ADINALS_OVERLAY_URL
  if (!endpoint || !identityKey) return null
  const store = options.store ?? browserMarkerStore()
  const due = shouldRepairBaskets({
    identityKey,
    endpoint,
    lastRunAt: readLastRunAt(store, identityKey, endpoint),
    ...(options.now !== undefined && { now: options.now }),
    ...(options.intervalMs !== undefined && { intervalMs: options.intervalMs }),
  })
  if (!due) return null

  // Marked before the run rather than after, so a failing or slow overlay cannot
  // make every page load retry a repair that costs a round trip per output.
  writeLastRunAt(store, identityKey, endpoint, options.now)
  try {
    const result = await repairOverlayFromBaskets(wallet, { submit: true })
    if (result.submitted || result.failures.length) {
      console.info(
        `Overlay basket repair: submitted ${result.submitted}, refused ${result.failures.length},`
        + ` ${result.incomplete} incomplete of ${result.outputs} output(s)`,
        endpoint,
      )
    }
    return result
  } catch (error) {
    console.warn('Overlay basket repair failed', error)
    return null
  }
}

/**
 * Offers every Adinal in the wallet's baskets to the overlay.
 *
 * Inspects by default. With `submit`, sends each planned transaction oldest
 * first and stops that lineage at the first refusal, because a later state
 * cannot admit once its predecessor has failed. A record the overlay already
 * holds is never resent.
 */
export async function repairOverlayFromBaskets(
  wallet: BasketRepairWallet,
  options: { submit?: boolean; baskets?: readonly string[]; limit?: number } = {},
): Promise<BasketRepairResult> {
  const endpoint = ADINALS_OVERLAY_URL
  const baskets = options.baskets ?? ACTIVE_BASKET_CANDIDATES
  const limit = options.limit ?? 200
  if (!endpoint) {
    return {
      ...summarizeBasketRepair('', []),
      endpoint,
      submitted: 0,
      failures: [],
      unread: baskets.map((basket) => ({ basket, error: 'no overlay endpoint is configured' })),
    }
  }

  const client = new AdinalsOverlayClient(endpoint, { topic: ADINALS_NAMESPACE.overlayTopic })
  const lineages: Array<{ lineage: BasketLineage; beef: Beef }> = []
  const unread: BasketRepairResult['unread'] = []
  const read: string[] = []

  for (const basket of baskets) {
    const { beef, outpoints, error } = await readBasket(wallet, basket, limit)
    if (error || !beef) {
      unread.push({ basket, error: error || 'the wallet returned no transactions' })
      continue
    }
    read.push(basket)
    for (const outpoint of outpoints) {
      const lineage = readBasketLineage(beef, outpoint)
      if (lineages.some((entry) => entry.lineage.outpoint === lineage.outpoint)) continue
      lineages.push({ lineage, beef })
    }
  }

  // One membership question per distinct outpoint across every lineage, so a
  // shared ancestry is not asked about repeatedly.
  const candidates = new Set<string>()
  for (const { lineage } of lineages) {
    for (const step of lineage.steps) {
      candidates.add(step.outpoint)
      if (step.predecessor) candidates.add(step.predecessor)
    }
  }
  const known = new Set<string>()
  await Promise.all([...candidates].map(async (outpoint) => {
    try {
      if (await client.hasOutput(outpoint)) known.add(outpoint)
    } catch {
      // An unanswerable membership question is treated as unknown, which can
      // only cause a duplicate submission and never a missed one.
    }
  }))

  const failures: BasketRepairResult['failures'] = []
  let submitted = 0

  for (const { lineage, beef } of lineages) {
    const plan = planBasketRepair(lineage, known)
    if (!options.submit || plan.decision !== 'submit') continue

    for (const step of plan.submit) {
      try {
        await client.submit(beef.toBinaryAtomic(step.txid))
        submitted += 1
        known.add(step.outpoint)
      } catch (error) {
        failures.push({ outpoint: step.outpoint, error: message(error) })
        // A later state cannot admit without its predecessor, so this lineage
        // stops here rather than producing a second, misleading failure.
        break
      }
    }
  }

  // Report the state the run left behind rather than the one it found. Planning
  // again against everything now known means a successful submission reads as
  // `present`, instead of a stale summary inviting the operator to send it a
  // second time.
  const plans = lineages.map(({ lineage }) => planBasketRepair(lineage, known))

  return {
    ...summarizeBasketRepair(read.join(', '), plans),
    endpoint,
    submitted,
    failures,
    unread,
  }
}
