import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADINALS_IMAGE_PROFILE,
  AdinalsCollectionValidationError,
  buildCollectionMap,
  validateCollectionMap,
} from './collectionMetadata.ts'

const NOW = new Date('2026-07-30T17:00:00.000Z')

test('builds the canonical v3 text collection MAP vector', () => {
  const map = buildCollectionMap({
    name: ' Fox Board ',
    description: ' Two placements ',
    maxSupply: 3,
    approval: 'creator',
    format: 'text',
    contentPolicy: 'family-friendly',
    maxChars: 280,
    placement: ' homepage ',
    expiresAt: '2026-08-30T17:00:00.000Z',
  }, { app: 'adinals-brc100-test', now: NOW })

  assert.deepEqual(map, {
    app: 'adinals-brc100-test',
    type: 'ord',
    name: 'Fox Board',
    subType: 'collection',
    protocolVersion: '3',
    subTypeData: JSON.stringify({ description: 'Two placements', quantity: 3 }),
    adMax: '3',
    adApproval: 'creator',
    adContentPolicy: 'family-friendly',
    adFormat: 'text',
    adMaxChars: '280',
    adPlacement: 'homepage',
    expiresAt: '2026-08-30T17:00:00.000Z',
    createdAt: NOW.toISOString(),
  })
  assert.deepEqual(validateCollectionMap(map, 'adinals-brc100-test'), [])
})

test('builds the canonical image collection profile', () => {
  const map = buildCollectionMap({
    name: 'Image Board',
    description: '',
    maxSupply: 2,
    approval: 'open',
    format: 'image',
  }, { app: 'adinals-brc100-test', now: NOW })

  assert.equal(map.adImageProfile, ADINALS_IMAGE_PROFILE)
  assert.equal(map.adMaxChars, undefined)
  assert.deepEqual(validateCollectionMap(map, 'adinals-brc100-test'), [])
})

test('negative vector rejects a mismatched capacity', () => {
  const map = buildCollectionMap({
    name: 'Fox Board',
    description: '',
    maxSupply: 3,
    approval: 'creator',
    format: 'text',
    maxChars: 100,
  }, { app: 'adinals-brc100-test', now: NOW })

  assert.deepEqual(validateCollectionMap({ ...map, adMax: '4' }, 'adinals-brc100-test'), [
    'invalid collection capacity',
  ])
})

test('negative vector rejects expiration at or before creation time', () => {
  assert.throws(
    () => buildCollectionMap({
      name: 'Expired',
      description: '',
      maxSupply: 1,
      approval: 'open',
      format: 'image',
      expiresAt: NOW.toISOString(),
    }, { app: 'adinals-brc100-test', now: NOW }),
    (error: unknown) => error instanceof AdinalsCollectionValidationError &&
      error.code === 'COLLECTION_EXPIRATION_INVALID',
  )
})

test('negative vector rejects an empty collection name', () => {
  assert.throws(
    () => buildCollectionMap({
      name: '   ',
      description: '',
      maxSupply: 1,
      approval: 'open',
      format: 'image',
    }, { app: 'adinals-brc100-test', now: NOW }),
    (error: unknown) => error instanceof AdinalsCollectionValidationError &&
      error.code === 'COLLECTION_NAME_REQUIRED',
  )
})

test('negative vector rejects a non-positive text character limit', () => {
  assert.throws(
    () => buildCollectionMap({
      name: 'Text board',
      description: '',
      maxSupply: 1,
      approval: 'creator',
      format: 'text',
      maxChars: 0,
    }, { app: 'adinals-brc100-test', now: NOW }),
    (error: unknown) => error instanceof AdinalsCollectionValidationError &&
      error.code === 'COLLECTION_MAX_CHARS_INVALID',
  )
})
