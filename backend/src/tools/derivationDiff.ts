import { MongoClient } from 'mongodb'
import { AdinalsStorage } from '../lookup-services/AdinalsStorage.js'
import { AdinalsLookupService } from '../lookup-services/AdinalsLookupServiceFactory.js'
import { replayProjections } from '../lookup-services/projectionReplay.js'
import {
  buildCollectionProjection,
  collectionOriginsIn,
  outpointOf
} from '../lookup-services/projections.js'
import { resolveMintWinners } from '../lookup-services/mintResolution.js'
import {
  resolveAdCurrent,
  resolveAdHistory,
  resolveCollectionLiveEvidence,
  resolveCollectionProjectionEvidence,
  resolvePendingDecisionEvidence
} from '../lookup-services/lifecycleResolution.js'
import type { LookupFormula } from '@bsv/overlay'
import type { AdmittedOutputRecord } from '../lookup-services/AdinalsStorage.js'

/**
 * Proves the derived layer answers exactly what the scanning resolver answered.
 *
 * The resolver in `lifecycleResolution.ts` stays the definition of what a chain
 * means. This replays the projection built from it and then asks the live
 * service the same questions, so a divergence is a bug in the projection rather
 * than a difference of opinion about the protocol.
 *
 * Answers are compared as sets. A lookup formula is a set of output references
 * — the reader hydrates each one and re-derives — so order carries no meaning,
 * and the resolver's own order depends on whatever order storage returned rows
 * in, which is not reproducible across a replay.
 */
const url = process.env.ADINALS_MONGO_URL ?? 'mongodb://127.0.0.1:27017'
const dbName = process.env.ADINALS_MONGO_DB ?? 'LARS_lookup_services'

const asSet = (formula: LookupFormula): Set<string> =>
  new Set(formula.map(({ txid, outputIndex }) => `${txid}_${outputIndex}`))

const expectedSet = (records: readonly AdmittedOutputRecord[]): Set<string> =>
  new Set(records.map(outpointOf))

let failures = 0
let checks = 0

const compare = (label: string, expected: Set<string>, actual: Set<string>): void => {
  checks += 1
  const missing = [...expected].filter((item) => !actual.has(item))
  const extra = [...actual].filter((item) => !expected.has(item))
  if (missing.length === 0 && extra.length === 0) return
  failures += 1
  console.error(`\n  DIVERGENCE ${label}`)
  console.error(`    expected ${expected.size} outputs, got ${actual.size}`)
  if (missing.length) console.error(`    missing: ${missing.join(', ')}`)
  if (extra.length) console.error(`    extra  : ${extra.join(', ')}`)
}

const client = new MongoClient(url)
await client.connect()
const db = client.db(dbName)
const storage = new AdinalsStorage(db)

await storage.ensureIndexes()
const records = await storage.findAllRecords()
console.log(`evidence: ${records.length} admitted outputs`)

const replay = await replayProjections(storage)
console.log(
  `replay  : ${replay.collections} collections, ${replay.ads} ads, ` +
  `${replay.emptyCollections} empty, ${replay.milliseconds} ms\n`
)

/**
 * The scoped rebuild an admission performs must equal the whole-namespace one.
 *
 * `replayCollection` derives from `findRecordsByCollection`, so it only sees
 * rows the scope annotation reached. If any row on a chain were unannotated the
 * incremental path would silently build a shorter answer than a full replay,
 * and every gate that replays first would agree with itself and miss it.
 */
for (const origin of collectionOriginsIn(records)) {
  const scopedRecords = await storage.findRecordsByCollection(origin)
  const full = buildCollectionProjection(records, origin)
  const scoped = buildCollectionProjection(scopedRecords, origin)
  compare(
    `scoped-vs-full ads   ${origin.slice(0, 12)}…`,
    new Set(full.ads.map((ad) => ad.adOrigin)),
    new Set(scoped.ads.map((ad) => ad.adOrigin))
  )
  for (const ad of full.ads) {
    const match = scoped.ads.find((candidate) => candidate.adOrigin === ad.adOrigin)
    compare(
      `scoped-vs-full ev    ${ad.adOrigin.slice(0, 12)}…`,
      new Set(ad.evidence),
      new Set(match?.evidence ?? [])
    )
  }
}

const service = new AdinalsLookupService(storage)
const ask = async (query: Record<string, unknown>): Promise<Set<string>> =>
  asSet(await service.lookup({ service: 'ls_adinals', query }))

const origins = collectionOriginsIn(records)
for (const origin of origins) {
  compare(
    `collectionProjection ${origin.slice(0, 12)}…`,
    expectedSet(resolveCollectionProjectionEvidence(records, origin)),
    await ask({ type: 'collectionProjection', version: 1, origin })
  )
  compare(
    `collectionLive       ${origin.slice(0, 12)}…`,
    expectedSet(resolveCollectionLiveEvidence(records, origin)),
    await ask({ type: 'collectionLive', version: 1, origin })
  )
  // The projection drops an ad whose history does not resolve, while
  // `resolveMintWinners` returns a slot winner regardless. Any difference is
  // therefore real and belongs in the report rather than in an assumption.
  compare(
    `adsByCollection      ${origin.slice(0, 12)}…`,
    new Set(
      resolveMintWinners(records)
        .filter((mint) => {
          try {
            const data = JSON.parse(mint.map?.subTypeData ?? '') as { collectionId?: unknown }
            return data.collectionId === origin
          } catch {
            return false
          }
        })
        .map(outpointOf)
    ),
    await ask({ type: 'adsByCollection', version: 1, collectionId: origin })
  )
}

const mints = resolveMintWinners(records)
for (const mint of mints) {
  const adOrigin = outpointOf(mint)
  const history = resolveAdHistory(records, adOrigin)
  if (!history) continue
  compare(
    `history              ${adOrigin.slice(0, 12)}…`,
    expectedSet(history.evidence),
    await ask({ type: 'history', version: 1, origin: adOrigin })
  )
  compare(
    `adCurrent            ${adOrigin.slice(0, 12)}…`,
    expectedSet(resolveAdCurrent(history).evidence),
    await ask({ type: 'adCurrent', version: 1, origin: adOrigin })
  )
}

/**
 * Readers rely on order in exactly one place, so it is asserted rather than
 * assumed. `overlayReader` refuses a history whose first ownership state is not
 * the ad's origin, and the set comparison above cannot see ordering at all.
 */
const STATE_TYPES = new Set(['collectionItem', 'listing', 'state'])
for (const mint of mints) {
  const adOrigin = outpointOf(mint)
  const answer = await service.lookup({
    service: 'ls_adinals',
    query: { type: 'history', version: 1, origin: adOrigin }
  })
  if (answer.length === 0) continue
  const states: string[] = []
  for (const { txid, outputIndex } of answer) {
    const row = await storage.findOutputRecord(txid, outputIndex)
    if (row?.recordType && STATE_TYPES.has(row.recordType)) {
      states.push(`${txid}_${outputIndex}`)
    }
  }
  checks += 1
  if (states[0] !== adOrigin) {
    failures += 1
    console.error(`\n  ORDER VIOLATION history ${adOrigin.slice(0, 12)}…`)
    console.error(`    first ownership state is ${states[0] ?? '(none)'}, expected the mint`)
  }
}

const creators = [...new Set(
  records
    .filter((record) => record.recordType === 'collection' && record.signerAddress)
    .map((record) => record.signerAddress as string)
)]
for (const creator of creators) {
  compare(
    `pendingDecisions     ${creator.slice(0, 12)}…`,
    expectedSet(resolvePendingDecisionEvidence(records, creator)),
    await ask({ type: 'pendingDecisions', version: 1, creator })
  )
}

console.log(`\ncompared ${checks} answers across ${origins.length} collections, ` +
  `${mints.length} ads, ${creators.length} creators`)

if (failures > 0) {
  console.error(`\nFAIL: ${failures} divergent answers`)
  await client.close()
  process.exit(1)
}
console.log('PASS: derived layer matches the scanning resolver exactly')
await client.close()
