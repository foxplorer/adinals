import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectionFromProtocolRow,
  replaceCollectionAds,
  resolveAdDisplay,
  type Ad,
  type Update,
} from './collectionViewModel.ts'

const COLLECTION = `${'a'.repeat(64)}_0`
const OTHER_COLLECTION = `${'b'.repeat(64)}_0`
const CREATOR = '1CreatorAddress'
const OWNER = '1OwnerAddress'

const collectionRow = (map: Record<string, unknown> = {}) => ({
  origin: COLLECTION,
  outpoint: COLLECTION,
  owner: CREATOR,
  signer: CREATOR,
  map: {
    app: 'adinals',
    type: 'ord',
    subType: 'collection',
    protocolVersion: '3',
    name: 'Billboards',
    adMax: '2',
    adFormat: 'text',
    adApproval: 'creator',
    adMaxChars: '40',
    adContentPolicy: 'family-friendly',
    createdAt: '2026-01-01T00:00:00.000Z',
    subTypeData: JSON.stringify({ description: 'Finite slots', quantity: 2 }),
    ...map,
  },
})

const update = (overrides: Partial<Update> = {}): Update => ({
  outpoint: `${'c'.repeat(64)}_1`,
  adOutpoint: `${'c'.repeat(64)}_0`,
  ownerEpoch: COLLECTION,
  format: 'text',
  text: 'Replacement',
  contentUrl: `${'c'.repeat(64)}_1`,
  url: 'https://example.com/next',
  signer: OWNER,
  height: 900_004,
  idx: 5,
  createdAt: '2026-01-03T00:00:00.000Z',
  valid: true,
  invalidReason: '',
  ...overrides,
})

const ad = (origin: string, collectionId: string, overrides: Partial<Ad> = {}): Ad => ({
  origin,
  outpoint: origin,
  collectionId,
  owner: OWNER,
  ownerEpoch: origin,
  serial: 1,
  name: 'Slot',
  format: 'text',
  mintText: 'Original',
  mintContentUrl: '',
  mintUrl: '',
  mintedAt: '2026-01-02T00:00:00.000Z',
  height: 900_001,
  listing: null,
  originHeight: 900_001,
  originIdx: 2,
  fromCreator: true,
  invalidReason: '',
  duplicateSlot: false,
  updates: [],
  liveText: 'Original',
  liveContentUrl: '',
  liveUrl: '',
  status: 'live',
  marketEvents: [],
  indexPending: false,
  ...overrides,
})

test('a valid collection record becomes the rendered collection', () => {
  const rendered = collectionFromProtocolRow(collectionRow(), 900_000)
  assert.equal(rendered?.name, 'Billboards')
  assert.equal(rendered?.description, 'Finite slots')
  assert.equal(rendered?.creator, CREATOR)
  assert.equal(rendered?.max, 2)
  assert.equal(rendered?.maxChars, 40)
  assert.equal(rendered?.contentPolicy, 'family-friendly')
  assert.equal(rendered?.height, 900_000)
  assert.equal(rendered?.expired, false)
})

test('a record that fails the collection rules renders nothing', () => {
  assert.equal(collectionFromProtocolRow(collectionRow({ adMax: '0' }), null), null)
  assert.equal(collectionFromProtocolRow({ ...collectionRow(), signer: '' }, null), null)
})

test('expiration is decided against the supplied moment', () => {
  const row = collectionRow({ expiresAt: '2026-02-01T00:00:00.000Z' })
  assert.equal(collectionFromProtocolRow(row, null, new Date('2026-01-15T00:00:00.000Z'))?.expired, false)
  assert.equal(collectionFromProtocolRow(row, null, new Date('2026-03-01T00:00:00.000Z'))?.expired, true)
})

test('with no updates the mint creative stays live', () => {
  const display = resolveAdDisplay([], { text: 'Original', contentUrl: '', url: '' }, {
    approval: 'creator', creator: CREATOR,
  })
  assert.deepEqual(display, { liveText: 'Original', liveContentUrl: '', liveUrl: '', status: 'live' })
})

test('an unreviewed update is pending and publishes nothing', () => {
  const display = resolveAdDisplay([update()], { text: 'Original', contentUrl: '', url: '' }, {
    approval: 'creator', creator: CREATOR,
  })
  assert.equal(display.status, 'pending')
  assert.equal(display.liveText, 'Original')
})

test('an approved update publishes, and a later pending one does not erase it', () => {
  const approved = update({ verdict: 'approved', text: 'Approved' })
  const pending = update({ outpoint: `${'d'.repeat(64)}_1`, text: 'Later' })
  const display = resolveAdDisplay([approved, pending], { text: 'Original', contentUrl: '', url: '' }, {
    approval: 'creator', creator: CREATOR,
  })
  assert.equal(display.status, 'pending')
  assert.equal(display.liveText, 'Approved')
})

test('a creator signing their own update needs no decision', () => {
  const display = resolveAdDisplay([update({ signer: CREATOR })], { text: 'Original', contentUrl: '', url: '' }, {
    approval: 'creator', creator: CREATOR,
  })
  assert.equal(display.status, 'live')
  assert.equal(display.liveText, 'Replacement')
})

test('an invalid update is ignored entirely', () => {
  const display = resolveAdDisplay([update({ valid: false, invalidReason: 'not current owner' })], {
    text: 'Original', contentUrl: '', url: '',
  }, { approval: 'open', creator: CREATOR })
  assert.equal(display.status, 'live')
  assert.equal(display.liveText, 'Original')
})

test('replacing a collection leaves every other collection untouched', () => {
  const current = [
    ad('1'.repeat(64) + '_0', COLLECTION),
    ad('2'.repeat(64) + '_0', OTHER_COLLECTION),
  ]
  const loaded = [ad('1'.repeat(64) + '_0', COLLECTION, { liveText: 'From overlay' })]
  const next = replaceCollectionAds(current, loaded, COLLECTION)
  assert.equal(next.length, 2)
  assert.equal(next.find((item) => item.collectionId === COLLECTION)?.liveText, 'From overlay')
  assert.equal(next.find((item) => item.collectionId === OTHER_COLLECTION)?.liveText, 'Original')
})

test('a replacement that drops an ad the other reader had removes it', () => {
  const current = [
    ad('1'.repeat(64) + '_0', COLLECTION),
    ad('2'.repeat(64) + '_0', COLLECTION, { serial: 2 }),
  ]
  const next = replaceCollectionAds(current, [ad('1'.repeat(64) + '_0', COLLECTION)], COLLECTION)
  assert.deepEqual(next.map((item) => item.origin), ['1'.repeat(64) + '_0'])
})

test('an unconfirmed local action survives the swap', () => {
  const origin = '1'.repeat(64) + '_0'
  const pendingUpdate = update({ outpoint: `${'e'.repeat(64)}_1`, height: null, text: 'Just broadcast' })
  const current = [ad(origin, COLLECTION, {
    updates: [pendingUpdate],
    liveText: 'Just broadcast',
    status: 'pending',
  })]
  const next = replaceCollectionAds(current, [ad(origin, COLLECTION)], COLLECTION)
  assert.equal(next[0]?.updates.length, 1)
  assert.equal(next[0]?.updates[0]?.text, 'Just broadcast')
  assert.equal(next[0]?.liveText, 'Just broadcast')
})
