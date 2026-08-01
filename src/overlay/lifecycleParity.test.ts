import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  compareLifecycleProjection,
  expectedLifecycleProjection,
  validateProductionLifecycleFixture,
  type ProductionLifecycleFixture,
} from './lifecycleParity.ts'

const fixtureUrl = new URL(
  '../../tests/fixtures/overlay/production-lifecycle-b70c33ad.json',
  import.meta.url,
)

const readFixture = async (): Promise<ProductionLifecycleFixture> => JSON.parse(
  await readFile(fixtureUrl, 'utf8'),
) as ProductionLifecycleFixture

test('retains a sanitized, internally linked production lifecycle manifest', async () => {
  const fixture = await readFixture()
  assert.deepEqual(validateProductionLifecycleFixture(fixture), [])
  assert.equal(fixture.ads.length, 2)
})

test('derives an expiration-aware provider-neutral parity projection', async () => {
  const fixture = await readFixture()
  const beforeExpiration = expectedLifecycleProjection(fixture, new Date('2026-08-02T00:00:00.000Z'))
  const afterExpiration = expectedLifecycleProjection(fixture, new Date('2026-08-09T00:00:00.000Z'))
  assert.equal(beforeExpiration.collection.displayEligible, true)
  assert.equal(afterExpiration.collection.displayEligible, false)
  assert.deepEqual(compareLifecycleProjection(beforeExpiration, structuredClone(beforeExpiration)), [])
})

test('rejects broken transition links and spend-authority material', async () => {
  const fixture = await readFixture()
  const broken = structuredClone(fixture) as ProductionLifecycleFixture & { privateKey?: string }
  broken.ads[0]!.update.recordOutpoint = `${'f'.repeat(64)}_1`
  broken.privateKey = 'must-never-be-retained'
  const errors = validateProductionLifecycleFixture(broken)
  assert.ok(errors.some((error) => error.includes('update record is not transition output 1')))
  assert.ok(errors.some((error) => error.includes('privateKey is forbidden')))
})

test('reports overlay projection drift by immutable ad origin', async () => {
  const fixture = await readFixture()
  const expected = expectedLifecycleProjection(fixture, new Date('2026-08-02T00:00:00.000Z'))
  const drifted = structuredClone(expected)
  drifted.ads[0]!.owner = 'wrong-owner'
  drifted.ads[1]!.creative.text = 'wrong creative'
  assert.deepEqual(compareLifecycleProjection(expected, drifted), [
    `${expected.ads[0]!.origin}.owner differs`,
    `${expected.ads[1]!.origin}.creative differs`,
  ])
})
