import assert from 'node:assert/strict'
import test from 'node:test'
import { LockingScript, Transaction, UnlockingScript } from '@bsv/sdk'
import { collectionAnchorErrors, readCollectionAnchor } from './collectionAnchor.ts'

/** One spendable source output, standing in for an anchor or funding UTXO. */
const source = (marker: string): Transaction => {
  const transaction = new Transaction()
  transaction.addOutput({
    satoshis: 400,
    lockingScript: LockingScript.fromASM(`OP_RETURN ${marker}`),
  })
  return transaction
}

const collectionSpending = (sources: readonly Transaction[]): Transaction => {
  const transaction = new Transaction()
  for (const spent of sources) {
    transaction.addInput({
      sourceTransaction: spent,
      sourceOutputIndex: 0,
      unlockingScript: new UnlockingScript(),
    })
  }
  transaction.addOutput({ satoshis: 1, lockingScript: LockingScript.fromASM('OP_RETURN 03') })
  return transaction
}

test('the anchor is read from input 0 regardless of later inputs', () => {
  const anchor = source('01')
  const funding = source('02')
  const single = readCollectionAnchor(collectionSpending([anchor]))
  const withFunding = readCollectionAnchor(collectionSpending([anchor, funding]))
  assert.equal(single?.outpoint, `${anchor.id('hex')}_0`)
  assert.deepEqual(withFunding, single)
})

test('a wallet-added funding input after the anchor is accepted', () => {
  const anchor = source('01')
  const transaction = collectionSpending([anchor, source('02')])
  assert.deepEqual(collectionAnchorErrors(transaction, `${anchor.id('hex')}_0`), [])
})

test('a collection whose input 0 is not the signed anchor is rejected', () => {
  const anchor = source('01')
  const transaction = collectionSpending([source('02'), anchor])
  const errors = collectionAnchorErrors(transaction, `${anchor.id('hex')}_0`)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /rather than the signed anchor/)
})

test('an unresolvable anchor outpoint is rejected', () => {
  const transaction = new Transaction()
  transaction.addOutput({ satoshis: 1, lockingScript: LockingScript.fromASM('OP_RETURN 03') })
  assert.deepEqual(
    collectionAnchorErrors(transaction, ''),
    ['collection anchor outpoint is unavailable'],
  )
})

test('an unchecked anchor still passes when no expectation is retained', () => {
  const transaction = collectionSpending([source('01'), source('02')])
  assert.deepEqual(collectionAnchorErrors(transaction), [])
})
