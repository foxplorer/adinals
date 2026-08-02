import {
  Beef,
  Hash,
  Script,
  Spend,
  Transaction,
  TransactionSignature,
  UnlockingScript,
  Utils,
  type CreateActionResult,
  type SignActionSpend,
  type WalletInterface,
  type WalletProtocol,
} from '@bsv/sdk'

export type CompletedNoSendAction = {
  txid: string
  tx: number[]
  noSendChange: string[]
}

export class LostSignActionSessionError extends Error {
  readonly code = 'SIGN_ACTION_SESSION_LOST'
  readonly reference: string
  readonly aborted: boolean

  constructor(reference: string, aborted: boolean) {
    super(aborted
      ? 'The wallet lost its pending signing session. The stale action was released safely; reconnect the wallet before trying again.'
      : 'The wallet lost its pending signing session and did not confirm release of the stale action. Reconnect the wallet and inspect its actions before retrying.')
    this.name = 'LostSignActionSessionError'
    this.reference = reference
    this.aborted = aborted
  }
}

const lostSignActionSession = (error: unknown): boolean =>
  /recovery of out-of-session signAction reference data is not yet implemented/i.test(
    error instanceof Error ? error.message : String(error),
  )

export async function signDerivedP2PKHInput(
  wallet: WalletInterface,
  transaction: Transaction,
  inputIndex: number,
  protocolID: WalletProtocol,
  keyID: string,
): Promise<string> {
  const input = transaction.inputs[inputIndex]
  const sourceLockingScript = input?.sourceTransaction?.outputs[input.sourceOutputIndex]?.lockingScript
  const sourceTXID = input?.sourceTXID ?? input?.sourceTransaction?.id('hex')
  if (!input || !sourceLockingScript || !sourceTXID) {
    throw new Error(`Missing source transaction for input ${inputIndex}.`)
  }
  const sourceSatoshis = input.sourceTransaction?.outputs[input.sourceOutputIndex]?.satoshis ?? 0
  const preimage = TransactionSignature.format({
    sourceTXID,
    sourceOutputIndex: input.sourceOutputIndex,
    sourceSatoshis,
    transactionVersion: transaction.version,
    otherInputs: transaction.inputs
      .filter((_, index) => index !== inputIndex)
      .map((other) => ({
        sourceTXID: other.sourceTXID ?? other.sourceTransaction?.id('hex') ?? '',
        sourceOutputIndex: other.sourceOutputIndex,
        sequence: other.sequence ?? 0xffffffff,
      })),
    inputIndex,
    outputs: transaction.outputs,
    inputSequence: input.sequence ?? 0xffffffff,
    subscript: sourceLockingScript,
    lockTime: transaction.lockTime,
    scope: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  })
  const sighash = Hash.sha256(Hash.sha256(preimage))
  const [{ signature }, { publicKey }] = await Promise.all([
    wallet.createSignature({
      protocolID,
      keyID,
      counterparty: 'self',
      data: preimage,
      hashToDirectlySign: sighash,
    }),
    wallet.getPublicKey({
      protocolID,
      keyID,
      counterparty: 'self',
      forSelf: true,
    }),
  ])
  return new UnlockingScript()
    .writeBin([
      ...signature,
      TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
    ])
    .writeBin(Utils.toArray(publicKey, 'hex'))
    .toHex()
}


/**
 * Runs a local `Spend` check and labels any failure as ours. The wallet uses
 * the same SDK, so an unlabelled script evaluation error gives no clue about
 * which side rejected the input.
 */
const verifyLocally = (index: number, build: () => Spend): boolean => {
  try {
    return build().validate()
  } catch (error) {
    throw new Error(
      `Local verification of input ${index} failed before the wallet was asked to sign: `
      + `${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

export async function completeNoSendAction(
  wallet: WalletInterface,
  created: CreateActionResult,
  inputBeef?: number[],
  sign: (transaction: Transaction) => Promise<Record<number, SignActionSpend>> = async () => ({}),
): Promise<CompletedNoSendAction> {
  // Inputs fully controlled by the wallet (such as the temporary fee reserve)
  // can be signed and processed atomically by createAction. Avoid manufacturing
  // a signAction reference for those transactions.
  if (created.txid && created.tx) {
    return {
      txid: created.txid,
      tx: Array.from(created.tx),
      noSendChange: created.noSendChange ?? [],
    }
  }
  if (!created.signableTransaction) throw new Error('The wallet did not return a signable transaction.')
  const { reference } = created.signableTransaction
  let spends: Record<number, SignActionSpend>

  try {
    const signableBeef = Beef.fromBinary(created.signableTransaction.tx)
    const signableTransaction = Transaction.fromBEEF(created.signableTransaction.tx)
    const mergedBeef = inputBeef ? Beef.fromBinary(inputBeef) : signableBeef
    if (inputBeef) mergedBeef.mergeBeef(signableBeef)
    const transaction = mergedBeef.findAtomicTransaction(signableTransaction.id('hex'))
    if (!transaction) throw new Error('Could not assemble the transaction verification BEEF.')

    spends = await sign(transaction)
    for (const [indexText, spend] of Object.entries(spends)) {
      const index = Number(indexText)
      const input = transaction.inputs[index]
      const sourceOutput = input?.sourceTransaction?.outputs[input.sourceOutputIndex]
      if (!input || !sourceOutput) throw new Error(`Missing source output for input ${index}.`)
      const unlockingScript = Script.fromHex(spend.unlockingScript)
      input.unlockingScript = unlockingScript
      // The wallet uses the same SDK, so an unlabelled script error could come
      // from either side. Name this one as ours before it propagates.
      const verified = verifyLocally(index, () => new Spend({
        sourceTXID: input.sourceTXID ?? input.sourceTransaction?.id('hex') ?? '',
        sourceOutputIndex: input.sourceOutputIndex,
        lockingScript: sourceOutput.lockingScript,
        sourceSatoshis: sourceOutput.satoshis ?? 0,
        transactionVersion: transaction.version,
        otherInputs: transaction.inputs.filter((_, otherIndex) => otherIndex !== index),
        unlockingScript,
        inputSequence: input.sequence ?? 0xffffffff,
        inputIndex: index,
        outputs: transaction.outputs,
        lockTime: transaction.lockTime,
      }))
      if (!verified) throw new Error(`Local script verification failed for input ${index}.`)
    }
  } catch (error) {
    const aborted = await wallet.abortAction({ reference })
      .then((result) => result.aborted)
      .catch(() => false)
    if (lostSignActionSession(error)) throw new LostSignActionSessionError(reference, aborted)
    throw error
  }

  // These options are the safety boundary. Do not add `sendWith` to a rehearsal.
  let signed
  try {
    signed = await wallet.signAction({
      reference,
      spends,
      options: {
        noSend: true,
        acceptDelayedBroadcast: true,
        returnTXIDOnly: false,
      },
    })
  } catch (error) {
    const aborted = await wallet.abortAction({ reference })
      .then((result) => result.aborted)
      .catch(() => false)
    if (lostSignActionSession(error)) throw new LostSignActionSessionError(reference, aborted)
    throw new Error(
      `The wallet rejected the signed inputs: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  if (!signed.txid || !signed.tx) throw new Error('The wallet did not return the no-send transaction.')
  return {
    txid: signed.txid,
    tx: Array.from(signed.tx),
    noSendChange: created.noSendChange ?? [],
  }
}

export type CompletedNoSendAttempt = {
  created: CreateActionResult
  completed: CompletedNoSendAction
  retriedAfterLostSession: boolean
}

/**
 * Rebuilds a signable action once, and only once, when the wallet confirms that
 * its stale out-of-session reference was aborted. No retry is allowed while
 * the first action might still be retained.
 */
export async function createAndCompleteNoSendAction(
  wallet: WalletInterface,
  create: () => Promise<CreateActionResult>,
  inputBeef?: number[],
  sign: (transaction: Transaction) => Promise<Record<number, SignActionSpend>> = async () => ({}),
): Promise<CompletedNoSendAttempt> {
  let created = await create()
  try {
    return {
      created,
      completed: await completeNoSendAction(wallet, created, inputBeef, sign),
      retriedAfterLostSession: false,
    }
  } catch (error) {
    if (!(error instanceof LostSignActionSessionError) || !error.aborted) throw error
  }

  created = await create()
  return {
    created,
    completed: await completeNoSendAction(wallet, created, inputBeef, sign),
    retriedAfterLostSession: true,
  }
}
