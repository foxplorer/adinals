import { Transaction } from '@bsv/sdk'

/**
 * Locates the fee-reserve output inside a completed anchor transaction.
 *
 * `createAction` declares outputs, it does not dictate their final positions.
 * A wallet is free to append its own change, and nothing in BRC-100 promises
 * that a declared output keeps index 0. Assuming it does means signing the
 * wallet's change output with an application-derived key, which fails at
 * `OP_CHECKSIG` rather than anywhere informative.
 *
 * The anchor is identified by its exact locking script and satoshi value, both
 * of which the caller chose. A duplicate is treated as unusable rather than
 * guessed at, because the SIGMA signature commits to one specific outpoint.
 */
/**
 * Locates the input that spends a known outpoint.
 *
 * The same reasoning applies on the input side: a wallet may add funding inputs
 * of its own, and signing a fixed index would apply an application-derived key
 * to whichever input happens to sit there.
 */
export function findAnchorInputIndex(
  transaction: Transaction,
  anchorTxid: string,
  anchorVout: number,
): number {
  const index = transaction.inputs.findIndex((input) => (
    (input.sourceTXID ?? input.sourceTransaction?.id('hex')) === anchorTxid
    && input.sourceOutputIndex === anchorVout
  ))
  if (index < 0) {
    throw new Error(
      `The wallet did not spend the Adinals fee reserve ${anchorTxid}_${anchorVout} in this transaction.`,
    )
  }
  return index
}

export function findAnchorOutputIndex(
  atomicBeef: number[],
  expectedLockingScriptHex: string,
  expectedSatoshis: number,
): number {
  const transaction = Transaction.fromAtomicBEEF(atomicBeef)
  const matches = transaction.outputs.reduce<number[]>((found, output, index) => (
    output.lockingScript.toHex() === expectedLockingScriptHex && output.satoshis === expectedSatoshis
      ? [...found, index]
      : found
  ), [])
  if (matches.length === 0) {
    throw new Error(
      'The wallet did not return the requested Adinals fee reserve output. '
      + 'Its anchor transaction contains no output with the exact reserve script and value.',
    )
  }
  if (matches.length > 1) {
    throw new Error(
      `The wallet returned ${matches.length} byte-identical fee reserve outputs, `
      + 'so the SIGMA anchor outpoint would be ambiguous.',
    )
  }
  return matches[0] as number
}
