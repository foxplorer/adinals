import { P2PKH, PublicKey, Script, Spend, Transaction, Utils } from '@bsv/sdk'

export type SpendLinkedRecordProof = {
  error: string
  predecessorOutpoint: string
  successorOutpoint: string
  recordOutpoint: string
  owner: string
}

export function parseProtocolOutpoint(
  value: string,
): { txid: string; vout: number; normalized: string } | null {
  const match = /^([0-9a-f]{64})[._](\d+)$/i.exec(value.trim())
  if (!match) return null
  const vout = Number(match[2])
  if (!Number.isSafeInteger(vout)) return null
  const txid = (match[1] as string).toLowerCase()
  return { txid, vout, normalized: `${txid}_${vout}` }
}

const failedProof = (
  error: string,
  predecessorOutpoint = '',
  recordOutpoint = '',
): SpendLinkedRecordProof => ({
  error,
  predecessorOutpoint,
  successorOutpoint: '',
  recordOutpoint,
  owner: '',
})

function containsP2pkhLock(script: Script, expectedLockHex: string): boolean {
  for (let index = 0; index <= script.chunks.length - 5; index += 1) {
    if (new Script(script.chunks.slice(index, index + 5)).toHex() === expectedLockHex) return true
  }
  return false
}

export type OwnerInputProof = { error: string; owner: string; sourceOutpoint: string }

/** Proves input 0 is an ALL-scoped spend by the controller of its source. */
export function validateOwnerInputZero(
  transaction: Transaction,
  sourceTransaction: Transaction,
  declaredSourceOutpoint: string,
): OwnerInputProof {
  const source = parseProtocolOutpoint(declaredSourceOutpoint)
  if (!source) return { error: 'malformed source outpoint', owner: '', sourceOutpoint: '' }
  if (sourceTransaction.id('hex').toLowerCase() !== source.txid) {
    return { error: 'source transaction id mismatch', owner: '', sourceOutpoint: source.normalized }
  }
  const input = transaction.inputs[0]
  const sourceOutput = sourceTransaction.outputs[source.vout]
  if (!input || input.sourceTXID?.toLowerCase() !== source.txid || input.sourceOutputIndex !== source.vout) {
    return { error: 'input 0 does not spend the declared source', owner: '', sourceOutpoint: source.normalized }
  }
  if (!sourceOutput || sourceOutput.satoshis !== 1) {
    return { error: 'source is not a one-satoshi ordinal output', owner: '', sourceOutpoint: source.normalized }
  }
  const unlocking = input.unlockingScript
  const signature = unlocking?.chunks[0]?.data
  const publicKeyBytes = unlocking?.chunks[1]?.data
  if (!unlocking || unlocking.chunks.length !== 2 || !signature?.length || !publicKeyBytes?.length) {
    return { error: 'input 0 is not a canonical P2PKH authorization', owner: '', sourceOutpoint: source.normalized }
  }
  const signatureScope = signature[signature.length - 1] as number
  if ((signatureScope & 0x1f) !== 0x01 || (signatureScope & 0x80) !== 0) {
    return { error: 'input 0 signature does not commit all inputs and outputs', owner: '', sourceOutpoint: source.normalized }
  }
  let owner = ''
  try {
    owner = PublicKey.fromString(Utils.toHex(publicKeyBytes)).toAddress()
  } catch {
    return { error: 'input 0 contains an invalid public key', owner: '', sourceOutpoint: source.normalized }
  }
  if (!containsP2pkhLock(sourceOutput.lockingScript, new P2PKH().lock(owner).toHex())) {
    return { error: 'input 0 key does not control the source', owner: '', sourceOutpoint: source.normalized }
  }
  try {
    const spend = new Spend({
      sourceTXID: source.txid,
      sourceOutputIndex: source.vout,
      lockingScript: sourceOutput.lockingScript,
      sourceSatoshis: sourceOutput.satoshis,
      transactionVersion: transaction.version,
      otherInputs: transaction.inputs.slice(1).map((other) => ({
        sourceTXID: other.sourceTXID as string,
        sourceOutputIndex: other.sourceOutputIndex,
        sequence: other.sequence ?? 0xffffffff,
      })),
      unlockingScript: unlocking,
      inputSequence: input.sequence ?? 0xffffffff,
      inputIndex: 0,
      outputs: transaction.outputs,
      lockTime: transaction.lockTime,
    })
    if (!spend.validate()) return { error: 'input 0 signature is invalid', owner: '', sourceOutpoint: source.normalized }
  } catch {
    return { error: 'input 0 signature is invalid', owner: '', sourceOutpoint: source.normalized }
  }
  return { error: '', owner, sourceOutpoint: source.normalized }
}

/**
 * Proves the v3 owner transition: input 0 spends the declared one-satoshi
 * predecessor, output 0 returns it to the same controller, output 1 is the
 * sibling record, and the canonical P2PKH signature commits every output.
 */
export function validateSpendLinkedRecord(
  transaction: Transaction,
  predecessorTransaction: Transaction,
  declaredPredecessorOutpoint: string,
  declaredRecordOutpoint: string,
): SpendLinkedRecordProof {
  const predecessor = parseProtocolOutpoint(declaredPredecessorOutpoint)
  const record = parseProtocolOutpoint(declaredRecordOutpoint)
  if (!predecessor) return failedProof('malformed predecessor outpoint')
  if (!record) return failedProof('malformed record outpoint', predecessor.normalized)

  const txid = transaction.id('hex').toLowerCase()
  if (record.txid !== txid || record.vout !== 1) {
    return failedProof('record is not output 1 of its transition transaction', predecessor.normalized, record.normalized)
  }
  if (predecessorTransaction.id('hex').toLowerCase() !== predecessor.txid) {
    return failedProof('predecessor transaction id mismatch', predecessor.normalized, record.normalized)
  }

  const input = transaction.inputs[0]
  if (!input || input.sourceTXID?.toLowerCase() !== predecessor.txid || input.sourceOutputIndex !== predecessor.vout) {
    return failedProof('input 0 does not spend the declared predecessor', predecessor.normalized, record.normalized)
  }

  const predecessorOutput = predecessorTransaction.outputs[predecessor.vout]
  const successorOutput = transaction.outputs[0]
  const recordOutput = transaction.outputs[1]
  if (!predecessorOutput || predecessorOutput.satoshis !== 1) {
    return failedProof('predecessor is not a one-satoshi ordinal output', predecessor.normalized, record.normalized)
  }
  if (!successorOutput || successorOutput.satoshis !== 1) {
    return failedProof('output 0 is not a one-satoshi successor', predecessor.normalized, record.normalized)
  }
  if (!recordOutput || recordOutput.satoshis !== 1) {
    return failedProof('output 1 is not a one-satoshi sibling record', predecessor.normalized, record.normalized)
  }

  const unlocking = input.unlockingScript
  const signature = unlocking?.chunks[0]?.data
  const publicKeyBytes = unlocking?.chunks[1]?.data
  if (!unlocking || unlocking.chunks.length !== 2 || !signature?.length || !publicKeyBytes?.length) {
    return failedProof('input 0 is not a canonical P2PKH authorization', predecessor.normalized, record.normalized)
  }
  const signatureScope = signature[signature.length - 1] as number
  if ((signatureScope & 0x1f) !== 0x01 || (signatureScope & 0x80) !== 0) {
    return failedProof('input 0 signature does not commit all inputs and outputs', predecessor.normalized, record.normalized)
  }

  let owner = ''
  try {
    owner = PublicKey.fromString(Utils.toHex(publicKeyBytes)).toAddress()
  } catch {
    return failedProof('input 0 contains an invalid public key', predecessor.normalized, record.normalized)
  }
  const expectedLock = new P2PKH().lock(owner).toHex()
  if (!containsP2pkhLock(predecessorOutput.lockingScript, expectedLock)) {
    return failedProof('input 0 key does not control the predecessor', predecessor.normalized, record.normalized)
  }
  if (successorOutput.lockingScript.toHex() !== expectedLock) {
    return failedProof('output 0 does not return the ordinal to the same owner', predecessor.normalized, record.normalized)
  }

  try {
    const spend = new Spend({
      sourceTXID: predecessor.txid,
      sourceOutputIndex: predecessor.vout,
      lockingScript: predecessorOutput.lockingScript,
      sourceSatoshis: predecessorOutput.satoshis,
      transactionVersion: transaction.version,
      otherInputs: transaction.inputs.slice(1).map((other) => ({
        sourceTXID: other.sourceTXID as string,
        sourceOutputIndex: other.sourceOutputIndex,
        sequence: other.sequence ?? 0xffffffff,
      })),
      unlockingScript: unlocking,
      inputSequence: input.sequence ?? 0xffffffff,
      inputIndex: 0,
      outputs: transaction.outputs,
      lockTime: transaction.lockTime,
    })
    if (!spend.validate()) return failedProof('input 0 signature is invalid', predecessor.normalized, record.normalized)
  } catch {
    return failedProof('input 0 signature is invalid', predecessor.normalized, record.normalized)
  }

  return {
    error: '',
    predecessorOutpoint: predecessor.normalized,
    successorOutpoint: `${txid}_0`,
    recordOutpoint: record.normalized,
    owner,
  }
}
