import { Inscription, OrdLock } from '@1sat/templates'
import {
  Beef,
  P2PKH,
  PublicKey,
  Script,
  Transaction,
  Utils,
  type WalletInterface,
} from '@bsv/sdk'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import { buildUnsignedAdinalRecordScript } from '../protocol/adinalRecords.ts'
import {
  buildUnsignedCollectionScript,
  decodeMapSet,
  extractUnsignedSigmaScript,
  verifyCollectionScript,
} from '../protocol/collectionScript.ts'
import { parseProtocolOutpoint } from '../protocol/transitions.ts'
import type { AdinalsMap } from '../protocol/recordValidation.ts'
import {
  classifyCustody,
  linkUpdateSiblings,
  parseCustodyRouting,
  type CustodyKind,
  type CustodyRouting,
  type OwnedCustody,
  type OwnedCustodyOutput,
} from './custodyRouting.ts'

export {
  classifyCustody,
  linkUpdateSiblings,
  parseCustodyRouting,
  type CustodyKind,
  type CustodyRouting,
  type OwnedCustody,
  type OwnedCustodyOutput,
} from './custodyRouting.ts'

export type CustodyWallet = Pick<WalletInterface, 'listOutputs' | 'getPublicKey'>

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const readListingTerms = (lockingScript: Script): { price: number; seller: string } | null => {
  const terms = OrdLock.decode(lockingScript)
  if (!terms) return null
  try {
    const reader = new Utils.Reader(terms.payout)
    const price = Number(reader.readUInt64LEBn().toString())
    const script = Script.fromBinary(reader.read(reader.readVarIntNum()))
    const hash = script.chunks[2]?.data
    const seller = script.chunks.length === 5 && hash?.length === 20 ? Utils.toBase58Check(hash) : ''
    return Number.isSafeInteger(price) && price > 0 ? { price, seller } : null
  } catch {
    return null
  }
}

/**
 * Re-derives everything the wallet claimed about one basket output from the
 * transaction bytes it returned alongside it.
 */
export function verifyCustodyOutput(options: {
  kind: CustodyKind
  transaction: Transaction
  vout: number
  routing: CustodyRouting
  derivedOwner: string
  /** The owner public key itself, which is what both writers build from. */
  derivedOwnerPublicKey: string
  derivedSigner: string
}): Pick<OwnedCustodyOutput, 'scriptOwner' | 'signer' | 'map' | 'sigmaSource' | 'listing' | 'errors'> {
  const { kind, transaction, vout, derivedOwner, derivedOwnerPublicKey, derivedSigner } = options
  const errors: string[] = []
  const output = transaction.outputs[vout]
  const input = transaction.inputs[0]
  if (!output) {
    return { scriptOwner: '', signer: '', map: null, sigmaSource: '', listing: null, errors: ['output is missing from its transaction'] }
  }
  const sigmaTxid = input?.sourceTXID ?? input?.sourceTransaction?.id('hex') ?? ''
  const sigmaSource = sigmaTxid ? `${sigmaTxid}_${input?.sourceOutputIndex ?? 0}` : ''

  if (kind === 'listing') {
    const listing = readListingTerms(output.lockingScript)
    if (!listing) errors.push('listing output is not a readable OrdLock')
    else if (listing.seller !== derivedOwner) errors.push('listing payout does not pay the wallet-derived seller')
    return { scriptOwner: listing?.seller ?? '', signer: '', map: null, sigmaSource, listing, errors }
  }

  if (kind === 'state') {
    const expected = new P2PKH().lock(derivedOwner).toHex()
    if (output.satoshis !== 1) errors.push('Adinal state must hold exactly one satoshi')
    if (output.lockingScript.toHex() !== expected) errors.push('state output is not locked to the wallet-derived owner')
    return { scriptOwner: derivedOwner, signer: '', map: null, sigmaSource, listing: null, errors }
  }

  // Record outputs: inscription + MAP + SIGMA over this transaction's input 0.
  if (output.satoshis !== 1) errors.push('Adinals record must hold exactly one satoshi')
  const inscription = Inscription.decode(output.lockingScript)
  const decodedMap = decodeMapSet(output.lockingScript)
  const unsigned = extractUnsignedSigmaScript(output.lockingScript)
  if (!inscription) errors.push('inscription not found')
  if (!decodedMap || decodedMap.cmd !== 'SET') errors.push('MAP SET not found')
  if (!unsigned) errors.push('SIGMA suffix could not be separated')
  const map = (decodedMap?.data ?? null) as AdinalsMap | null
  if (map && map.app !== ADINALS_NAMESPACE.app) errors.push('record belongs to another Adinals namespace')

  let signer = ''
  if (unsigned && sigmaTxid && map) {
    // The map argument re-checks the signed bytes against the bytes just
    // decoded from them; the binding claim proved here is the SIGMA/BSM
    // signature over input 0, and the canonical rebuild below.
    const verification = verifyCollectionScript(
      output.lockingScript,
      unsigned,
      { txid: sigmaTxid, vout: input?.sourceOutputIndex ?? 0 },
      map as never,
    )
    errors.push(...verification.errors)
    signer = verification.signerAddress
    if (derivedSigner && signer && signer !== derivedSigner) {
      errors.push('verified SIGMA signer is not the wallet-derived signing key')
    }
    if (derivedOwnerPublicKey && inscription) {
      // Both writers build the unsigned record from the OWNER key, which for a
      // pre-fix mint is deliberately not the creator's signing key. Rebuilding
      // from the wallet-derived owner is what proves this output is ours.
      const content = {
        data: Uint8Array.from(inscription.file.content),
        type: inscription.file.type,
      }
      const canonical = kind === 'collection'
        ? (typeof map.name === 'string'
            ? buildUnsignedCollectionScript(derivedOwnerPublicKey, map as never, { name: map.name, cover: content })
            : null)
        : buildUnsignedAdinalRecordScript(derivedOwnerPublicKey, map as never, content)
      if (canonical && canonical.toHex() !== unsigned.toHex()) {
        errors.push('record is not the canonical script for its wallet-derived owner')
      }
    }
  }

  // Whatever the SIGMA proves, custody means this output pays the key the
  // wallet derived for it.
  const ownerLock = new P2PKH().lock(derivedOwner).toHex()
  const containsOwnerLock = (() => {
    if (!unsigned) return false
    for (let index = 0; index <= unsigned.chunks.length - 5; index += 1) {
      if (new Script(unsigned.chunks.slice(index, index + 5)).toHex() === ownerLock) return true
    }
    return false
  })()
  if (!containsOwnerLock) errors.push('record does not lock to the wallet-derived owner')

  return { scriptOwner: derivedOwner, signer, map, sigmaSource, listing: null, errors }
}

/**
 * Read-only. Enumerates and independently verifies everything the connected
 * wallet holds in the active Adinals basket. Never creates, signs, aborts,
 * internalizes, or broadcasts.
 */
export async function readOwnedCustody(
  wallet: CustodyWallet,
  basket: string = ADINALS_NAMESPACE.basket,
  limit = 200,
): Promise<OwnedCustody> {
  const custody: OwnedCustody = {
    basket,
    totalOutputs: 0,
    outputs: [],
    unrecognized: 0,
    queryError: '',
  }

  let result
  try {
    result = await wallet.listOutputs({
      basket,
      include: 'entire transactions',
      includeCustomInstructions: true,
      includeTags: true,
      limit,
      offset: 0,
    })
  } catch (error) {
    custody.queryError = errorMessage(error)
    return custody
  }

  custody.totalOutputs = result.totalOutputs ?? result.outputs.length
  if (!result.BEEF) {
    custody.queryError = 'The wallet returned basket outputs without their transactions.'
    return custody
  }

  let beef: Beef
  try {
    beef = Beef.fromBinary(result.BEEF)
  } catch (error) {
    custody.queryError = `Basket BEEF could not be parsed: ${errorMessage(error)}`
    return custody
  }

  // One wallet call per distinct key rather than per output.
  const keyCache = new Map<string, { address: string; publicKey: string }>()
  const empty = { address: '', publicKey: '' }
  const deriveKey = async (keyID: string): Promise<{ address: string; publicKey: string }> => {
    if (!keyID) return empty
    const cached = keyCache.get(keyID)
    if (cached) return cached
    try {
      const { publicKey } = await wallet.getPublicKey({
        protocolID: [1, ADINALS_NAMESPACE.keyProtocol],
        keyID,
        counterparty: 'self',
        forSelf: true,
      })
      const derived = { address: PublicKey.fromString(publicKey).toAddress(), publicKey }
      keyCache.set(keyID, derived)
      return derived
    } catch {
      keyCache.set(keyID, empty)
      return empty
    }
  }

  for (const output of result.outputs) {
    const target = parseProtocolOutpoint(output.outpoint)
    const { routing } = parseCustodyRouting(output.customInstructions)
    const kind = routing ? classifyCustody(routing) : null
    if (!target || !routing || !kind) {
      custody.unrecognized += 1
      continue
    }

    const errors: string[] = []
    const transaction = beef.findAtomicTransaction(target.txid)
    const [owner, signer] = await Promise.all([
      deriveKey(routing.ownerKeyID),
      deriveKey(routing.signerKeyID),
    ])
    const derivedOwner = owner.address
    if (!derivedOwner) errors.push('the connected wallet could not derive this output owner key')

    let verified: ReturnType<typeof verifyCustodyOutput> = {
      scriptOwner: '', signer: '', map: null, sigmaSource: '', listing: null,
      errors: ['the basket BEEF does not contain this output transaction'],
    }
    if (transaction && derivedOwner) {
      try {
        verified = verifyCustodyOutput({
          kind,
          transaction,
          vout: target.vout,
          routing,
          derivedOwner,
          derivedOwnerPublicKey: owner.publicKey,
          derivedSigner: signer.address,
        })
      } catch (error) {
        verified = { ...verified, errors: [`verification failed: ${errorMessage(error)}`] }
      }
    }

    custody.outputs.push({
      kind,
      outpoint: target.normalized,
      walletOutpoint: `${target.txid}.${target.vout}`,
      txid: target.txid,
      vout: target.vout,
      satoshis: output.satoshis,
      ownerKeyID: routing.ownerKeyID,
      signerKeyID: routing.signerKeyID,
      derivedOwner,
      scriptOwner: verified.scriptOwner,
      signer: verified.signer,
      map: verified.map,
      sigmaSource: verified.sigmaSource,
      stateOutpoint: '',
      recordOutpoint: '',
      listing: verified.listing,
      spendable: output.spendable ?? false,
      tags: output.tags ?? [],
      atomicBeef: beef.toBinaryAtomic(target.txid),
      errors: [...errors, ...verified.errors],
      verified: errors.length === 0 && verified.errors.length === 0,
    })
  }

  linkUpdateSiblings(custody.outputs)
  return custody
}
