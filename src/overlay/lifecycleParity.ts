export type LifecycleProjection = {
  collection: {
    origin: string
    creator: string
    capacity: number
    approval: 'open' | 'creator'
    format: 'text' | 'image'
    expiresAt: string | null
    displayEligible: boolean
  }
  ads: Array<{
    origin: string
    slot: number
    currentOutpoint: string
    owner: string
    ownershipOutpoints: string[]
    proposalStatus: 'live' | 'pending' | 'rejected'
    creative: {
      kind: 'text'
      text: string
      sourceOutpoint: string
    }
  }>
}

export type ProductionLifecycleFixture = {
  format: 'adinals-production-lifecycle-v1'
  capturedAt: string
  network: 'mainnet'
  namespace: {
    app: 'adinals'
    type: 'ord'
    protocolVersion: '3'
  }
  collection: {
    origin: string
    creator: string
    capacity: number
    approval: 'open' | 'creator'
    format: 'text' | 'image'
    expiresAt: string | null
  }
  ads: Array<{
    origin: string
    slot: number
    creator: string
    ownershipOutpoints: string[]
    listing: {
      outpoint: string
      seller: string
      priceSatoshis: number
    }
    purchase: {
      outpoint: string
      buyer: string
    }
    update: {
      transitionTxid: string
      predecessorOutpoint: string
      successorOutpoint: string
      recordOutpoint: string
      ownerEpoch: string
      signer: string
      text: string
    }
    decision: {
      outpoint: string
      verdict: 'approved' | 'disapproved'
      transitionTxid: string
      successorOutpoint: string
      updateOutpoint: string
      ownerEpoch: string
      signer: string
    }
    expected: {
      currentOutpoint: string
      owner: string
      proposalStatus: 'live' | 'pending' | 'rejected'
      creativeSourceOutpoint: string
      creativeText: string
    }
  }>
}

const OUTPOINT = /^[0-9a-f]{64}_\d+$/
const TXID = /^[0-9a-f]{64}$/
const SENSITIVE_KEY = /^(?:actionReference|anchorReference|atomicBeef|mnemonic|privateKey|rawtx|seed|wif)$/i

const validTimestamp = (value: string): boolean => {
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString() === value
}

const scanSensitiveKeys = (value: unknown, path = 'fixture'): string[] => {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => scanSensitiveKeys(entry, `${path}[${index}]`))
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => [
    ...(SENSITIVE_KEY.test(key) ? [`${path}.${key} is forbidden in a public lifecycle fixture`] : []),
    ...scanSensitiveKeys(entry, `${path}.${key}`),
  ])
}

/**
 * Validates the immutable relationship contract shared by the current reader
 * and the future overlay. The fixture contains public identifiers and expected
 * derived state only—never wallet-local references or spendable transaction
 * packages.
 */
export function validateProductionLifecycleFixture(
  fixture: ProductionLifecycleFixture,
): string[] {
  const errors = scanSensitiveKeys(fixture)
  if (fixture.format !== 'adinals-production-lifecycle-v1') errors.push('invalid fixture format')
  if (!validTimestamp(fixture.capturedAt)) errors.push('invalid capture timestamp')
  if (fixture.network !== 'mainnet') errors.push('fixture is not mainnet')
  if (
    fixture.namespace.app !== 'adinals' ||
    fixture.namespace.type !== 'ord' ||
    fixture.namespace.protocolVersion !== '3'
  ) errors.push('fixture namespace is not production version 3')

  const collection = fixture.collection
  if (!OUTPOINT.test(collection.origin)) errors.push('invalid collection origin')
  if (!collection.creator) errors.push('missing collection creator')
  if (!Number.isSafeInteger(collection.capacity) || collection.capacity < 1) {
    errors.push('invalid collection capacity')
  }
  if (collection.expiresAt && !validTimestamp(collection.expiresAt)) {
    errors.push('invalid collection expiration')
  }

  const origins = new Set<string>()
  const slots = new Set<number>()
  for (const ad of fixture.ads) {
    const label = `slot ${ad.slot}`
    if (!OUTPOINT.test(ad.origin)) errors.push(`${label}: invalid origin`)
    if (origins.has(ad.origin)) errors.push(`${label}: duplicate origin`)
    origins.add(ad.origin)
    if (!Number.isSafeInteger(ad.slot) || ad.slot < 1 || ad.slot > collection.capacity) {
      errors.push(`${label}: slot is outside collection capacity`)
    }
    if (slots.has(ad.slot)) errors.push(`${label}: duplicate slot`)
    slots.add(ad.slot)
    if (ad.creator !== collection.creator) errors.push(`${label}: mint creator mismatch`)

    const chain = ad.ownershipOutpoints
    if (!chain.length || chain[0] !== ad.origin) errors.push(`${label}: chain does not start at origin`)
    if (chain.some((outpoint) => !OUTPOINT.test(outpoint))) errors.push(`${label}: invalid chain outpoint`)
    if (new Set(chain).size !== chain.length) errors.push(`${label}: duplicate chain outpoint`)
    if (!chain.includes(ad.listing.outpoint)) errors.push(`${label}: listing is absent from chain`)
    if (!chain.includes(ad.purchase.outpoint)) errors.push(`${label}: purchase is absent from chain`)
    if (ad.listing.seller !== collection.creator) errors.push(`${label}: fixture seller mismatch`)
    if (!Number.isSafeInteger(ad.listing.priceSatoshis) || ad.listing.priceSatoshis < 1) {
      errors.push(`${label}: invalid listing price`)
    }
    if (ad.purchase.outpoint !== ad.update.ownerEpoch) errors.push(`${label}: owner epoch mismatch`)
    if (ad.purchase.buyer !== ad.update.signer) errors.push(`${label}: update signer is not buyer`)

    const transition = ad.update.transitionTxid
    if (!TXID.test(transition)) errors.push(`${label}: invalid transition txid`)
    if (ad.update.predecessorOutpoint !== ad.purchase.outpoint) {
      errors.push(`${label}: update does not spend purchase state`)
    }
    if (ad.update.successorOutpoint !== `${transition}_0`) {
      errors.push(`${label}: successor is not transition output 0`)
    }
    if (ad.update.recordOutpoint !== `${transition}_1`) {
      errors.push(`${label}: update record is not transition output 1`)
    }
    if (chain.at(-1) !== ad.update.successorOutpoint) errors.push(`${label}: chain does not end at update state`)

    const decision = ad.decision
    if (!OUTPOINT.test(decision.outpoint)) errors.push(`${label}: invalid decision outpoint`)
    if (decision.signer !== collection.creator) errors.push(`${label}: decision signer mismatch`)
    if (decision.transitionTxid !== transition) errors.push(`${label}: decision transition mismatch`)
    if (decision.successorOutpoint !== ad.update.successorOutpoint) {
      errors.push(`${label}: decision successor mismatch`)
    }
    if (decision.updateOutpoint !== ad.update.recordOutpoint) errors.push(`${label}: decision update mismatch`)
    if (decision.ownerEpoch !== ad.update.ownerEpoch) errors.push(`${label}: decision epoch mismatch`)

    const expected = ad.expected
    if (expected.currentOutpoint !== ad.update.successorOutpoint) {
      errors.push(`${label}: expected current state mismatch`)
    }
    if (expected.owner !== ad.purchase.buyer) errors.push(`${label}: expected owner mismatch`)
    if (expected.creativeSourceOutpoint !== ad.update.recordOutpoint) {
      errors.push(`${label}: expected creative source mismatch`)
    }
    const expectedStatus = decision.verdict === 'approved' ? 'live' : 'rejected'
    if (expected.proposalStatus !== expectedStatus) errors.push(`${label}: expected proposal status mismatch`)
    if (expected.creativeText !== ad.update.text && decision.verdict === 'approved') {
      errors.push(`${label}: approved creative text mismatch`)
    }
  }
  return errors
}

export function expectedLifecycleProjection(
  fixture: ProductionLifecycleFixture,
  now: Date,
): LifecycleProjection {
  const expiration = fixture.collection.expiresAt
  return {
    collection: {
      ...fixture.collection,
      displayEligible: !expiration || Date.parse(expiration) > now.getTime(),
    },
    ads: fixture.ads.map((ad) => ({
      origin: ad.origin,
      slot: ad.slot,
      currentOutpoint: ad.expected.currentOutpoint,
      owner: ad.expected.owner,
      ownershipOutpoints: [...ad.ownershipOutpoints],
      proposalStatus: ad.expected.proposalStatus,
      creative: {
        kind: 'text',
        text: ad.expected.creativeText,
        sourceOutpoint: ad.expected.creativeSourceOutpoint,
      },
    })),
  }
}

/** Provider-neutral equality check used during GorillaPool/overlay dual reads. */
export function compareLifecycleProjection(
  expected: LifecycleProjection,
  actual: LifecycleProjection,
): string[] {
  const errors: string[] = []
  for (const key of ['origin', 'creator', 'capacity', 'approval', 'format', 'expiresAt', 'displayEligible'] as const) {
    if (expected.collection[key] !== actual.collection[key]) errors.push(`collection.${key} differs`)
  }

  const actualAds = new Map(actual.ads.map((ad) => [ad.origin, ad]))
  if (actual.ads.length !== expected.ads.length) errors.push('ad count differs')
  for (const expectedAd of expected.ads) {
    const actualAd = actualAds.get(expectedAd.origin)
    if (!actualAd) {
      errors.push(`${expectedAd.origin}: missing ad`)
      continue
    }
    for (const key of ['slot', 'currentOutpoint', 'owner', 'proposalStatus'] as const) {
      if (expectedAd[key] !== actualAd[key]) errors.push(`${expectedAd.origin}.${key} differs`)
    }
    if (JSON.stringify(expectedAd.ownershipOutpoints) !== JSON.stringify(actualAd.ownershipOutpoints)) {
      errors.push(`${expectedAd.origin}.ownershipOutpoints differs`)
    }
    if (JSON.stringify(expectedAd.creative) !== JSON.stringify(actualAd.creative)) {
      errors.push(`${expectedAd.origin}.creative differs`)
    }
  }
  return errors
}
