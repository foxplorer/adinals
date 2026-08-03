import { Transaction } from '@bsv/sdk'
import { AdinalsOverlayClient } from '../src/overlay/client.ts'
import {
  readOverlayCollectionView,
  readOverlayLifecycleProjection,
} from '../src/readers/overlayReader.ts'

/**
 * Proves the rendered view model agrees with the parity projection.
 *
 * Both derive from the same evidence, and the projection is the shape the
 * public reader has already been compared against, so a disagreement here is a
 * mapping defect in the view model rather than a stale node. The comparison is
 * limited to the facts both produce: the fields the view model adds beyond it
 * are MAP values and chain positions, which the projection never carried.
 */
const endpoint = (process.env.ADINALS_OVERLAY_URL ?? 'http://localhost:8080').replace(/\/+$/, '')
const client = new AdinalsOverlayClient(endpoint)
const now = new Date()

const collections = (await client.lookup({ type: 'collections', version: 1, limit: 500 })).outputs
  .map(({ beef, outputIndex }) => `${Transaction.fromBEEF(beef).id('hex')}_${outputIndex}`)

const differences: Array<{ origin: string; errors: string[] }> = []
for (const origin of collections) {
  const projection = await readOverlayLifecycleProjection(client, origin, now)
  const started = Date.now()
  const { view, creatives } = await readOverlayCollectionView(client, origin, now)
  const elapsedMs = Date.now() - started
  const errors: string[] = []

  if (!view) {
    errors.push('view model returned nothing for a collection the projection resolved')
  } else {
    if (view.collection.creator !== projection.collection.creator) errors.push('creator')
    if (view.collection.max !== projection.collection.capacity) errors.push('capacity')
    if (view.collection.approval !== projection.collection.approval) errors.push('approval')
    if (view.collection.format !== projection.collection.format) errors.push('format')
    if ((view.collection.expiresAt || null) !== projection.collection.expiresAt) errors.push('expiration')
    if (view.collection.expired === projection.collection.displayEligible) errors.push('display eligibility')

    const ads = new Map(view.ads.map((ad) => [ad.origin, ad]))
    if (ads.size !== projection.ads.length) errors.push(`ad count ${ads.size} vs ${projection.ads.length}`)
    for (const expected of projection.ads) {
      const ad = ads.get(expected.origin)
      if (!ad) {
        errors.push(`missing ad ${expected.origin}`)
        continue
      }
      const context = expected.origin.slice(0, 10)
      if (ad.serial !== expected.slot) errors.push(`${context} slot`)
      if (ad.outpoint !== expected.currentOutpoint) errors.push(`${context} current outpoint`)
      if (ad.owner !== expected.owner) errors.push(`${context} owner`)
      if (ad.ownerEpoch !== expected.ownerEpoch) errors.push(`${context} owner epoch`)
      if (ad.status !== expected.proposalStatus) errors.push(`${context} proposal status`)
      if (ad.format !== expected.creative.kind) errors.push(`${context} creative kind`)
      if (JSON.stringify(ad.listing) !== JSON.stringify(expected.listing)) errors.push(`${context} listing`)
      if (expected.creative.kind === 'text' && ad.liveText !== expected.creative.text) {
        errors.push(`${context} live text`)
      }
      // The projection identifies an image creative by content hash and the
      // view model by the outpoint the bytes were inscribed at, so compare the
      // source both name rather than the two different identifiers.
      if (expected.creative.kind === 'image' && ad.liveContentUrl !== expected.creative.sourceOutpoint) {
        errors.push(`${context} live creative source`)
      }
    }
  }

  if (errors.length) differences.push({ origin, errors })
  console.log(JSON.stringify({
    origin,
    ads: view?.ads.length ?? 0,
    updates: view?.ads.reduce((total, ad) => total + ad.updates.length, 0) ?? 0,
    marketEvents: view?.ads.reduce((total, ad) => total + ad.marketEvents.length, 0) ?? 0,
    // Creatives the same response carried, which the browser renders instead of
    // asking a content host for them.
    images: creatives.length,
    imageBytes: creatives.reduce((total, creative) => total + creative.bytes.length, 0),
    elapsedMs,
    errors,
  }))
}

console.log(JSON.stringify({
  endpoint,
  collections: collections.length,
  differing: differences,
}))
if (differences.length) process.exitCode = 1
