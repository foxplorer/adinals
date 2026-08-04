import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADINALS_TEXT_MAX_BYTES,
  ADINALS_TEXT_MAX_CHARS,
  adTextByteLength,
} from './records.ts'
import { buildAdinalMintMap } from './adinalMetadata.ts'

/**
 * The browser half of the text-limit conformance contract. These assertions
 * mirror `backend/src/protocol/textLimits.test.ts` exactly: if the two copies
 * of the limit ever diverge, one of these suites fails and the drift is caught
 * before a wallet writes a record the overlay would refuse.
 */
const COLLECTION_ID = `${'a'.repeat(64)}_0`

test('browser limits match the overlay limits exactly', () => {
  assert.equal(ADINALS_TEXT_MAX_CHARS, 512)
  assert.equal(ADINALS_TEXT_MAX_BYTES, 512)
  assert.ok(ADINALS_TEXT_MAX_BYTES <= 520, 'must stay under the pre-Genesis element limit')
})

test('byte length is counted in UTF-8, not code points', () => {
  assert.equal(adTextByteLength('a'.repeat(512)), 512)
  assert.equal(adTextByteLength('😀'), 4)
  assert.equal([...'😀'.repeat(128)].length, 128)
  assert.equal(adTextByteLength('😀'.repeat(128)), 512)
})

test('a mint at the limit is accepted', () => {
  const map = buildAdinalMintMap({
    name: 'Ad',
    serial: 1,
    collectionId: COLLECTION_ID,
    format: 'text',
    text: 'a'.repeat(512),
    maxChars: 512,
  })
  assert.equal((map as Record<string, string>).adText.length, 512)
})

test('a mint beyond the character limit is refused before broadcast', () => {
  assert.throws(
    () => buildAdinalMintMap({
      name: 'Ad',
      serial: 1,
      collectionId: COLLECTION_ID,
      format: 'text',
      text: 'a'.repeat(513),
      maxChars: 5_000,
    }),
    /512 characters or fewer/,
  )
})

test('a mint short in characters but long in bytes is refused', () => {
  // 200 emoji is 200 characters and 800 bytes: inside the character cap,
  // outside what the script can carry compatibly.
  assert.throws(
    () => buildAdinalMintMap({
      name: 'Ad',
      serial: 1,
      collectionId: COLLECTION_ID,
      format: 'text',
      text: '😀'.repeat(200),
      maxChars: 512,
    }),
    /512 UTF-8 bytes or fewer/,
  )
})
