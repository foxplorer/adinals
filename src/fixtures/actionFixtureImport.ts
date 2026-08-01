import { Inscription } from '@1sat/templates'
import {
  Beef,
  Hash,
  P2PKH,
  PublicKey,
  Transaction,
  Utils,
  type WalletInterface,
  type WalletProtocol,
} from '@bsv/sdk'
import type { AdinalsNoSendAction } from '../actions/lifecycle.ts'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import { findUnresolvedBeefDependencies } from '../protocol/beefValidation.ts'
import {
  buildUnsignedAdinalRecordScript,
  type AdinalsRecordMap,
} from '../protocol/adinalRecords.ts'
import {
  COLLECTION_VERIFIER_REVISION,
  extractUnsignedSigmaScript,
  verifyCollectionScript,
} from '../protocol/collectionScript.ts'
import { parseProtocolOutpoint, validateSpendLinkedRecord } from '../protocol/transitions.ts'

export type ImportedActionFixture = {
  format: string
  kind: string
  broadcast: boolean
  txid: string
  outpoint: string
  stateOutpoint?: string
  basket: string
  protocolID: WalletProtocol
  ownerKeyID: string
  signerKeyID?: string
  ownerAddress: string
  map?: AdinalsRecordMap
  rawtx: string
  atomicBeef: { encoding: string; bytes: number; sha256: string; data: string }
}

const exactProtocol = (protocolID: WalletProtocol): boolean =>
  protocolID[0] === 1 && protocolID[1] === ADINALS_NAMESPACE.keyProtocol

/**
 * Reconstitutes spend authority from an explicitly imported private fixture.
 * It performs only parsing, cryptographic verification, and getPublicKey; it
 * never creates, signs, aborts, internalizes, or broadcasts an action.
 */
export async function recoverOwnedActionFixture(
  wallet: Pick<WalletInterface, 'getPublicKey'>,
  fixture: ImportedActionFixture,
): Promise<AdinalsNoSendAction> {
  if (fixture.format !== 'adinals-brc100-action-fixture-v1' || fixture.broadcast) {
    throw new Error('Choose an unbroadcast Adinals action fixture.')
  }
  if (fixture.kind !== 'mint' && fixture.kind !== 'update') {
    throw new Error('Only a mint or update fixture can resume owned Adinal state.')
  }
  if (!fixture.map || fixture.map.app !== ADINALS_NAMESPACE.app) throw new Error('Fixture MAP does not match the active namespace.')
  if (fixture.basket !== ADINALS_NAMESPACE.basket || !exactProtocol(fixture.protocolID)) {
    throw new Error('Fixture wallet routing does not match the active namespace.')
  }
  if (!fixture.ownerKeyID || !fixture.ownerAddress) throw new Error('Fixture owner routing is incomplete.')

  const bytes = Utils.toArray(fixture.atomicBeef.data, 'base64')
  if (fixture.atomicBeef.encoding !== 'base64' || bytes.length !== fixture.atomicBeef.bytes) {
    throw new Error('Fixture Atomic BEEF length is invalid.')
  }
  if (Utils.toHex(Hash.sha256(bytes)) !== fixture.atomicBeef.sha256) throw new Error('Fixture Atomic BEEF hash mismatch.')
  const beef = Beef.fromBinary(bytes)
  const unresolved = findUnresolvedBeefDependencies(beef)
  if (unresolved.length) throw new Error(`Fixture Atomic BEEF has ${unresolved.length} unresolved dependencies.`)
  const transaction = Transaction.fromAtomicBEEF(bytes)
  if (transaction.id('hex') !== fixture.txid || transaction.toHex() !== fixture.rawtx) {
    throw new Error('Fixture subject transaction bytes do not match its txid/rawtx.')
  }

  const { publicKey } = await wallet.getPublicKey({
    protocolID: fixture.protocolID,
    keyID: fixture.ownerKeyID,
    counterparty: 'self',
    forSelf: true,
  })
  const derivedOwner = PublicKey.fromString(publicKey).toAddress()
  if (derivedOwner !== fixture.ownerAddress) throw new Error('Connected wallet does not derive the fixture owner address.')

  const recordTarget = parseProtocolOutpoint(fixture.outpoint)
  if (!recordTarget || recordTarget.txid !== fixture.txid) throw new Error('Fixture record outpoint is invalid.')
  const recordOutput = transaction.outputs[recordTarget.vout]
  const input = transaction.inputs[0]
  if (!recordOutput || recordOutput.satoshis !== 1 || !input) throw new Error('Fixture record layout is invalid.')
  const inscription = Inscription.decode(recordOutput.lockingScript)
  const unsigned = extractUnsignedSigmaScript(recordOutput.lockingScript)
  if (!inscription || !unsigned) throw new Error('Fixture record inscription/SIGMA frame is incomplete.')
  const sigmaTxid = input.sourceTXID ?? input.sourceTransaction?.id('hex') ?? ''
  const verification = verifyCollectionScript(
    recordOutput.lockingScript,
    unsigned,
    { txid: sigmaTxid, vout: input.sourceOutputIndex },
    fixture.map as never,
  )
  if (!verification.valid) throw new Error(`Fixture record verification failed: ${verification.errors.join('; ')}`)
  const canonical = buildUnsignedAdinalRecordScript(publicKey, fixture.map, {
    data: Uint8Array.from(inscription.file.content),
    type: inscription.file.type,
  })
  if (canonical.toHex() !== unsigned.toHex()) throw new Error('Fixture record is not canonical for its wallet-derived owner key.')

  if (fixture.kind === 'update') {
    const predecessor = parseProtocolOutpoint(fixture.map.adOutpoint ?? '')
    if (!predecessor) throw new Error('Fixture update predecessor is invalid.')
    const predecessorTransaction = beef.findAtomicTransaction(predecessor.txid)
    if (!predecessorTransaction) throw new Error('Fixture update predecessor is absent from Atomic BEEF.')
    const proof = validateSpendLinkedRecord(transaction, predecessorTransaction, predecessor.normalized, fixture.outpoint)
    if (proof.error) throw new Error(`Fixture update transition failed: ${proof.error}`)
    if (proof.successorOutpoint !== fixture.stateOutpoint || proof.owner !== derivedOwner) {
      throw new Error('Fixture update successor/owner does not match the connected wallet.')
    }
    const successor = transaction.outputs[0]
    if (successor?.lockingScript.toHex() !== new P2PKH().lock(derivedOwner).toHex()) {
      throw new Error('Fixture update successor is not locked to the connected wallet owner.')
    }
  }

  return {
    kind: fixture.kind,
    status: 'rehearsed',
    broadcast: false,
    txid: fixture.txid,
    outpoint: fixture.outpoint,
    stateOutpoint: fixture.stateOutpoint,
    rawtx: fixture.rawtx,
    atomicBeef: bytes,
    basket: fixture.basket,
    protocolID: fixture.protocolID,
    ownerKeyID: fixture.ownerKeyID,
    signerKeyID: fixture.signerKeyID,
    ownerAddress: fixture.ownerAddress,
    map: fixture.map,
    verification,
    verifierRevision: COLLECTION_VERIFIER_REVISION,
  }
}
