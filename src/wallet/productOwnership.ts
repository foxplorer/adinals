import type { WalletInterface } from '@bsv/sdk'
import type { OwnedCustodyOutput } from '../readers/custodyRouting.ts'
import type { OwnershipModel } from '../readers/ownershipModel.ts'

type CollectionRoute = {
  keyID: string
  address: string
}

export type LabKeys = {
  wallet: WalletInterface
  identityKey: string
  basket: string
  /** Compatibility display value only; ownership checks use basket custody. */
  ordAddress: string
  /** BRC-100 funds actions internally; there is no application payment key. */
  payAddress: string
  collectionRoutes: Map<string, CollectionRoute>
  outputRoutes: Map<string, OwnedCustodyOutput>
  ownedAdOrigins: Set<string>
  ownedListings: Set<string>
}

export const normalizedOutpoint = (value: string): string =>
  value.trim().replace('.', '_').toLowerCase()

export function createConnectedLabKeys(
  wallet: WalletInterface,
  session: { identityKey: string; basket?: string | null },
  ownership: OwnershipModel | null,
): LabKeys {
  const collectionRoutes = new Map<string, CollectionRoute>()
  const outputRoutes = new Map<string, OwnedCustodyOutput>()
  const ownedAdOrigins = new Set<string>()
  const ownedListings = new Set<string>()
  for (const collection of ownership?.collections ?? []) {
    const custody = collection.custody
    if (!custody) continue
    collectionRoutes.set(normalizedOutpoint(collection.origin), {
      keyID: custody.ownerKeyID,
      address: custody.derivedOwner,
    })
  }
  for (const ad of ownership?.ads ?? []) {
    if (!ad.custody) continue
    if (!ad.custody.spendable) continue
    ownedAdOrigins.add(normalizedOutpoint(ad.origin))
    outputRoutes.set(normalizedOutpoint(ad.currentOutpoint), ad.custody)
    outputRoutes.set(normalizedOutpoint(ad.origin), ad.custody)
    if (ad.listed) ownedListings.add(normalizedOutpoint(ad.currentOutpoint))
  }
  const firstAddress = collectionRoutes.values().next().value?.address
    ?? outputRoutes.values().next().value?.derivedOwner
    ?? ''
  return {
    wallet,
    identityKey: session.identityKey,
    basket: session.basket ?? 'adinals',
    ordAddress: firstAddress,
    payAddress: firstAddress,
    collectionRoutes,
    outputRoutes,
    ownedAdOrigins,
    ownedListings,
  }
}

export const ownsCollection = (keys: LabKeys, origin: string): boolean =>
  keys.collectionRoutes.has(normalizedOutpoint(origin))

export const ownsAd = (
  keys: LabKeys,
  originOrOutpoint: string,
  expectedOwner?: string,
): boolean => {
  const outpoint = normalizedOutpoint(originOrOutpoint)
  const route = keys.outputRoutes.get(outpoint)
  const hasCustodyRoute = keys.ownedAdOrigins.has(outpoint) || Boolean(route)
  if (!hasCustodyRoute) return false
  if (expectedOwner === undefined) return true
  return route?.derivedOwner === expectedOwner
}

export const ownsListing = (keys: LabKeys, outpoint: string): boolean =>
  keys.ownedListings.has(normalizedOutpoint(outpoint))

export type ProductActionKind = 'mint' | 'update' | 'decision' | 'listing' | 'purchase' | 'cancel'

export function productOwnershipEffect(kind: ProductActionKind): {
  linkAdOrigin: boolean
  storeCustodyRoute: boolean
} {
  return {
    linkAdOrigin: kind === 'mint' || kind === 'update',
    // A creator decision is an authority record, not the live Adinal state.
    storeCustodyRoute: kind !== 'decision',
  }
}

/** Link a newly acquired state output back to the ad's permanent origin. */
export function rememberOwnedAd(
  keys: LabKeys,
  origin: string,
  currentOutpoint: string,
): boolean {
  const route = keys.outputRoutes.get(normalizedOutpoint(currentOutpoint))
  if (!route) return false
  const normalizedOrigin = normalizedOutpoint(origin)
  keys.ownedAdOrigins.add(normalizedOrigin)
  keys.outputRoutes.set(normalizedOrigin, route)
  return true
}
