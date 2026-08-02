import type { PublicLifecycleProjection } from '../overlay/lifecycleParity.ts'
import { Hash, Utils } from '@bsv/sdk'

export const DEFAULT_ADINALS_API_BASE =
  'https://tenmillionfoxes-99288f417d7b.herokuapp.com/adinals/v1'

type DerivedCreative = {
  kind?: unknown
  text?: unknown
  sourceOutpoint?: unknown
  contentUrl?: unknown
}

const stringValue = (value: unknown): string => typeof value === 'string' ? value : ''

export async function readDerivedCollectionProjection(
  collectionOrigin: string,
  options: { apiBase?: string; fetcher?: typeof fetch } = {},
): Promise<PublicLifecycleProjection> {
  const origin = collectionOrigin.trim().toLowerCase()
  if (!/^[0-9a-f]{64}_\d+$/.test(origin)) throw new Error('A valid derived-reader collection origin is required.')
  const fetcher = options.fetcher ?? fetch
  const apiBase = (options.apiBase ?? DEFAULT_ADINALS_API_BASE).replace(/\/+$/, '')
  const response = await fetcher(`${apiBase}/collections/${origin}/live`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Current Adinals reader failed: ${response.status}`)
  const body = await response.json() as Record<string, unknown>
  const collection = body.collection && typeof body.collection === 'object'
    ? body.collection as Record<string, unknown>
    : null
  const ads = Array.isArray(body.ads) ? body.ads : null
  if (
    body.protocolVersion !== '3' ||
    body.namespace !== 'adinals' ||
    !collection ||
    !ads
  ) throw new Error('Current Adinals reader returned an invalid versioned collection response.')
  const capacity = Number(collection.capacity)
  const approval = collection.approval
  const format = collection.format
  if (
    collection.id !== origin ||
    !stringValue(collection.creator) ||
    !Number.isSafeInteger(capacity) || capacity < 1 ||
    (approval !== 'open' && approval !== 'creator') ||
    (format !== 'text' && format !== 'image')
  ) throw new Error('Current Adinals reader returned invalid collection rules.')

  const projectedAds = await Promise.all(ads.map(async (value, index) => {
    const ad = value && typeof value === 'object' ? value as Record<string, unknown> : null
    const creative = ad?.creative && typeof ad.creative === 'object'
      ? ad.creative as DerivedCreative
      : null
    const slot = Number(ad?.slot)
    const adOrigin = stringValue(ad?.origin)
    const currentOutpoint = stringValue(ad?.currentOutpoint)
    const owner = stringValue(ad?.owner)
    const proposalStatus = ad?.proposalStatus
    const kind = creative?.kind
    const sourceOutpoint = stringValue(creative?.sourceOutpoint)
    const contentUrl = stringValue(creative?.contentUrl)
    if (
      !/^[0-9a-f]{64}_\d+$/.test(adOrigin) ||
      !/^[0-9a-f]{64}_\d+$/.test(currentOutpoint) ||
      !owner ||
      !Number.isSafeInteger(slot) || slot < 1 ||
      (proposalStatus !== 'live' && proposalStatus !== 'pending' && proposalStatus !== 'rejected') ||
      (kind !== 'text' && kind !== 'image') ||
      !/^[0-9a-f]{64}_\d+$/.test(sourceOutpoint)
    ) throw new Error(`Current Adinals reader returned an invalid ad at index ${index}.`)
    const creativeKind: 'text' | 'image' = kind
    const status: 'live' | 'pending' | 'rejected' = proposalStatus
    let contentHash = ''
    if (creativeKind === 'image') {
      let url: URL
      try {
        url = new URL(contentUrl)
      } catch {
        throw new Error(`Current Adinals reader returned an invalid image URL at index ${index}.`)
      }
      if (url.protocol !== 'https:' || !url.hostname || !url.pathname.endsWith(`/${sourceOutpoint}`)) {
        throw new Error(`Current Adinals reader returned an invalid image URL at index ${index}.`)
      }
      const contentResponse = await fetcher(url.toString(), {
        headers: { accept: 'image/png,image/jpeg,image/webp,application/octet-stream' },
        cache: 'no-store',
      })
      if (!contentResponse.ok) throw new Error(`Current Adinals image read failed: ${contentResponse.status}`)
      const bytes = new Uint8Array(await contentResponse.arrayBuffer())
      if (!bytes.length || bytes.length > 1_000_000) throw new Error('Current Adinals image bytes are invalid.')
      contentHash = Utils.toHex(Hash.sha256([...bytes]))
    }
    return {
      origin: adOrigin,
      slot,
      currentOutpoint,
      owner,
      proposalStatus: status,
      creative: {
        kind: creativeKind,
        text: creativeKind === 'text' ? stringValue(creative?.text) : '',
        // The current JSON reader exposes an image URL rather than immutable
        // content bytes. Deep image-byte parity remains an overlay proof gate.
        contentHash,
        sourceOutpoint,
      },
    }
  }))
  projectedAds.sort((left, right) => left.slot - right.slot || left.origin.localeCompare(right.origin))
  return {
    collection: {
      origin,
      creator: stringValue(collection.creator),
      capacity,
      approval,
      format,
      expiresAt: stringValue(collection.expiresAt) || null,
      displayEligible: body.displayEligible === true,
    },
    ads: projectedAds,
  }
}
