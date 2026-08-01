import { Script, Transaction } from '@bsv/sdk'

export function findByteIdenticalOneSatOutputs(
  transaction: Transaction,
  expectedScript: Script,
): number[] {
  const expectedHex = expectedScript.toHex()
  return transaction.outputs.flatMap((output, index) =>
    output.satoshis === 1 && output.lockingScript.toHex() === expectedHex
      ? [index]
      : [],
  )
}
