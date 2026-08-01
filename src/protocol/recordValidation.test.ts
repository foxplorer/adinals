import assert from 'node:assert/strict'
import test from 'node:test'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import {
  ADINALS_URL_WRITE_MAX_BYTES,
  adDecisionRecordError,
  adMintRecordError,
  adUpdateRecordError,
  collectionRulesFromRecord,
  validateProtocolAdUrl,
  validateWritableProtocolAdUrl,
  type AdinalsProtocolRow,
} from './recordValidation.ts'

const app = ADINALS_NAMESPACE.app
const creator = 'creator-address'
const owner = 'owner-address'
const collectionOrigin = `${'a'.repeat(64)}_0`
const adOrigin = `${'b'.repeat(64)}_0`
const adOutpoint = `${'c'.repeat(64)}_0`
const successorOutpoint = `${'d'.repeat(64)}_0`
const siblingUpdateOutpoint = `${'d'.repeat(64)}_1`
const ownerEpoch = adOrigin
const mintOutpoint = `${'e'.repeat(64)}_0`

const row = (overrides: Partial<AdinalsProtocolRow> = {}): AdinalsProtocolRow => ({
  origin: collectionOrigin,
  outpoint: collectionOrigin,
  owner: creator,
  signer: creator,
  map: {},
  ...overrides,
})

const collectionRow = (): AdinalsProtocolRow => row({
  map: {
    app,
    type: 'ord',
    name: 'Text boards',
    subType: 'collection',
    protocolVersion: '3',
    subTypeData: JSON.stringify({ description: 'Track boards', quantity: 5 }),
    adMax: '5',
    adApproval: 'creator',
    adContentPolicy: 'family-friendly',
    adFormat: 'text',
    adMaxChars: '16',
    expiresAt: '2026-08-04T17:12:16.231Z',
    createdAt: '2026-07-28T17:12:16.231Z',
  },
})

const rules = () => collectionRulesFromRecord(collectionRow()).rules

const mintRow = (): AdinalsProtocolRow => row({
  origin: mintOutpoint,
  outpoint: mintOutpoint,
  map: {
    app,
    type: 'ord',
    name: 'Ad #1',
    subType: 'collectionItem',
    protocolVersion: '3',
    subTypeData: JSON.stringify({ collectionId: collectionOrigin, mintNumber: 1 }),
    adFormat: 'text',
    adText: 'hello sir',
    adMaxChars: '16',
    mintedAt: '2026-07-28T17:20:00.000Z',
  },
})

test('accepts the frozen text collection shape in the active namespace', () => {
  assert.equal(collectionRulesFromRecord(collectionRow()).error, '')
})

test('scopes every record to the namespace it is read for', () => {
  // The temporary namespace exists so development records cannot be mistaken
  // for production ones. A record valid under one app must fail under another.
  const otherApp = app === 'adinals' ? 'adinals-brc100-test' : 'adinals'
  assert.equal(collectionRulesFromRecord(collectionRow(), app).error, '')
  assert.equal(
    collectionRulesFromRecord(collectionRow(), otherApp).error,
    'invalid common record fields',
  )
  assert.equal(adMintRecordError(mintRow(), rules(), otherApp), 'invalid common record fields')
})

test('keeps the content policy optional and rejects unknown policy values', () => {
  const withoutPolicy = collectionRow()
  delete withoutPolicy.map.adContentPolicy
  assert.equal(collectionRulesFromRecord(withoutPolicy).error, '')

  const unsupportedPolicy = collectionRow()
  unsupportedPolicy.map.adContentPolicy = 'unspecified'
  assert.equal(collectionRulesFromRecord(unsupportedPolicy).error, 'unsupported content policy')
})

test('rejects namespace, quantity, approval, and timestamp drift', () => {
  for (const [field, value] of [
    ['app', 'lookalike'],
    ['adMax', '6'],
    ['adApproval', 'sometimes'],
    ['createdAt', 'yesterday'],
  ] as const) {
    const candidate = collectionRow()
    candidate.map[field] = value
    assert.notEqual(collectionRulesFromRecord(candidate).error, '', field)
  }
})

test('validates a creator-signed text mint and rejects an out-of-capacity slot', () => {
  const mint = mintRow()
  assert.equal(adMintRecordError(mint, rules()), '')
  mint.map.subTypeData = JSON.stringify({ collectionId: collectionOrigin, mintNumber: 6 })
  assert.equal(adMintRecordError(mint, rules()), 'invalid slot')
})

test('rejects a mint whose SIGMA signer is not the collection creator', () => {
  const mint = mintRow()
  mint.signer = owner
  assert.equal(adMintRecordError(mint, rules()), 'invalid creator signature')
})

test('keeps adUrl optional and rejects unsafe destinations when supplied', () => {
  const mint = mintRow()
  assert.equal(adMintRecordError(mint, rules()), '')

  mint.map.adUrl = 'https://example.com/landing'
  assert.equal(adMintRecordError(mint, rules()), '')

  mint.map.adUrl = 'https://user:password@example.com/'
  assert.equal(adMintRecordError(mint, rules()), 'invalid destination URL')

  mint.map.adUrl = 'http://example.com/'
  assert.equal(adMintRecordError(mint, rules()), 'invalid destination URL')
})

test('keeps new URL writes compact without invalidating wider existing v3 records', () => {
  const compact = `https://example.com/${'a'.repeat(ADINALS_URL_WRITE_MAX_BYTES - 32)}`
  assert.equal(validateWritableProtocolAdUrl(compact).error, '')

  const existing = `https://example.com/${'a'.repeat(600)}`
  assert.equal(validateProtocolAdUrl(existing).error, '')
  assert.match(validateWritableProtocolAdUrl(existing).error, /UTF-8 bytes or fewer/)
})

test('binds an update to the exact spend and current ownership epoch', () => {
  const update = row({
    origin: siblingUpdateOutpoint,
    outpoint: siblingUpdateOutpoint,
    signer: owner,
    owner,
    map: {
      app,
      type: 'ord',
      name: 'Ad update',
      subType: 'adUpdate',
      protocolVersion: '3',
      collectionId: collectionOrigin,
      adOrigin,
      adOutpoint,
      ownerEpoch,
      transition: 'spend-linked-self-v1',
      adFormat: 'text',
      adText: 'new words',
      updatedAt: '2026-07-28T17:30:00.000Z',
    },
  })
  const context = {
    collection: rules(),
    adOrigin,
    ownershipOutpoints: [adOrigin, adOutpoint, successorOutpoint],
    currentOwner: owner,
    currentOwnerEpoch: ownerEpoch,
    transition: {
      error: '',
      predecessorOutpoint: adOutpoint,
      successorOutpoint,
      recordOutpoint: siblingUpdateOutpoint,
      owner,
    },
  }
  assert.equal(adUpdateRecordError(update, context), '')
  update.map.adOutpoint = `${'e'.repeat(64)}_0`
  assert.equal(adUpdateRecordError(update, context), 'update predecessor mismatch')

  update.map.adOutpoint = adOutpoint
  update.map.ownerEpoch = `${'f'.repeat(64)}_0`
  assert.equal(adUpdateRecordError(update, context), 'ownership epoch mismatch')
})

test('rejects an update signed by anyone other than the proven spending owner', () => {
  const update = row({
    origin: siblingUpdateOutpoint,
    outpoint: siblingUpdateOutpoint,
    signer: creator,
    owner,
    map: {
      app,
      type: 'ord',
      name: 'Ad update',
      subType: 'adUpdate',
      protocolVersion: '3',
      collectionId: collectionOrigin,
      adOrigin,
      adOutpoint,
      ownerEpoch,
      transition: 'spend-linked-self-v1',
      adFormat: 'text',
      adText: 'new words',
      updatedAt: '2026-07-28T17:30:00.000Z',
    },
  })
  assert.equal(
    adUpdateRecordError(update, {
      collection: rules(),
      adOrigin,
      ownershipOutpoints: [adOrigin, adOutpoint, successorOutpoint],
      currentOwner: owner,
      currentOwnerEpoch: ownerEpoch,
      transition: {
        error: '',
        predecessorOutpoint: adOutpoint,
        successorOutpoint,
        recordOutpoint: siblingUpdateOutpoint,
        owner,
      },
    }),
    'not current owner',
  )
})

test('binds a creator decision to the update transaction, Adinal state, and epoch', () => {
  const decisionOutpoint = `${'f'.repeat(64)}_0`
  const decision = row({
    origin: decisionOutpoint,
    outpoint: decisionOutpoint,
    map: {
      app,
      type: 'ord',
      name: 'Ad decision',
      subType: 'adDecision',
      protocolVersion: '3',
      collectionId: collectionOrigin,
      adOrigin,
      updateOutpoint: siblingUpdateOutpoint,
      revisionOutpoint: siblingUpdateOutpoint,
      adOutpoint: successorOutpoint,
      ownerEpoch,
      transitionTxid: siblingUpdateOutpoint.split('_')[0],
      decision: 'approved',
      reasonCode: '',
      decidedAt: '2026-07-28T17:40:00.000Z',
    },
  })
  const context = {
    collection: rules(),
    adOrigin,
    updateOutpoint: siblingUpdateOutpoint,
    adOutpoint: successorOutpoint,
    ownerEpoch,
  }
  assert.equal(adDecisionRecordError(decision, context), '')
  decision.map.adOrigin = `${'f'.repeat(64)}_0`
  assert.equal(adDecisionRecordError(decision, context), 'ad reference mismatch')

  decision.map.adOrigin = adOrigin
  decision.map.adOutpoint = adOutpoint
  assert.equal(adDecisionRecordError(decision, context), 'Adinal state reference mismatch')

  decision.map.adOutpoint = successorOutpoint
  decision.map.transitionTxid = '0'.repeat(64)
  assert.equal(adDecisionRecordError(decision, context), 'transition transaction mismatch')
})

test('rejects a decision signed by anyone other than the collection creator', () => {
  const decisionOutpoint = `${'f'.repeat(64)}_0`
  const decision = row({
    origin: decisionOutpoint,
    outpoint: decisionOutpoint,
    signer: owner,
    map: {
      app,
      type: 'ord',
      name: 'Ad decision',
      subType: 'adDecision',
      protocolVersion: '3',
      collectionId: collectionOrigin,
      adOrigin,
      updateOutpoint: siblingUpdateOutpoint,
      adOutpoint: successorOutpoint,
      ownerEpoch,
      transitionTxid: siblingUpdateOutpoint.split('_')[0],
      decision: 'approved',
      reasonCode: '',
      decidedAt: '2026-07-28T17:40:00.000Z',
    },
  })
  assert.equal(
    adDecisionRecordError(decision, {
      collection: rules(),
      adOrigin,
      updateOutpoint: siblingUpdateOutpoint,
      adOutpoint: successorOutpoint,
      ownerEpoch,
    }),
    'invalid creator signature',
  )
})
