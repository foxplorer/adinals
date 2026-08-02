import { readFile } from 'node:fs/promises'
import { Transaction } from '@bsv/sdk'
import { AdinalsOverlayClient } from '../src/overlay/client.ts'
import {
  compareLifecycleProjection,
  comparePublicLifecycleProjection,
  expectedLifecycleProjection,
  publicLifecycleProjection,
  type ProductionLifecycleFixture,
} from '../src/overlay/lifecycleParity.ts'
import { readDerivedCollectionProjection } from '../src/readers/derivedApiReader.ts'
import { readOverlayLifecycleProjection } from '../src/readers/overlayReader.ts'

const endpoint = (process.env.ADINALS_OVERLAY_URL ?? 'http://localhost:8080').replace(/\/+$/, '')
const fixture = JSON.parse(await readFile(
  new URL('../tests/fixtures/overlay/production-lifecycle-b70c33ad.json', import.meta.url),
  'utf8',
)) as ProductionLifecycleFixture
const now = new Date()
const client = new AdinalsOverlayClient(endpoint)

const collections = await (await client.lookup({
  type: 'collections', version: 1, limit: 500,
})).outputs
  .map(({ beef, outputIndex }) => `${Transaction.fromBEEF(beef).id('hex')}_${outputIndex}`)
const comparisons = await Promise.all(collections.map(async (origin) => {
  const [overlay, reference] = await Promise.all([
    readOverlayLifecycleProjection(client, origin, now),
    readDerivedCollectionProjection(origin),
  ])
  return {
    origin,
    overlay,
    reference,
    errors: comparePublicLifecycleProjection(reference, publicLifecycleProjection(overlay)),
  }
}))
const publicErrors = comparisons.flatMap((comparison) =>
  comparison.errors.map((error) => `${comparison.origin}: ${error}`))
const retained = comparisons.find((comparison) => comparison.origin === fixture.collection.origin)
if (!retained) throw new Error('Retained collection is absent from namespace parity.')
const overlay = retained.overlay
const reference = retained.reference

const expectedDeep = expectedLifecycleProjection(fixture, now)
const retainedOrigins = new Set(expectedDeep.ads.map((ad) => ad.origin))
const retainedOverlay = {
  ...overlay,
  ads: overlay.ads.filter((ad) => retainedOrigins.has(ad.origin)),
}
const deepErrors = compareLifecycleProjection(expectedDeep, retainedOverlay)
const errors = [...publicErrors, ...deepErrors]
if (errors.length) {
  const divergent = comparisons
    .filter((comparison) => comparison.errors.length)
    .map((comparison) => ({
      origin: comparison.origin,
      errors: comparison.errors,
      reference: comparison.reference,
      overlay: publicLifecycleProjection(comparison.overlay),
    }))
  console.error(JSON.stringify({ divergent }, null, 2))
  throw new Error(`Overlay reader parity failed: ${errors.join('; ')}`)
}

console.log(JSON.stringify({
  endpoint,
  collection: fixture.collection.origin,
  namespaceCollectionCount: comparisons.length,
  namespaceAdCount: comparisons.reduce((total, comparison) => total + comparison.overlay.ads.length, 0),
  currentReaderAdCount: reference.ads.length,
  overlayAdCount: overlay.ads.length,
  retainedDeepHistoryCount: retainedOverlay.ads.length,
  publicReaderParity: true,
  retainedHistoryOwnerEpochListingParity: true,
  displayEligible: overlay.collection.displayEligible,
}))
