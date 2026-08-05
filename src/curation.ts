/**
 * Product discovery policy, not protocol authority.
 *
 * A collection receives the Foxplorer label only when its cryptographically
 * verified SIGMA creator is in this allowlist. Nothing a collection writes in
 * MAP can grant itself this label. Removing an address delists its collections
 * from discovery without changing their protocol validity or on-chain history.
 */
export const FOXPLORER_CREATOR_ADDRESSES = [
  '15Gn8burrsHF8rMGccEiHMGWrYttPLRNf6',
  // Creator of `Roaming City At Night NPCs`. Listing an address labels every
  // collection it has signed and every one it signs later, not one collection.
  '16Mcmnsk4bdrwfbw8AyDhirWYgJyhbvCD6',
] as const

const foxplorerCreators = new Set<string>(FOXPLORER_CREATOR_ADDRESSES)

export function isFoxplorerCreator(address: string): boolean {
  return foxplorerCreators.has(address)
}
