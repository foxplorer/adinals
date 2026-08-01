import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateSigmaAnchorReserve,
  estimateSigmaChildBytes,
  SIGMA_ANCHOR_MINIMUM_SATOSHIS,
} from './sigmaAnchorReserve.ts'

test('small text records stay near the 200-satoshi floor instead of the old 2,000-satoshi reserve', () => {
  assert.equal(calculateSigmaAnchorReserve(500), SIGMA_ANCHOR_MINIMUM_SATOSHIS)
  assert.ok(calculateSigmaAnchorReserve(1_000) > SIGMA_ANCHOR_MINIMUM_SATOSHIS)
  assert.ok(calculateSigmaAnchorReserve(1_000) < 300)
})

test('large image records scale the reserve with their actual script bytes', () => {
  const small = calculateSigmaAnchorReserve(1_000)
  const image300Kb = calculateSigmaAnchorReserve(300_000)
  const image1Mb = calculateSigmaAnchorReserve(1_000_000)

  assert.ok(small >= 200 && small < 300)
  assert.ok(image300Kb >= 30_000 && image300Kb < 31_000)
  assert.ok(image1Mb >= 100_000 && image1Mb < 101_000)
  assert.ok(image1Mb > image300Kb)
})

test('estimate includes the SIGMA envelope and conservative transaction overhead', () => {
  assert.ok(estimateSigmaChildBytes(0) > 600)
  assert.equal(estimateSigmaChildBytes(1_000_000) - estimateSigmaChildBytes(0), 1_000_004)
  assert.throws(() => calculateSigmaAnchorReserve(-1), /non-negative safe integer/)
})
