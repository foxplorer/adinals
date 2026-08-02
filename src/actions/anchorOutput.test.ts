import assert from 'node:assert/strict'
import test from 'node:test'
import { Beef, LockingScript, Transaction, UnlockingScript } from '@bsv/sdk'
import { findAnchorInputIndex, findAnchorOutputIndex } from './anchorOutput.ts'

const reserveScript = LockingScript.fromASM('OP_DUP OP_HASH160 ' + 'ab'.repeat(20) + ' OP_EQUALVERIFY OP_CHECKSIG')
const changeScript = LockingScript.fromASM('OP_DUP OP_HASH160 ' + 'cd'.repeat(20) + ' OP_EQUALVERIFY OP_CHECKSIG')
const RESERVE = 400

/** An anchor transaction whose declared reserve may sit behind wallet change. */
const anchorTransaction = (outputs: Array<{ script: LockingScript; satoshis: number }>): Transaction => {
  const transaction = new Transaction()
  for (const { script, satoshis } of outputs) {
    transaction.addOutput({ lockingScript: script, satoshis })
  }
  return transaction
}

const atomic = (transaction: Transaction): number[] => {
  const beef = new Beef()
  beef.mergeTransaction(transaction)
  return beef.toBinaryAtomic(transaction.id('hex'))
}

test('the reserve is found when the wallet keeps it at index 0', () => {
  const transaction = anchorTransaction([
    { script: reserveScript, satoshis: RESERVE },
    { script: changeScript, satoshis: 90_000 },
  ])
  assert.equal(findAnchorOutputIndex(atomic(transaction), reserveScript.toHex(), RESERVE), 0)
})

test('the reserve is found when the wallet puts its change first', () => {
  const transaction = anchorTransaction([
    { script: changeScript, satoshis: 90_000 },
    { script: reserveScript, satoshis: RESERVE },
  ])
  assert.equal(findAnchorOutputIndex(atomic(transaction), reserveScript.toHex(), RESERVE), 1)
})

test('an absent reserve is refused rather than assumed', () => {
  const transaction = anchorTransaction([{ script: changeScript, satoshis: 90_000 }])
  assert.throws(
    () => findAnchorOutputIndex(atomic(transaction), reserveScript.toHex(), RESERVE),
    /no output with the exact reserve script and value/,
  )
})

test('a duplicated reserve is refused because the anchor would be ambiguous', () => {
  const transaction = anchorTransaction([
    { script: reserveScript, satoshis: RESERVE },
    { script: reserveScript, satoshis: RESERVE },
  ])
  assert.throws(
    () => findAnchorOutputIndex(atomic(transaction), reserveScript.toHex(), RESERVE),
    /byte-identical fee reserve outputs/,
  )
})

test('a matching script with a different value is not the reserve', () => {
  const transaction = anchorTransaction([{ script: reserveScript, satoshis: RESERVE + 1 }])
  assert.throws(() => findAnchorOutputIndex(atomic(transaction), reserveScript.toHex(), RESERVE))
})

const spending = (sources: Array<{ transaction: Transaction; vout: number }>): Transaction => {
  const spend = new Transaction()
  for (const { transaction, vout } of sources) {
    spend.addInput({
      sourceTransaction: transaction,
      sourceOutputIndex: vout,
      unlockingScript: new UnlockingScript(),
    })
  }
  return spend
}

test('the anchor input is found wherever the wallet placed it', () => {
  const anchor = anchorTransaction([{ script: reserveScript, satoshis: RESERVE }])
  const funding = anchorTransaction([{ script: changeScript, satoshis: 90_000 }])
  const walletFirst = spending([{ transaction: funding, vout: 0 }, { transaction: anchor, vout: 0 }])
  const anchorFirst = spending([{ transaction: anchor, vout: 0 }, { transaction: funding, vout: 0 }])
  assert.equal(findAnchorInputIndex(walletFirst, anchor.id('hex'), 0), 1)
  assert.equal(findAnchorInputIndex(anchorFirst, anchor.id('hex'), 0), 0)
})

test('a transaction that never spends the reserve is refused', () => {
  const anchor = anchorTransaction([{ script: reserveScript, satoshis: RESERVE }])
  const funding = anchorTransaction([{ script: changeScript, satoshis: 90_000 }])
  assert.throws(
    () => findAnchorInputIndex(spending([{ transaction: funding, vout: 0 }]), anchor.id('hex'), 0),
    /did not spend the Adinals fee reserve/,
  )
})
