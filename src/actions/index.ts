import {
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
  buildCollectionMap,
  validateCollectionMap,
  type AdinalsCollectionMap,
  type CreateCollectionInput,
} from '../protocol/collectionMetadata.ts'
import {
  appendWalletSigma,
  buildUnsignedCollectionScript,
  COLLECTION_VERIFIER_REVISION,
  inspectSigmaSuffix,
  verifyCollectionScript,
  type CollectionScriptVerification,
} from '../protocol/collectionScript.ts'
import { findByteIdenticalOneSatOutputs } from '../protocol/transactionChecks.ts'
import { createAndCompleteNoSendAction, signDerivedP2PKHInput } from '../wallet/actionSigning.ts'
import { calculateSigmaAnchorReserve } from './sigmaAnchorReserve.ts'
import { findAnchorInputIndex, findAnchorOutputIndex } from './anchorOutput.ts'

export type { CreateCollectionInput } from '../protocol/collectionMetadata.ts'

export type AdinalsCollectionRehearsal = {
  status: 'rehearsed'
  broadcast: false
  indexed: null
  txid: string
  outpoint: string
  outputIndex: number
  anchorTxid: string
  anchorOutpoint: string
  rawtx: string
  atomicBeef: number[]
  noSendChange: string[]
  basket: string
  protocolID: WalletProtocol
  keyID: string
  ownerAddress: string
  map: AdinalsCollectionMap
  verification: CollectionScriptVerification
  verifierRevision: typeof COLLECTION_VERIFIER_REVISION
  /** Wallet-local abort handles; excluded from exported fixtures. */
  actionReference: string
  anchorReference: string
}

export class AdinalsActionError extends Error {
  readonly code: string
  readonly stage: string
  readonly anchorTxid?: string

  constructor(code: string, stage: string, message: string, anchorTxid?: string) {
    super(message)
    this.name = 'AdinalsActionError'
    this.code = code
    this.stage = stage
    this.anchorTxid = anchorTxid
  }
}

const randomKeyID = (prefix: string): string => {
  const random = new Uint8Array(12)
  crypto.getRandomValues(random)
  return `${prefix}-${Utils.toHex(Array.from(random))}`
}

/**
 * Builds a complete Adinals v3 collection transaction without broadcasting it.
 *
 * SIGMA commits to an input outpoint, so the wallet first creates a size-aware
 * noSend fee reserve. The collection then spends that reserve and is also
 * finalized with `noSend: true`. `sendWith` is intentionally absent from both
 * calls, and unused reserve value returns as wallet-managed no-send change.
 */
export async function createAdinalsCollection(
  wallet: WalletInterface,
  input: CreateCollectionInput,
  options: { basket?: string; now?: Date } = {},
): Promise<AdinalsCollectionRehearsal> {
  const map = buildCollectionMap(input, { app: ADINALS_NAMESPACE.app, now: options.now })
  const mapErrors = validateCollectionMap(map, ADINALS_NAMESPACE.app)
  if (mapErrors.length) {
    throw new AdinalsActionError('COLLECTION_MAP_INVALID', 'metadata', mapErrors.join('; '))
  }

  const basket = options.basket?.trim() || ADINALS_NAMESPACE.basket
  const protocolID: WalletProtocol = [1, ADINALS_NAMESPACE.keyProtocol]
  const anchorKeyID = randomKeyID('collection-anchor')
  const collectionKeyID = randomKeyID('collection-owner')
  const [{ publicKey: anchorPublicKey }, { publicKey: collectionPublicKey }] = await Promise.all([
    wallet.getPublicKey({ protocolID, keyID: anchorKeyID, counterparty: 'self', forSelf: true }),
    wallet.getPublicKey({ protocolID, keyID: collectionKeyID, counterparty: 'self', forSelf: true }),
  ])
  const ownerAddress = PublicKey.fromString(collectionPublicKey).toAddress()
  const unsignedScript = buildUnsignedCollectionScript(collectionPublicKey, map, input)
  const anchorSatoshis = calculateSigmaAnchorReserve(unsignedScript.toBinary().length)
  const anchorScript = new P2PKH().lock(PublicKey.fromString(anchorPublicKey).toAddress())
  const createAnchorAction = () => wallet.createAction({
    description: 'Prepare Adinals collection fee reserve (unused value returns)',
    labels: [ADINALS_NAMESPACE.actionLabel],
    outputs: [{
      lockingScript: anchorScript.toHex(),
      satoshis: anchorSatoshis,
      outputDescription: 'Temporary Adinals collection fee reserve',
    }],
    options: {
      signAndProcess: false,
      noSend: true,
      acceptDelayedBroadcast: true,
      randomizeOutputs: false,
    },
  })
  let anchorAttempt
  try {
    anchorAttempt = await createAndCompleteNoSendAction(wallet, createAnchorAction)
  } catch (error) {
    throw new AdinalsActionError(
      'BRC100_NOSEND_FAILED',
      'anchor',
      error instanceof Error ? error.message : String(error),
    )
  }
  const anchorCreated = anchorAttempt.created
  const anchor = anchorAttempt.completed
  // A wallet may append its own change, so the reserve is found by its exact
  // script and value rather than assumed to sit at index 0.
  const anchorVout = findAnchorOutputIndex(anchor.tx, anchorScript.toHex(), anchorSatoshis)

  let collectionReference = ''
  try {
    const builtSignedScript = await appendWalletSigma(
      wallet,
      unsignedScript,
      { txid: anchor.txid, vout: anchorVout },
      protocolID,
      collectionKeyID,
    )
    const builtSigma = inspectSigmaSuffix(builtSignedScript)
    const signedScript = Script.fromHex(builtSignedScript.toHex())
    const serializedSigma = inspectSigmaSuffix(signedScript)
    if (builtSigma.index < 1 || serializedSigma.index < 1) {
      const failedAt = builtSigma.index < 1 ? 'builder' : 'serialization'
      const inspection = builtSigma.index < 1 ? builtSigma : serializedSigma
      throw new AdinalsActionError(
        'SIGMA_CONSTRUCTION_FAILED',
        'sigma-construction',
        `SIGMA suffix failed during ${failedAt} [${COLLECTION_VERIFIER_REVISION}; markers=${inspection.markers.join(',') || 'none'}; tail=${inspection.tail.join(',') || 'empty'}]`,
        anchor.txid,
      )
    }
    const customInstructions = JSON.stringify({
      protocolID,
      keyID: collectionKeyID,
      counterparty: 'self',
      protocol: 'adinals-v3',
      subType: 'collection',
    })

    const createCollectionAction = () => wallet.createAction({
      description: 'Rehearse Adinals collection',
      labels: [ADINALS_NAMESPACE.actionLabel],
      inputBEEF: anchor.tx,
      inputs: [{
        outpoint: `${anchor.txid}.${anchorVout}`,
        inputDescription: 'Temporary Adinals collection fee reserve',
        unlockingScriptLength: 108,
      }],
      outputs: [{
        lockingScript: signedScript.toHex(),
        satoshis: 1,
        outputDescription: 'Adinals v3 collection',
        basket,
        customInstructions,
        tags: [
          `app:${ADINALS_NAMESPACE.app}`,
          'protocolVersion:3',
          'subType:collection',
        ],
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
    const collectionAttempt = await createAndCompleteNoSendAction(
      wallet,
      createCollectionAction,
      anchor.tx,
      async (transaction) => {
        const anchorInput = findAnchorInputIndex(transaction, anchor.txid, anchorVout)
        const unlockingScript = await signDerivedP2PKHInput(
          wallet,
          transaction,
          anchorInput,
          protocolID,
          anchorKeyID,
        )
        return { [anchorInput]: { unlockingScript } }
      },
    )
    const collectionCreated = collectionAttempt.created
    const collection = collectionAttempt.completed
    collectionReference = collectionCreated.signableTransaction?.reference ?? ''

    const transaction = Transaction.fromAtomicBEEF(collection.tx)
    if (transaction.id('hex') !== collection.txid) {
      throw new AdinalsActionError(
        'COLLECTION_TRANSACTION_INVALID',
        'verification',
        'The wallet returned an unexpected subject transaction.',
        anchor.txid,
      )
    }
    const collectionOutputIndexes = findByteIdenticalOneSatOutputs(transaction, signedScript)
    if (collectionOutputIndexes.length !== 1) {
      const summary = transaction.outputs
        .map((output, index) => `${index}:${output.satoshis ?? 0}:${output.lockingScript.toHex().slice(0, 20)}`)
        .join(', ')
      throw new AdinalsActionError(
        'COLLECTION_OUTPUT_NOT_UNIQUE',
        'verification',
        `Expected one byte-identical collection output; found ${collectionOutputIndexes.length}. Outputs: ${summary}`,
        anchor.txid,
      )
    }
    const outputIndex = collectionOutputIndexes[0] as number
    const output = transaction.outputs[outputIndex]
    if (!output) throw new Error('The located collection output is unavailable.')
    const verification = verifyCollectionScript(
      output.lockingScript,
      unsignedScript,
      { txid: anchor.txid, vout: anchorVout },
      map,
    )
    if (!verification.valid) {
      throw new AdinalsActionError(
        'COLLECTION_VECTOR_MISMATCH',
        'verification',
        verification.errors.join('; '),
        anchor.txid,
      )
    }

    return {
      status: 'rehearsed',
      broadcast: false,
      indexed: null,
      txid: collection.txid,
      outpoint: `${collection.txid}_${outputIndex}`,
      outputIndex,
      anchorTxid: anchor.txid,
      anchorOutpoint: `${anchor.txid}_${anchorVout}`,
      rawtx: transaction.toHex(),
      atomicBeef: collection.tx,
      noSendChange: collection.noSendChange ?? [],
      basket,
      protocolID,
      keyID: collectionKeyID,
      ownerAddress,
      map,
      verification,
      verifierRevision: COLLECTION_VERIFIER_REVISION,
      // Retained so a caller that refuses this rehearsal can release its
      // reserved funding. These are wallet-local handles and never belong in an
      // exported fixture.
      actionReference: collectionReference,
      anchorReference: anchorCreated.signableTransaction?.reference ?? '',
    }
  } catch (error) {
    // A completed no-send action is still abortable by its original reference.
    // Release the child first, then its parent, so failed rehearsals do not
    // strand wallet funding or leave an unusable dependency behind.
    const cleanup: string[] = []
    if (collectionReference) {
      try {
        const result = await wallet.abortAction({ reference: collectionReference })
        cleanup.push(result.aborted ? 'collection action released' : 'collection action retained')
      } catch {
        cleanup.push('collection cleanup unavailable')
      }
    }
    const anchorReference = anchorCreated.signableTransaction?.reference
    if (anchorReference) {
      try {
        const result = await wallet.abortAction({ reference: anchorReference })
        cleanup.push(result.aborted ? 'anchor released' : 'anchor retained')
      } catch {
        cleanup.push('anchor cleanup unavailable')
      }
    }

    const message = `${error instanceof Error ? error.message : String(error)}${
      cleanup.length ? ` Cleanup: ${cleanup.join(', ')}.` : ''
    }`
    if (error instanceof AdinalsActionError) {
      throw new AdinalsActionError(error.code, error.stage, message, error.anchorTxid)
    }
    throw new AdinalsActionError(
      'COLLECTION_REHEARSAL_FAILED',
      'collection',
      message,
      anchor.txid,
    )
  }
}

export const plannedAdinalsActions = [
  'createAdinal',
  'updateAdinal',
  'decideAdinal',
  'listAdinal',
  'buyAdinal',
] as const

export {
  buyAdinal,
  createAdinal,
  decideAdinal,
  listAdinal,
  updateAdinal,
  type AdinalsNoSendAction,
} from './lifecycle.ts'

export {
  abortLifecycleRehearsal,
  classifyLifecycleActions,
  inventoryNoSendLifecycle,
  type LifecycleInventory,
  type LifecycleInventoryPair,
} from './lifecycleInventory.ts'
