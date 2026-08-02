import { OrdLock } from '@1sat/templates'
import {
  Beef,
  P2PKH,
  PublicKey,
  Script,
  Transaction,
  Utils,
  type WalletInterface,
  type WalletProtocol,
} from '@bsv/sdk'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import {
  buildAdinalDecisionMap,
  buildAdinalMintMap,
  buildAdinalUpdateMap,
  buildUnsignedAdinalRecordScript,
  verifyAdinalRecordScript,
  type AdinalsRecordMap,
  type CreateAdinalInput,
  type DecideAdinalInput,
  type RecordContent,
  type UpdateAdinalInput,
} from '../protocol/adinalRecords.ts'
import { ORDLOCK_PURCHASE_UNLOCKING_SCRIPT_MAX } from '../protocol/ordLockLimits.ts'
import {
  appendWalletSigma,
  COLLECTION_VERIFIER_REVISION,
  type CollectionScriptVerification,
} from '../protocol/collectionScript.ts'
import {
  createAndCompleteNoSendAction,
  signDerivedP2PKHInput,
} from '../wallet/actionSigning.ts'
import { calculateSigmaAnchorReserve } from './sigmaAnchorReserve.ts'
import { findAnchorInputIndex, findAnchorOutputIndex } from './anchorOutput.ts'
import { releaseOnFailure } from './noSendGuard.ts'

const protocolID: WalletProtocol = [1, ADINALS_NAMESPACE.keyProtocol]

const randomKeyID = (prefix: string): string => {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return `${prefix}-${Utils.toHex(Array.from(bytes))}`
}

const parsedOutpoint = (value: string): { txid: string; vout: number; wallet: string; ordinal: string } => {
  const match = /^([0-9a-f]{64})[._](\d+)$/i.exec(value.trim())
  if (!match) throw new Error('A valid transaction outpoint is required.')
  const vout = Number(match[2])
  if (!Number.isSafeInteger(vout)) throw new Error('A valid output index is required.')
  return {
    txid: (match[1] as string).toLowerCase(),
    vout,
    wallet: `${(match[1] as string).toLowerCase()}.${vout}`,
    ordinal: `${(match[1] as string).toLowerCase()}_${vout}`,
  }
}

const walletPublicKey = async (wallet: WalletInterface, keyID: string): Promise<string> => {
  const { publicKey } = await wallet.getPublicKey({ protocolID, keyID, counterparty: 'self', forSelf: true })
  return publicKey
}

export type AdinalsNoSendAction = {
  kind: 'mint' | 'update' | 'decision' | 'listing' | 'purchase' | 'cancel'
  status: 'rehearsed'
  broadcast: false
  txid: string
  outpoint: string
  stateOutpoint?: string
  anchorTxid?: string
  anchorOutpoint?: string
  rawtx: string
  atomicBeef: number[]
  basket: string
  protocolID: WalletProtocol
  ownerKeyID: string
  signerKeyID?: string
  /** Wallet-local capability retained only in IndexedDB; never exported. */
  actionReference?: string
  /** Wallet-local parent capability retained only in IndexedDB; never exported. */
  anchorReference?: string
  ownerAddress: string
  map?: AdinalsRecordMap
  verification?: CollectionScriptVerification
  verifierRevision: typeof COLLECTION_VERIFIER_REVISION
}

type SignedRecordOptions = {
  kind: 'mint' | 'decision'
  wallet: WalletInterface
  map: AdinalsRecordMap
  signerKeyID: string
  expectedSignerAddress: string
  ownerKeyID?: string
  content?: RecordContent
  basket: string
}

async function createSignedRecord(options: SignedRecordOptions): Promise<AdinalsNoSendAction> {
  const anchorKeyID = randomKeyID(`${options.kind}-anchor`)
  const ownerKeyID = options.ownerKeyID ?? randomKeyID(`${options.kind}-owner`)
  const [anchorPublicKey, signerPublicKey, ownerPublicKey] = await Promise.all([
    walletPublicKey(options.wallet, anchorKeyID),
    walletPublicKey(options.wallet, options.signerKeyID),
    walletPublicKey(options.wallet, ownerKeyID),
  ])
  const signerAddress = PublicKey.fromString(signerPublicKey).toAddress()
  if (signerAddress !== options.expectedSignerAddress) {
    throw new Error('The connected wallet key does not match the collection creator address.')
  }
  const unsigned = buildUnsignedAdinalRecordScript(ownerPublicKey, options.map, options.content)
  const anchorSatoshis = calculateSigmaAnchorReserve(unsigned.toBinary().length)

  const anchorScriptHex = new P2PKH().lock(PublicKey.fromString(anchorPublicKey).toAddress()).toHex()
  const createAnchorAction = () => options.wallet.createAction({
    description: `Prepare Adinals ${options.kind} fee reserve (unused value returns)`,
    labels: [ADINALS_NAMESPACE.actionLabel],
    outputs: [{
      lockingScript: anchorScriptHex,
      satoshis: anchorSatoshis,
      outputDescription: `Temporary Adinals ${options.kind} fee reserve`,
    }],
    options: { signAndProcess: false, noSend: true, acceptDelayedBroadcast: true, randomizeOutputs: false },
  })
  const anchorAttempt = await createAndCompleteNoSendAction(options.wallet, createAnchorAction)
  const anchorCreated = anchorAttempt.created
  const anchor = anchorAttempt.completed
  // A wallet may append its own change, so the reserve is found by its exact
  // script and value rather than assumed to sit at index 0.
  const anchorVout = findAnchorOutputIndex(anchor.tx, anchorScriptHex, anchorSatoshis)
  let recordReference = ''
  try {
    const signed = await appendWalletSigma(
      options.wallet,
      unsigned,
      { txid: anchor.txid, vout: anchorVout },
      protocolID,
      options.signerKeyID,
    )
    const createRecordAction = () => options.wallet.createAction({
      description: options.kind === 'mint' ? 'Rehearse Adinals ad mint' : 'Rehearse Adinals decision',
      labels: [ADINALS_NAMESPACE.actionLabel],
      inputBEEF: anchor.tx,
      inputs: [{ outpoint: `${anchor.txid}.${anchorVout}`, inputDescription: `Temporary Adinals ${options.kind} fee reserve`, unlockingScriptLength: 108 }],
      outputs: [{
        lockingScript: signed.toHex(),
        satoshis: 1,
        outputDescription: options.kind === 'mint' ? 'Adinals v3 ad' : 'Adinals v3 decision',
        basket: options.basket,
        customInstructions: JSON.stringify({
          protocolID,
          ownerKeyID,
          signerKeyID: options.signerKeyID,
          counterparty: 'self',
          protocol: 'adinals-v3',
          subType: options.map.subType,
        }),
        tags: [`app:${ADINALS_NAMESPACE.app}`, 'protocolVersion:3', `subType:${options.map.subType}`],
      }],
      options: {
        signAndProcess: false,
        noSend: true,
        acceptDelayedBroadcast: true,
        randomizeOutputs: false,
        knownTxids: [anchor.txid],
        trustSelf: 'known',
      },
    })
    const recordAttempt = await createAndCompleteNoSendAction(options.wallet, createRecordAction, anchor.tx, async (transaction) => {
      const anchorInput = findAnchorInputIndex(transaction, anchor.txid, anchorVout)
      return {
        [anchorInput]: {
          unlockingScript: await signDerivedP2PKHInput(options.wallet, transaction, anchorInput, protocolID, anchorKeyID),
        },
      }
    })
    const created = recordAttempt.created
    const completed = recordAttempt.completed
    recordReference = created.signableTransaction?.reference ?? ''
    const transaction = Transaction.fromAtomicBEEF(completed.tx)
    const output = transaction.outputs[0]
    if (!output || output.lockingScript.toHex() !== signed.toHex()) throw new Error('Wallet changed the fixed Adinals record output.')
    const verification = verifyAdinalRecordScript(output.lockingScript, unsigned, { txid: anchor.txid, vout: anchorVout }, options.map)
    if (!verification.valid || verification.signerAddress !== options.expectedSignerAddress) {
      throw new Error(`Adinals ${options.kind} verification failed: ${verification.errors.join('; ')}`)
    }
    return {
      kind: options.kind,
      status: 'rehearsed',
      broadcast: false,
      txid: completed.txid,
      outpoint: `${completed.txid}_0`,
      anchorTxid: anchor.txid,
      anchorOutpoint: `${anchor.txid}_${anchorVout}`,
      rawtx: transaction.toHex(),
      atomicBeef: completed.tx,
      basket: options.basket,
      protocolID,
      ownerKeyID,
      signerKeyID: options.signerKeyID,
      actionReference: recordReference,
      anchorReference: anchorCreated.signableTransaction?.reference,
      ownerAddress: PublicKey.fromString(ownerPublicKey).toAddress(),
      map: options.map,
      verification,
      verifierRevision: COLLECTION_VERIFIER_REVISION,
    }
  } catch (error) {
    if (recordReference) await options.wallet.abortAction({ reference: recordReference }).catch(() => undefined)
    const anchorReference = anchorCreated.signableTransaction?.reference
    if (anchorReference) await options.wallet.abortAction({ reference: anchorReference }).catch(() => undefined)
    throw error
  }
}

export async function createAdinal(
  wallet: WalletInterface,
  input: CreateAdinalInput & { creatorKeyID: string; creatorAddress: string },
  options: { basket?: string } = {},
): Promise<AdinalsNoSendAction> {
  return createSignedRecord({
    kind: 'mint',
    wallet,
    map: buildAdinalMintMap(input),
    signerKeyID: input.creatorKeyID,
    expectedSignerAddress: input.creatorAddress,
    // Original v3 readers identify a creator-owned update by public SIGMA
    // address equality. Reuse the collection creator key for a self-mint so a
    // BRC-100 wallet does not look like an unrelated owner merely because it
    // derived a second local key under the same identity.
    ownerKeyID: input.creatorKeyID,
    content: input.format === 'image' ? input.image : undefined,
    basket: options.basket ?? ADINALS_NAMESPACE.basket,
  })
}

export async function decideAdinal(
  wallet: WalletInterface,
  input: DecideAdinalInput & { creatorKeyID: string; creatorAddress: string },
  options: { basket?: string } = {},
): Promise<AdinalsNoSendAction> {
  return createSignedRecord({
    kind: 'decision',
    wallet,
    map: buildAdinalDecisionMap(input),
    signerKeyID: input.creatorKeyID,
    expectedSignerAddress: input.creatorAddress,
    ownerKeyID: input.creatorKeyID,
    basket: options.basket ?? ADINALS_NAMESPACE.basket,
  })
}

const findSource = (atomicBeef: number[], target: { txid: string; vout: number }): Transaction => {
  const beef = Beef.fromBinary(atomicBeef)
  const transaction = beef.findAtomicTransaction(target.txid)
  if (!transaction || !transaction.outputs[target.vout]) throw new Error('Atomic BEEF does not contain the requested source output.')
  return transaction
}

export async function updateAdinal(
  wallet: WalletInterface,
  input: UpdateAdinalInput & { atomicBeef: number[]; ownerKeyID: string },
  options: { basket?: string } = {},
): Promise<AdinalsNoSendAction> {
  const source = parsedOutpoint(input.adOutpoint)
  findSource(input.atomicBeef, source)
  const ownerPublicKey = await walletPublicKey(wallet, input.ownerKeyID)
  const ownerAddress = PublicKey.fromString(ownerPublicKey).toAddress()
  const map = buildAdinalUpdateMap(input)
  const unsigned = buildUnsignedAdinalRecordScript(ownerPublicKey, map, input.format === 'image' ? input.image : undefined)
  const signedRecord = await appendWalletSigma(wallet, unsigned, source, protocolID, input.ownerKeyID)
  const successorScript = new P2PKH().lock(ownerAddress)
  const basket = options.basket ?? ADINALS_NAMESPACE.basket
  const createUpdateAction = () => wallet.createAction({
    description: 'Rehearse Adinals owner update',
    labels: [ADINALS_NAMESPACE.actionLabel],
    inputBEEF: input.atomicBeef,
    inputs: [{ outpoint: source.wallet, inputDescription: 'Current Adinal state', unlockingScriptLength: 108 }],
    outputs: [
      {
        lockingScript: successorScript.toHex(), satoshis: 1, outputDescription: 'Updated Adinal state', basket,
        customInstructions: JSON.stringify({ protocolID, ownerKeyID: input.ownerKeyID, counterparty: 'self', protocol: 'adinals-v3-state' }),
        tags: [`app:${ADINALS_NAMESPACE.app}`, 'protocolVersion:3', 'state:ad'],
      },
      {
        lockingScript: signedRecord.toHex(), satoshis: 1, outputDescription: 'Adinals v3 update record', basket,
        customInstructions: JSON.stringify({ protocolID, ownerKeyID: input.ownerKeyID, counterparty: 'self', protocol: 'adinals-v3-record' }),
        tags: [`app:${ADINALS_NAMESPACE.app}`, 'protocolVersion:3', 'subType:adUpdate'],
      },
    ],
    options: { signAndProcess: false, noSend: true, acceptDelayedBroadcast: true, randomizeOutputs: false },
  })
  const updateAttempt = await createAndCompleteNoSendAction(wallet, createUpdateAction, input.atomicBeef, async (transaction) => ({
    0: { unlockingScript: await signDerivedP2PKHInput(wallet, transaction, 0, protocolID, input.ownerKeyID) },
  }))
  const created = updateAttempt.created
  const completed = updateAttempt.completed
  return await releaseOnFailure(wallet, created.signableTransaction?.reference, () => {
    const transaction = Transaction.fromAtomicBEEF(completed.tx)
    if (transaction.outputs[0]?.lockingScript.toHex() !== successorScript.toHex() || transaction.outputs[1]?.lockingScript.toHex() !== signedRecord.toHex()) {
      throw new Error('Wallet changed the mandatory update output layout.')
    }
    const verification = verifyAdinalRecordScript(transaction.outputs[1]!.lockingScript, unsigned, source, map)
    if (!verification.valid) throw new Error(`Adinals update verification failed: ${verification.errors.join('; ')}`)
    return {
      kind: 'update', status: 'rehearsed', broadcast: false, txid: completed.txid,
      outpoint: `${completed.txid}_1`, stateOutpoint: `${completed.txid}_0`, rawtx: transaction.toHex(),
      atomicBeef: completed.tx, basket, protocolID, ownerKeyID: input.ownerKeyID, signerKeyID: input.ownerKeyID,
      actionReference: created.signableTransaction?.reference,
      ownerAddress, map, verification, verifierRevision: COLLECTION_VERIFIER_REVISION,
    }
  })
}

export async function listAdinal(
  wallet: WalletInterface,
  input: { adOutpoint: string; atomicBeef: number[]; ownerKeyID: string; priceSatoshis: number },
  options: { basket?: string } = {},
): Promise<AdinalsNoSendAction> {
  if (!Number.isSafeInteger(input.priceSatoshis) || input.priceSatoshis < 1) throw new Error('Listing price must be a positive whole number of satoshis.')
  const source = parsedOutpoint(input.adOutpoint)
  findSource(input.atomicBeef, source)
  const ownerPublicKey = await walletPublicKey(wallet, input.ownerKeyID)
  const ownerAddress = PublicKey.fromString(ownerPublicKey).toAddress()
  const listingScript = OrdLock.lock(ownerAddress, ownerAddress, input.priceSatoshis)
  const basket = options.basket ?? ADINALS_NAMESPACE.basket
  const createListingAction = () => wallet.createAction({
    description: 'Rehearse Adinals listing', labels: [ADINALS_NAMESPACE.actionLabel], inputBEEF: input.atomicBeef,
    inputs: [{ outpoint: source.wallet, inputDescription: 'Adinal offered for sale', unlockingScriptLength: 108 }],
    outputs: [{
      lockingScript: listingScript.toHex(), satoshis: 1, outputDescription: 'Adinals marketplace listing', basket,
      customInstructions: JSON.stringify({ protocolID, ownerKeyID: input.ownerKeyID, counterparty: 'self', protocol: 'adinals-v3-listing' }),
      tags: [`app:${ADINALS_NAMESPACE.app}`, 'market:ordlock'],
    }],
    options: { signAndProcess: false, noSend: true, acceptDelayedBroadcast: true, randomizeOutputs: false },
  })
  const listingAttempt = await createAndCompleteNoSendAction(wallet, createListingAction, input.atomicBeef, async (transaction) => ({
    0: { unlockingScript: await signDerivedP2PKHInput(wallet, transaction, 0, protocolID, input.ownerKeyID) },
  }))
  const created = listingAttempt.created
  const completed = listingAttempt.completed
  return await releaseOnFailure(wallet, created.signableTransaction?.reference, () => {
    const transaction = Transaction.fromAtomicBEEF(completed.tx)
    if (!transaction.outputs[0] || !OrdLock.decode(transaction.outputs[0].lockingScript)) throw new Error('Wallet did not return the expected OrdLock listing.')
    return {
      kind: 'listing', status: 'rehearsed', broadcast: false, txid: completed.txid, outpoint: `${completed.txid}_0`,
      rawtx: transaction.toHex(), atomicBeef: completed.tx, basket, protocolID, ownerKeyID: input.ownerKeyID,
      actionReference: created.signableTransaction?.reference,
      ownerAddress, verifierRevision: COLLECTION_VERIFIER_REVISION,
    }
  })
}

/**
 * Withdraws an ad from sale.
 *
 * OrdLock's cancel path is a signature by the cancel address, which under
 * BRC-100 is a wallet-derived key rather than a stored one. The template's
 * `cancelWithWallet` signs through `createSignature`, so the seller's private
 * key is never exposed, and `estimateLength` sizes the input exactly instead
 * of reserving a guessed upper bound.
 */
export async function cancelAdinalListing(
  wallet: WalletInterface,
  input: { listingOutpoint: string; atomicBeef: number[]; ownerKeyID: string },
  options: { basket?: string } = {},
): Promise<AdinalsNoSendAction> {
  const source = parsedOutpoint(input.listingOutpoint)
  const sourceTransaction = findSource(input.atomicBeef, source)
  const listingOutput = sourceTransaction.outputs[source.vout]
  if (!listingOutput) throw new Error('The listing output is missing from its transaction.')
  const terms = OrdLock.decode(listingOutput.lockingScript)
  if (!terms) throw new Error('The requested output is not an OrdLock listing.')

  const ownerPublicKey = await walletPublicKey(wallet, input.ownerKeyID)
  const ownerAddress = PublicKey.fromString(ownerPublicKey).toAddress()
  if (terms.seller !== ownerAddress) throw new Error('This wallet key cannot cancel that listing.')

  const unlock = OrdLock.cancelWithWallet(wallet, protocolID, input.ownerKeyID, 'self')
  const unlockingScriptLength = await unlock.estimateLength()
  const returnScript = new P2PKH().lock(ownerAddress)
  const basket = options.basket ?? ADINALS_NAMESPACE.basket
  const createCancellationAction = () => wallet.createAction({
    description: 'Rehearse Adinals listing cancellation',
    labels: [ADINALS_NAMESPACE.actionLabel],
    inputBEEF: input.atomicBeef,
    inputs: [{
      outpoint: source.wallet,
      inputDescription: 'Adinals listing being withdrawn',
      unlockingScriptLength,
    }],
    outputs: [{
      lockingScript: returnScript.toHex(), satoshis: 1, outputDescription: 'Adinal returned from sale', basket,
      customInstructions: JSON.stringify({ protocolID, ownerKeyID: input.ownerKeyID, counterparty: 'self', protocol: 'adinals-v3-state' }),
      tags: [`app:${ADINALS_NAMESPACE.app}`, 'market:cancel'],
    }],
    options: { signAndProcess: false, noSend: true, acceptDelayedBroadcast: true, randomizeOutputs: false },
  })
  const cancellationAttempt = await createAndCompleteNoSendAction(wallet, createCancellationAction, input.atomicBeef, async (transaction) => ({
    0: { unlockingScript: (await unlock.sign(transaction, 0)).toHex() },
  }))
  const created = cancellationAttempt.created
  const completed = cancellationAttempt.completed
  return await releaseOnFailure(wallet, created.signableTransaction?.reference, () => {
  const transaction = Transaction.fromAtomicBEEF(completed.tx)
  if (transaction.outputs[0]?.lockingScript.toHex() !== returnScript.toHex()) {
    throw new Error('Wallet changed the mandatory cancellation output.')
  }
  if (OrdLock.decode(transaction.outputs[0]!.lockingScript)) {
    throw new Error('The cancelled Adinal is still under a marketplace lock.')
  }
  return {
    kind: 'cancel', status: 'rehearsed', broadcast: false, txid: completed.txid,
    outpoint: `${completed.txid}_0`, rawtx: transaction.toHex(), atomicBeef: completed.tx,
    basket, protocolID, ownerKeyID: input.ownerKeyID, ownerAddress,
    actionReference: created.signableTransaction?.reference,
    verifierRevision: COLLECTION_VERIFIER_REVISION,
  }  })
}

export async function buyAdinal(
  wallet: WalletInterface,
  input: { listingOutpoint: string; atomicBeef: number[]; expiresAt?: string },
  options: { basket?: string } = {},
): Promise<AdinalsNoSendAction> {
  if (input.expiresAt && Date.parse(input.expiresAt) <= Date.now()) throw new Error('This collection has expired.')
  const source = parsedOutpoint(input.listingOutpoint)
  const sourceTransaction = findSource(input.atomicBeef, source)
  const listingOutput = sourceTransaction.outputs[source.vout]!
  const terms = OrdLock.decode(listingOutput.lockingScript)
  if (!terms) throw new Error('The requested output is not an OrdLock listing.')
  const reader = new Utils.Reader(terms.payout)
  const payoutSatoshis = Number(reader.readUInt64LEBn().toString())
  const payoutScript = Script.fromBinary(reader.read(reader.readVarIntNum()))
  if (!Number.isSafeInteger(payoutSatoshis) || payoutSatoshis < 1) throw new Error('The listing payout is invalid.')
  const ownerKeyID = randomKeyID('purchase-owner')
  const ownerPublicKey = await walletPublicKey(wallet, ownerKeyID)
  const ownerAddress = PublicKey.fromString(ownerPublicKey).toAddress()
  const buyerScript = new P2PKH().lock(ownerAddress)
  const basket = options.basket ?? ADINALS_NAMESPACE.basket
  const createPurchaseAction = () => wallet.createAction({
    description: 'Rehearse Adinals purchase', labels: [ADINALS_NAMESPACE.actionLabel], inputBEEF: input.atomicBeef,
    inputs: [{
      outpoint: source.wallet,
      inputDescription: 'Adinals marketplace listing',
      unlockingScriptLength: ORDLOCK_PURCHASE_UNLOCKING_SCRIPT_MAX,
    }],
    outputs: [
      {
        lockingScript: buyerScript.toHex(), satoshis: 1, outputDescription: 'Purchased Adinal', basket,
        customInstructions: JSON.stringify({ protocolID, ownerKeyID, counterparty: 'self', protocol: 'adinals-v3-state' }),
        tags: [`app:${ADINALS_NAMESPACE.app}`, 'market:purchase'],
      },
      { lockingScript: payoutScript.toHex(), satoshis: payoutSatoshis, outputDescription: 'Adinals seller payout' },
    ],
    options: { signAndProcess: false, noSend: true, acceptDelayedBroadcast: true, randomizeOutputs: false },
  })
  const purchaseAttempt = await createAndCompleteNoSendAction(wallet, createPurchaseAction, input.atomicBeef, async (transaction) => ({
    0: { unlockingScript: (await OrdLock.purchaseListing().sign(transaction, 0)).toHex() },
  }))
  const created = purchaseAttempt.created
  const completed = purchaseAttempt.completed
  return await releaseOnFailure(wallet, created.signableTransaction?.reference, () => {
  const transaction = Transaction.fromAtomicBEEF(completed.tx)
  if (transaction.outputs[0]?.lockingScript.toHex() !== buyerScript.toHex() || transaction.outputs[1]?.lockingScript.toHex() !== payoutScript.toHex()) {
    throw new Error('Wallet changed the mandatory purchase output layout.')
  }
  return {
    kind: 'purchase', status: 'rehearsed', broadcast: false, txid: completed.txid, outpoint: `${completed.txid}_0`,
    rawtx: transaction.toHex(), atomicBeef: completed.tx, basket, protocolID, ownerKeyID, ownerAddress,
    actionReference: created.signableTransaction?.reference,
    verifierRevision: COLLECTION_VERIFIER_REVISION,
  }  })
}
