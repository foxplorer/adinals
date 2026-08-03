import assert from 'node:assert/strict'
import test from 'node:test'
import {
  planBasketRepair,
  summarizeBasketRepair,
  type BasketLineage,
  type BasketStep,
} from './basketRepair.ts'

const MINT = `${'a'.repeat(64)}_0`
const LISTED = `${'b'.repeat(64)}_0`
const BOUGHT = `${'c'.repeat(64)}_0`

const step = (outpoint: string, predecessor: string, selfContained = false): BasketStep => ({
  outpoint,
  txid: outpoint.split('_')[0] ?? '',
  predecessor,
  selfContained,
})

const lineage = (steps: BasketStep[], overrides: Partial<BasketLineage> = {}): BasketLineage => ({
  outpoint: steps[steps.length - 1]?.outpoint ?? '',
  adinals: true,
  skipped: '',
  steps,
  ...overrides,
})

test('an output the overlay already holds needs nothing', () => {
  const plan = planBasketRepair(lineage([step(MINT, '', true)]), new Set([MINT]))
  assert.equal(plan.decision, 'present')
  assert.deepEqual(plan.submit, [])
})

test('an unspent mint the overlay never saw is submitted on its own evidence', () => {
  const plan = planBasketRepair(lineage([step(MINT, '', true)]), new Set())
  assert.equal(plan.decision, 'submit')
  assert.deepEqual(plan.submit.map((entry) => entry.outpoint), [MINT])
})

test('a full lineage is submitted oldest first', () => {
  const plan = planBasketRepair(
    lineage([step(MINT, '', true), step(LISTED, MINT), step(BOUGHT, LISTED)]),
    new Set(),
  )
  assert.equal(plan.decision, 'submit')
  assert.deepEqual(plan.submit.map((entry) => entry.outpoint), [MINT, LISTED, BOUGHT])
})

test('only the steps the overlay lacks are submitted', () => {
  const plan = planBasketRepair(
    lineage([step(MINT, '', true), step(LISTED, MINT), step(BOUGHT, LISTED)]),
    new Set([MINT, LISTED]),
  )
  assert.equal(plan.decision, 'submit')
  assert.deepEqual(plan.submit.map((entry) => entry.outpoint), [BOUGHT])
})

test('a tip whose predecessor neither side holds is reported rather than sent', () => {
  const plan = planBasketRepair(lineage([step(BOUGHT, LISTED)]), new Set())
  assert.equal(plan.decision, 'history-incomplete')
  assert.equal(plan.missing, LISTED)
  assert.deepEqual(plan.submit, [])
})

test('a tip is submitted when the overlay already holds what it spent', () => {
  const plan = planBasketRepair(lineage([step(BOUGHT, LISTED)]), new Set([LISTED]))
  assert.equal(plan.decision, 'submit')
  assert.deepEqual(plan.submit.map((entry) => entry.outpoint), [BOUGHT])
})

test('a pruned lineage with no predecessor at all is incomplete', () => {
  const plan = planBasketRepair(lineage([step(BOUGHT, '')]), new Set())
  assert.equal(plan.decision, 'history-incomplete')
  assert.equal(plan.missing, '')
  assert.match(plan.note, /origin/)
})

test('a partial lineage that stops short of the origin is incomplete', () => {
  const plan = planBasketRepair(
    lineage([step(LISTED, MINT), step(BOUGHT, LISTED)]),
    new Set(),
  )
  assert.equal(plan.decision, 'history-incomplete')
  assert.equal(plan.missing, MINT)
})

test('a non-Adinals output is skipped with its reason', () => {
  const plan = planBasketRepair(
    lineage([step(MINT, '', true)], { adinals: false, skipped: 'no MAP envelope' }),
    new Set(),
  )
  assert.equal(plan.decision, 'skipped')
  assert.equal(plan.note, 'no MAP envelope')
})

test('evidence that does not contain the basket output is skipped', () => {
  const plan = planBasketRepair(
    lineage([step(MINT, '', true)], { outpoint: BOUGHT }),
    new Set(),
  )
  assert.equal(plan.decision, 'skipped')
})

test('a summary counts every outcome and the transactions a run would send', () => {
  const summary = summarizeBasketRepair('p 1sat ordinals', [
    planBasketRepair(lineage([step(MINT, '', true)]), new Set([MINT])),
    planBasketRepair(lineage([step(MINT, '', true), step(LISTED, MINT)]), new Set()),
    planBasketRepair(lineage([step(BOUGHT, LISTED)]), new Set()),
    planBasketRepair(lineage([step(MINT, '', true)], { adinals: false }), new Set()),
  ])
  assert.equal(summary.outputs, 4)
  assert.equal(summary.present, 1)
  assert.equal(summary.submittable, 1)
  assert.equal(summary.incomplete, 1)
  assert.equal(summary.skipped, 1)
  assert.equal(summary.transactions, 2)
})
