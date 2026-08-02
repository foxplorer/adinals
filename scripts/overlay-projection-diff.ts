import { Transaction } from '@bsv/sdk'
import { AdinalsOverlayClient } from '../src/overlay/client.ts'
import {
  readOverlayLifecycleProjection,
  readOverlayLifecycleProjectionPerAd,
} from '../src/readers/overlayReader.ts'

/**
 * Proves the consolidated single-request projection agrees exactly with the
 * per-ad request pattern it replaces, for every collection the node knows.
 * This compares the two code paths against each other, so it is unaffected by
 * how current the node is relative to any public reader.
 */
const endpoint = (process.env.ADINALS_OVERLAY_URL ?? 'http://localhost:8080').replace(/\/+$/, '')
const client = new AdinalsOverlayClient(endpoint)
const now = new Date('2026-08-02T12:00:00.000Z')

const collections = (await client.lookup({ type: 'collections', version: 1, limit: 500 })).outputs
  .map(({ beef, outputIndex }) => `${Transaction.fromBEEF(beef).id('hex')}_${outputIndex}`)

const differences: string[] = []
for (const origin of collections) {
  const consolidatedStarted = Date.now()
  const consolidated = await readOverlayLifecycleProjection(client, origin, now)
  const consolidatedMs = Date.now() - consolidatedStarted
  const perAdStarted = Date.now()
  const perAd = await readOverlayLifecycleProjectionPerAd(client, origin, now)
  const perAdMs = Date.now() - perAdStarted
  const same = JSON.stringify(consolidated) === JSON.stringify(perAd)
  if (!same) differences.push(origin)
  console.log(JSON.stringify({
    origin,
    ads: consolidated.ads.length,
    identical: same,
    consolidatedMs,
    perAdMs,
  }))
}

console.log(JSON.stringify({ collections: collections.length, differing: differences }))
if (differences.length) process.exitCode = 1
