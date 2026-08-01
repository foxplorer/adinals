import type { WalletProtocol } from '@bsv/sdk'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import type { AdinalsMap } from '../protocol/recordValidation.ts'

/**
 * How the connected wallet's basket is turned into Adinals ownership.
 *
 * The raw-key application answered "is this mine?" with one permanent
 * `ordAddress`. A BRC-100 wallet derives a fresh key per record, so there is no
 * such address to compare against: custody is discovered from the basket and
 * the per-output `customInstructions` each writer attached. This module is the
 * pure routing policy; `ownedCustody.ts` adds script verification, because
 * custody is evidence of holding, not proof of protocol validity.
 */
export type CustodyKind = 'collection' | 'mint' | 'update' | 'decision' | 'state' | 'listing'

export type CustodyRouting = {
  protocolID: WalletProtocol
  ownerKeyID: string
  signerKeyID: string
  protocol: string
  subType: string
}

export type OwnedCustodyOutput = {
  kind: CustodyKind
  outpoint: string
  walletOutpoint: string
  txid: string
  vout: number
  satoshis: number
  /** Wallet routing key that controls this output. */
  ownerKeyID: string
  /** Wallet routing key that signed the record, when different from its owner. */
  signerKeyID: string
  /** Address derived from this output's routing key by the connected wallet. */
  derivedOwner: string
  /** Address the locking script actually pays, read back from the bytes. */
  scriptOwner: string
  /** Verified SIGMA signer, when this output carries a record. */
  signer: string
  map: AdinalsMap | null
  /** The outpoint the SIGMA signature commits to: this transaction's input 0. */
  sigmaSource: string
  /** Set on an update record: the live state output in the same transaction. */
  stateOutpoint: string
  /** Set on an update state: the record output in the same transaction. */
  recordOutpoint: string
  listing: { price: number; seller: string } | null
  spendable: boolean
  tags: string[]
  /**
   * Atomic BEEF for this output's transaction, carried so an owner can spend
   * it — update, list, or withdraw — directly from the ownership view without
   * re-querying the wallet or importing a fixture.
   */
  atomicBeef: number[]
  errors: string[]
  verified: boolean
}

export type OwnedCustody = {
  basket: string
  totalOutputs: number
  outputs: OwnedCustodyOutput[]
  /** Basket outputs whose routing this namespace could not interpret. */
  unrecognized: number
  queryError: string
}

/**
 * Reads the routing an Adinals writer attached to its own output. The
 * collection writer emits `keyID`; the lifecycle writers emit `ownerKeyID`
 * plus a separate `signerKeyID`, because a pre-fix mint's owner and creator
 * are legitimately different keys.
 */
export function parseCustodyRouting(
  customInstructions: string | undefined,
): { routing: CustodyRouting | null; error: string } {
  if (!customInstructions) return { routing: null, error: 'output carries no Adinals routing' }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(customInstructions) as Record<string, unknown>
  } catch {
    return { routing: null, error: 'output routing is not readable JSON' }
  }
  const protocolID = parsed.protocolID
  if (
    !Array.isArray(protocolID) ||
    protocolID[0] !== 1 ||
    protocolID[1] !== ADINALS_NAMESPACE.keyProtocol
  ) {
    return { routing: null, error: 'output belongs to another key protocol' }
  }
  if (parsed.counterparty !== 'self') return { routing: null, error: 'output is not self-held' }
  const ownerKeyID = typeof parsed.ownerKeyID === 'string' && parsed.ownerKeyID
    ? parsed.ownerKeyID
    : typeof parsed.keyID === 'string' ? parsed.keyID : ''
  if (!ownerKeyID) return { routing: null, error: 'output routing has no owner key' }
  const protocol = typeof parsed.protocol === 'string' ? parsed.protocol : ''
  if (!protocol.startsWith('adinals-v3')) return { routing: null, error: 'output is not an Adinals v3 record' }
  return {
    routing: {
      protocolID: [1, ADINALS_NAMESPACE.keyProtocol],
      ownerKeyID,
      signerKeyID: typeof parsed.signerKeyID === 'string' ? parsed.signerKeyID : '',
      protocol,
      subType: typeof parsed.subType === 'string' ? parsed.subType : '',
    },
    error: '',
  }
}

/**
 * Distinguishes a record output from the live one-satoshi state that carries
 * it. An update transaction places both in the same basket, so without this
 * an update would be counted twice — once as a record and once as an ad.
 */
export function classifyCustody(routing: CustodyRouting): CustodyKind | null {
  if (routing.protocol === 'adinals-v3-state') return 'state'
  if (routing.protocol === 'adinals-v3-listing') return 'listing'
  if (routing.protocol === 'adinals-v3-record') return 'update'
  if (routing.protocol !== 'adinals-v3') return null
  if (routing.subType === 'collection') return 'collection'
  if (routing.subType === 'collectionItem') return 'mint'
  if (routing.subType === 'adDecision') return 'decision'
  return null
}

/**
 * An update writes its live state at output 0 and its record at output 1 of
 * the same transaction. Pair them so the ownership model counts one ad, not
 * two, and can move from a record to the state that actually holds the ad.
 */
export function linkUpdateSiblings(outputs: OwnedCustodyOutput[]): void {
  const byTxid = new Map<string, OwnedCustodyOutput[]>()
  for (const output of outputs) {
    const group = byTxid.get(output.txid)
    if (group) group.push(output)
    else byTxid.set(output.txid, [output])
  }
  for (const group of byTxid.values()) {
    const record = group.find((output) => output.kind === 'update')
    const state = group.find((output) => output.kind === 'state')
    if (!record || !state) continue
    record.stateOutpoint = state.outpoint
    state.recordOutpoint = record.outpoint
  }
}
