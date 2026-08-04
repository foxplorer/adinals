import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADINALS_TEXT_MAX_BYTES,
  ADINALS_TEXT_MAX_CHARS,
  utf8Bytes
} from './recordEnvelope.js'

/**
 * The cap exists because a MAP value is one script pushdata, and 520 bytes was
 * the pre-Genesis maximum script element size. Genesis lifted it, so nothing
 * here is a consensus rule — it is a compatibility boundary chosen to stay
 * inside an assumption that older tooling still makes.
 *
 * These vectors are the conformance contract between this validator and the
 * browser's copy in `src/protocol/records.ts`. Both must refuse the same
 * inputs, or a wallet writes a record its own overlay rejects.
 */
test('the cap sits inside the legacy script element limit', () => {
  assert.equal(ADINALS_TEXT_MAX_CHARS, 512)
  assert.equal(ADINALS_TEXT_MAX_BYTES, 512)
  assert.ok(ADINALS_TEXT_MAX_BYTES <= 520, 'must stay under the pre-Genesis element limit')
})

test('byte length is counted in UTF-8, not code points', () => {
  assert.equal(utf8Bytes('a'.repeat(512)), 512)
  // A four-byte character costs four bytes of pushdata despite being one
  // "character" to a creator, which is why both limits are enforced.
  assert.equal(utf8Bytes('😀'), 4)
  assert.equal(utf8Bytes('😀'.repeat(128)), 512)
  assert.equal([...'😀'.repeat(128)].length, 128)
})

test('a text that is short in characters can still exceed the byte limit', () => {
  const emoji = '😀'.repeat(200)
  assert.equal([...emoji].length, 200)
  assert.ok([...emoji].length <= ADINALS_TEXT_MAX_CHARS, 'passes the character check')
  assert.ok(utf8Bytes(emoji) > ADINALS_TEXT_MAX_BYTES, 'and must still be refused on bytes')
})

test('production text is far inside the cap', () => {
  // The longest text ever minted in the v3 namespace is 16 characters, so this
  // cap refuses nothing that exists.
  assert.ok(16 <= ADINALS_TEXT_MAX_CHARS)
  assert.ok(utf8Bytes('a'.repeat(16)) <= ADINALS_TEXT_MAX_BYTES)
})
