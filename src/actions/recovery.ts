import { Inscription } from '@1sat/templates'
import {
  Beef,
  PublicKey,
  Transaction,
  type ActionStatus,
  type WalletInterface,
  type WalletProtocol,
} from '@bsv/sdk'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import {
  buildUnsignedCollectionScript,
  decodeMapSet,
  extractUnsignedSigmaScript,
  verifyCollectionScript,
  type CollectionScriptVerification,
} from '../protocol/collectionScript.ts'
import {
  validateCollectionMap,
  type AdinalsCollectionMap,
} from '../protocol/collectionMetadata.ts'
import { findUnresolvedBeefDependencies } from '../protocol/beefValidation.ts'
import { findByteIdenticalOneSatOutputs } from '../protocol/transactionChecks.ts'
import { parseCollectionOutpoint } from './recoveryOutpoint.ts'

export { parseCollectionOutpoint } from './recoveryOutpoint.ts'

export type RecoveryWallet = Pick<WalletInterface, 'listActions' | 'listOutputs' | 'getPublicKey'>

export type RecoveredActionSummary = {
  txid: string
  status: ActionStatus
  description: string
}

export type RecoveredCollectionCandidate = {
  valid: boolean
  errors: string[]
  broadcast: false
  txid: string
  outpoint: string
  walletOutpoint: string
  outputIndex: number
  anchorTxid: string
  anchorOutpoint: string
  actionStatus: ActionStatus | null
  anchorActionStatus: ActionStatus | null
  rawtx: string
  atomicBeef: number[]
  basket: string
  protocolID: WalletProtocol
  keyID: string
  ownerAddress: string
  map: AdinalsCollectionMap
  verification: CollectionScriptVerification
  dependencyTransactionCount: number
  unresolvedDependencyCount: number
}

export type CollectionRecoveryAudit = {
  targetOutpoint: string
  walletOutpoint: string
  actions: RecoveredActionSummary[]
  outputFound: boolean
  actionQueryError: string
  outputQueryError: string
  candidate: RecoveredCollectionCandidate | null
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Read-only recovery for a completed no-send collection. This function never
 * calls createAction, signAction, abortAction, internalizeAction, or sendWith.
 */
export async function recoverNoSendCollection(
  wallet: RecoveryWallet,
  basket: string,
  requestedOutpoint: string,
): Promise<CollectionRecoveryAudit> {
  const target = parseCollectionOutpoint(requestedOutpoint)
  const [actionResult, outputResult] = await Promise.allSettled([
    wallet.listActions({
      labels: [ADINALS_NAMESPACE.actionLabel],
      labelQueryMode: 'all',
      includeLabels: true,
      includeInputs: true,
      includeInputSourceLockingScripts: true,
      includeInputUnlockingScripts: true,
      includeOutputs: true,
      includeOutputLockingScripts: true,
      limit: 100,
    }),
    wallet.listOutputs({
      basket,
      include: 'entire transactions',
      includeCustomInstructions: true,
      includeTags: true,
      includeLabels: true,
      limit: 100,
      offset: -1,
    }),
  ])

  const actions = actionResult.status === 'fulfilled'
    ? actionResult.value.actions.map((action) => ({
        txid: action.txid,
        status: action.status,
        description: action.description,
      }))
    : []
  const outputs = outputResult.status === 'fulfilled' ? outputResult.value.outputs : []
  const recoveredWalletOutput = outputs.find((output) => {
    try {
      return parseCollectionOutpoint(output.outpoint).wallet === target.wallet
    } catch {
      return false
    }
  })
  const outputFound = Boolean(recoveredWalletOutput)

  const audit: CollectionRecoveryAudit = {
    targetOutpoint: target.ordinal,
    walletOutpoint: target.wallet,
    actions,
    outputFound,
    actionQueryError: actionResult.status === 'rejected' ? errorMessage(actionResult.reason) : '',
    outputQueryError: outputResult.status === 'rejected' ? errorMessage(outputResult.reason) : '',
    candidate: null,
  }

  if (outputResult.status !== 'fulfilled' || !outputFound || !outputResult.value.BEEF) return audit

  try {
    const beef = Beef.fromBinary(outputResult.value.BEEF)
    const transaction = beef.findAtomicTransaction(target.txid)
    if (!transaction) throw new Error('The basket BEEF does not contain the requested transaction.')
    if (transaction.id('hex') !== target.txid) throw new Error('Recovered transaction txid mismatch.')
    const output = transaction.outputs[target.vout]
    if (!output) throw new Error('The requested output index is missing from the recovered transaction.')

    const errors: string[] = []
    if (output.satoshis !== 1) errors.push('collection output must contain exactly one satoshi')
    const identicalOutputIndexes = findByteIdenticalOneSatOutputs(transaction, output.lockingScript)
    if (identicalOutputIndexes.length !== 1) {
      errors.push(`collection script appears in ${identicalOutputIndexes.length} one-sat outputs`)
    }
    if (transaction.inputs.length !== 1) errors.push('collection transaction must spend exactly one anchor input')
    const anchorInput = transaction.inputs[0]
    const anchorTxid = anchorInput?.sourceTXID ?? anchorInput?.sourceTransaction?.id('hex') ?? ''
    const anchorVout = anchorInput?.sourceOutputIndex ?? -1
    if (!/^[0-9a-f]{64}$/i.test(anchorTxid) || anchorVout < 0) {
      errors.push('collection anchor outpoint is unavailable')
    }

    const decodedInscription = Inscription.decode(output.lockingScript)
    const decodedMap = decodeMapSet(output.lockingScript)
    if (!decodedInscription) errors.push('inscription not found')
    if (!decodedMap || decodedMap.cmd !== 'SET') errors.push('MAP SET not found')
    const map = (decodedMap?.data ?? {}) as AdinalsCollectionMap
    errors.push(...validateCollectionMap(map, ADINALS_NAMESPACE.app))

    const unsigned = extractUnsignedSigmaScript(output.lockingScript)
    if (!unsigned) errors.push('SIGMA suffix could not be separated from the recovered output')
    const verification = unsigned && anchorTxid
      ? verifyCollectionScript(
          output.lockingScript,
          unsigned,
          { txid: anchorTxid, vout: anchorVout },
          map,
        )
      : {
          valid: false,
          errors: ['recovered SIGMA verification could not run'],
          signerAddress: '',
          signerPublicKey: '',
          map: decodedMap?.data ?? null,
          contentType: decodedInscription?.file.type ?? '',
          contentBytes: decodedInscription?.file.content.length ?? 0,
        }
    errors.push(...verification.errors)

    let keyID = ''
    let recoveredProtocolID: WalletProtocol = [1, ADINALS_NAMESPACE.keyProtocol]
    try {
      if (!recoveredWalletOutput?.customInstructions) throw new Error('wallet output has no custom instructions')
      const instructions = JSON.parse(recoveredWalletOutput.customInstructions) as {
        protocolID?: unknown
        keyID?: unknown
        counterparty?: unknown
        protocol?: unknown
        subType?: unknown
      }
      if (
        !Array.isArray(instructions.protocolID) ||
        instructions.protocolID[0] !== 1 ||
        instructions.protocolID[1] !== ADINALS_NAMESPACE.keyProtocol
      ) throw new Error('wallet output protocolID does not match the active namespace')
      if (typeof instructions.keyID !== 'string' || !instructions.keyID) throw new Error('wallet output keyID is unavailable')
      if (instructions.counterparty !== 'self' || instructions.protocol !== 'adinals-v3' || instructions.subType !== 'collection') {
        throw new Error('wallet output routing metadata is not an Adinals v3 collection')
      }
      recoveredProtocolID = [1, ADINALS_NAMESPACE.keyProtocol]
      keyID = instructions.keyID
      const { publicKey } = await wallet.getPublicKey({
        protocolID: recoveredProtocolID,
        keyID,
        counterparty: 'self',
        forSelf: true,
      })
      const derivedAddress = PublicKey.fromString(publicKey).toAddress()
      if (derivedAddress !== verification.signerAddress) {
        throw new Error('wallet-derived collection key does not match the verified SIGMA creator')
      }
    } catch (routingError) {
      errors.push(`collection signer routing could not be recovered: ${errorMessage(routingError)}`)
    }

    if (unsigned && decodedInscription && verification.signerPublicKey && map.name) {
      const canonicalUnsigned = buildUnsignedCollectionScript(
        verification.signerPublicKey,
        map,
        {
          name: map.name,
          cover: {
            data: Uint8Array.from(decodedInscription.file.content),
            type: decodedInscription.file.type,
          },
        },
      )
      if (canonicalUnsigned.toHex() !== unsigned.toHex()) {
        errors.push('recovered unsigned output is not the canonical collection script for its SIGMA signer')
      }
    } else {
      errors.push('canonical collection reconstruction could not run')
    }

    const atomicBeef = beef.toBinaryAtomic(target.txid)
    const atomic = Beef.fromBinary(atomicBeef)
    const unresolvedDependencies = findUnresolvedBeefDependencies(atomic)
    const unresolvedDependencyCount = unresolvedDependencies.length
    if (unresolvedDependencyCount) {
      errors.push(`Atomic BEEF contains ${unresolvedDependencyCount} unresolved dependencies`)
    }

    const action = actions.find((item) => item.txid === target.txid)
    const anchorAction = actions.find((item) => item.txid === anchorTxid)
    if (!action) errors.push('collection action was not returned under the Adinals action label')
    else if (action.status !== 'nosend') errors.push(`collection action status is ${action.status}, not nosend`)
    if (!anchorAction) errors.push('anchor action was not returned under the Adinals action label')
    else if (anchorAction.status !== 'nosend') errors.push(`anchor action status is ${anchorAction.status}, not nosend`)

    const recoveredVerification = {
      ...verification,
      valid: errors.length === 0,
      errors,
    }
    audit.candidate = {
      valid: errors.length === 0,
      errors,
      broadcast: false,
      txid: target.txid,
      outpoint: target.ordinal,
      walletOutpoint: target.wallet,
      outputIndex: target.vout,
      anchorTxid,
      anchorOutpoint: `${anchorTxid}_${anchorVout}`,
      actionStatus: action?.status ?? null,
      anchorActionStatus: anchorAction?.status ?? null,
      rawtx: transaction.toHex(),
      atomicBeef,
      basket,
      protocolID: recoveredProtocolID,
      keyID,
      ownerAddress: verification.signerAddress,
      map,
      verification: recoveredVerification,
      dependencyTransactionCount: atomic.txs.length,
      unresolvedDependencyCount,
    }
  } catch (error) {
    audit.outputQueryError = `Recovered BEEF could not be verified: ${errorMessage(error)}`
  }

  return audit
}
