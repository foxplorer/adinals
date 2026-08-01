/**
 * The anchor is a temporary input for the signed child transaction. It must
 * fund the child's one-satoshi record output and its network fee; any remainder
 * is returned by the wallet as no-send change.
 *
 * BSV SDK wallets default to 100 sat/kB. We size against the actual unsigned
 * record, add the fixed SIGMA envelope, allow room for an unlocking script and
 * up to ten wallet-managed P2PKH change outputs, then add a 50-satoshi margin.
 * The 200-satoshi floor keeps small records portable without returning to the
 * old fixed 2,000-satoshi test reserve.
 */
export const SIGMA_REFERENCE_FEE_SATS_PER_KB = 100
export const SIGMA_ANCHOR_MINIMUM_SATOSHIS = 200

const SIGMA_SUFFIX_BYTES = 115
const P2PKH_INPUT_BYTES = 149
const P2PKH_OUTPUT_BYTES = 34
const ASSUMED_CHANGE_OUTPUTS = 10
const FEE_MARGIN_SATOSHIS = 50
const RECORD_OUTPUT_SATOSHIS = 1

const varIntBytes = (value: number): number => {
  if (value < 0xfd) return 1
  if (value <= 0xffff) return 3
  if (value <= 0xffffffff) return 5
  return 9
}

export function estimateSigmaChildBytes(unsignedScriptBytes: number): number {
  if (!Number.isSafeInteger(unsignedScriptBytes) || unsignedScriptBytes < 0) {
    throw new Error('Unsigned SIGMA script size must be a non-negative safe integer.')
  }
  const signedScriptBytes = unsignedScriptBytes + SIGMA_SUFFIX_BYTES
  return 4 // version
    + 1 // input count
    + P2PKH_INPUT_BYTES
    + 1 // output count (record plus the conservative change allowance remains below 0xfd)
    + 8 + varIntBytes(signedScriptBytes) + signedScriptBytes
    + (ASSUMED_CHANGE_OUTPUTS * P2PKH_OUTPUT_BYTES)
    + 4 // locktime
}

export function calculateSigmaAnchorReserve(unsignedScriptBytes: number): number {
  const estimatedFee = Math.ceil(
    estimateSigmaChildBytes(unsignedScriptBytes) * SIGMA_REFERENCE_FEE_SATS_PER_KB / 1_000,
  )
  return Math.max(
    SIGMA_ANCHOR_MINIMUM_SATOSHIS,
    RECORD_OUTPUT_SATOSHIS + estimatedFee + FEE_MARGIN_SATOSHIS,
  )
}
