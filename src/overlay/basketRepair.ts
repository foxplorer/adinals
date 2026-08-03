/**
 * Decides what a wallet's own baskets can teach the overlay.
 *
 * The node's remaining dependency is discovery: it learns about a record when
 * this application submits it, when reconciliation finds it through GorillaPool,
 * or when a peer synchronises it. A connected wallet is a fourth source, and the
 * only one that involves no third party at all — the evidence is the BEEF the
 * wallet already holds for the outputs it owns, so an Adinal minted in another
 * session, imported, or bought elsewhere can reach the node on the strength of
 * its own transaction.
 *
 * What limits it is history rather than authority. A mint and a collection are
 * self-contained and admit on their own evidence, but a later state only admits
 * if the overlay already knows the output it spent. A wallet's BEEF is pruned at
 * whatever ancestors carry merkle proofs, so it often holds a confirmed tip and
 * nothing behind it. This module therefore submits only a lineage it can
 * complete, and names the missing predecessor otherwise, which is the case the
 * GorillaPool backfill exists for.
 *
 * The planning is separated from the wallet and the network so it can be tested
 * exhaustively; `basketRepairClient.ts` performs the parts that cannot.
 */
export type BasketStep = {
  /** The one-satoshi outpoint this step produced. */
  outpoint: string
  /** The transaction that produced it, which is the unit of submission. */
  txid: string
  /** The outpoint its input 0 spent, empty when the wallet's BEEF prunes it. */
  predecessor: string
  /** True for a record that admits with no prior overlay state: a mint or a collection. */
  selfContained: boolean
}

export type BasketLineage = {
  /** The basket output this lineage was read from. */
  outpoint: string
  /** False for anything that is not an Adinals version 3 record or state. */
  adinals: boolean
  /** Why an output was skipped, when it was. */
  skipped: string
  /** Oldest first, ending at the basket output. */
  steps: BasketStep[]
}

export type BasketRepairDecision =
  /** The overlay already holds this exact output. */
  | 'present'
  /** Complete evidence the overlay lacks; every step in `submit` should be sent. */
  | 'submit'
  /** The overlay lacks a predecessor this wallet cannot prove. */
  | 'history-incomplete'
  /** Not an Adinals record, or not readable as one. */
  | 'skipped'

export type BasketRepairPlan = {
  outpoint: string
  decision: BasketRepairDecision
  /** Transactions to submit, oldest first. Empty unless the decision is `submit`. */
  submit: BasketStep[]
  /** The predecessor the overlay would need and this wallet cannot supply. */
  missing: string
  note: string
}

export function planBasketRepair(
  lineage: BasketLineage,
  knownOutpoints: ReadonlySet<string>,
): BasketRepairPlan {
  const plan = (
    decision: BasketRepairDecision,
    extra: Partial<BasketRepairPlan> = {},
  ): BasketRepairPlan => ({
    outpoint: lineage.outpoint,
    decision,
    submit: [],
    missing: '',
    note: '',
    ...extra,
  })

  if (!lineage.adinals) {
    return plan('skipped', { note: lineage.skipped || 'not an Adinals record' })
  }
  const tip = lineage.steps[lineage.steps.length - 1]
  if (!tip || tip.outpoint !== lineage.outpoint) {
    return plan('skipped', { note: 'the wallet evidence does not contain this output' })
  }
  if (knownOutpoints.has(lineage.outpoint)) {
    return plan('present', { note: 'the overlay already holds this output' })
  }

  // Submit from the earliest step the overlay does not already hold: anything
  // it holds is evidence it has admitted, and resending it is a duplicate.
  let start = lineage.steps.length - 1
  while (start > 0 && !knownOutpoints.has(lineage.steps[start - 1]!.outpoint)) start -= 1
  const first = lineage.steps[start]!

  const supported =
    first.selfContained ||
    knownOutpoints.has(first.predecessor) ||
    (start > 0 && lineage.steps[start - 1]!.outpoint === first.predecessor)
  if (!supported) {
    return plan('history-incomplete', {
      missing: first.predecessor,
      note: first.predecessor
        ? 'the overlay does not hold the state this record spent, and the wallet does not carry it'
        : 'the wallet evidence does not reach this record’s origin',
    })
  }

  const submit = lineage.steps.slice(start)
  return plan('submit', {
    submit,
    note: submit.length === 1
      ? 'one transaction the overlay has never seen'
      : `${submit.length} transactions, oldest first`,
  })
}

export type BasketRepairSummary = {
  basket: string
  outputs: number
  present: number
  submittable: number
  incomplete: number
  skipped: number
  transactions: number
  plans: BasketRepairPlan[]
}

export function summarizeBasketRepair(
  basket: string,
  plans: readonly BasketRepairPlan[],
): BasketRepairSummary {
  const count = (decision: BasketRepairDecision) =>
    plans.filter((plan) => plan.decision === decision).length
  return {
    basket,
    outputs: plans.length,
    present: count('present'),
    submittable: count('submit'),
    incomplete: count('history-incomplete'),
    skipped: count('skipped'),
    transactions: plans.reduce((total, plan) => total + plan.submit.length, 0),
    plans: [...plans],
  }
}
