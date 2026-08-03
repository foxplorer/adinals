import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BASKET_REPAIR_INTERVAL_MS,
  basketRepairKey,
  readLastRunAt,
  shouldRepairBaskets,
  writeLastRunAt,
  type BasketRepairMarkerStore,
} from './basketRepairSchedule.ts'

const IDENTITY = '02abc'
const ENDPOINT = 'https://overlay.example'
const NOW = Date.parse('2026-08-03T12:00:00.000Z')

const memoryStore = (): BasketRepairMarkerStore & { entries: Map<string, string> } => {
  const entries = new Map<string, string>()
  return {
    entries,
    read: (key) => entries.get(key) ?? null,
    write: (key, value) => { entries.set(key, value) },
  }
}

test('a wallet the overlay has never been offered runs immediately', () => {
  assert.equal(shouldRepairBaskets({
    identityKey: IDENTITY, endpoint: ENDPOINT, lastRunAt: null, now: NOW,
  }), true)
})

test('a recent run is not repeated', () => {
  assert.equal(shouldRepairBaskets({
    identityKey: IDENTITY, endpoint: ENDPOINT, lastRunAt: NOW - 60_000, now: NOW,
  }), false)
})

test('a run older than the interval is due again', () => {
  assert.equal(shouldRepairBaskets({
    identityKey: IDENTITY,
    endpoint: ENDPOINT,
    lastRunAt: NOW - BASKET_REPAIR_INTERVAL_MS,
    now: NOW,
  }), true)
})

test('a marker from the future is a clock change, not a recent run', () => {
  assert.equal(shouldRepairBaskets({
    identityKey: IDENTITY, endpoint: ENDPOINT, lastRunAt: NOW + 86_400_000, now: NOW,
  }), true)
})

test('no wallet and no endpoint never runs', () => {
  assert.equal(shouldRepairBaskets({
    identityKey: '', endpoint: ENDPOINT, lastRunAt: null, now: NOW,
  }), false)
  assert.equal(shouldRepairBaskets({
    identityKey: IDENTITY, endpoint: '', lastRunAt: null, now: NOW,
  }), false)
})

test('a different endpoint is asked immediately rather than waiting out the interval', () => {
  const store = memoryStore()
  writeLastRunAt(store, IDENTITY, ENDPOINT, NOW)
  const other = 'https://other.example'
  assert.equal(readLastRunAt(store, IDENTITY, ENDPOINT), NOW)
  assert.equal(readLastRunAt(store, IDENTITY, other), null)
  assert.equal(shouldRepairBaskets({
    identityKey: IDENTITY, endpoint: other, lastRunAt: readLastRunAt(store, IDENTITY, other), now: NOW,
  }), true)
})

test('a different wallet on the same endpoint is asked too', () => {
  const store = memoryStore()
  writeLastRunAt(store, IDENTITY, ENDPOINT, NOW)
  assert.equal(readLastRunAt(store, '02def', ENDPOINT), null)
  assert.notEqual(basketRepairKey(IDENTITY, ENDPOINT), basketRepairKey('02def', ENDPOINT))
})

test('an unreadable marker repeats the repair rather than skipping it', () => {
  const store = memoryStore()
  store.write(basketRepairKey(IDENTITY, ENDPOINT), 'not-a-number')
  assert.equal(readLastRunAt(store, IDENTITY, ENDPOINT), null)
})
