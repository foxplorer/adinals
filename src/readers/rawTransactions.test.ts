import assert from 'node:assert/strict'
import test from 'node:test'
import { MerklePath, Transaction, Utils } from '@bsv/sdk'
import {
  createRawTransactionReader,
  parseGorillaPoolTransactionProof,
} from './rawTransactions.ts'

const transaction = new Transaction(1, [], [], 0)
const rawHex = transaction.toHex()
const txid = transaction.id('hex')

const gorillaPoolProof = (source: Transaction): number[] => {
  const raw = source.toBinary()
  const merklePath = MerklePath.fromCoinbaseTxidAndHeight(source.id('hex'), 123).toBinary()
  const writer = new Utils.Writer()
  writer.writeVarIntNum(raw.length)
  writer.write(raw)
  writer.writeVarIntNum(merklePath.length)
  writer.write(merklePath)
  return writer.toArray()
}

test('GorillaPool proof envelopes decode as raw transaction plus BUMP, not EF', () => {
  const parsed = parseGorillaPoolTransactionProof(gorillaPoolProof(transaction))
  assert.equal(parsed.id('hex'), txid)
  assert.equal(parsed.merklePath?.blockHeight, 123)
  assert.equal(Transaction.fromAtomicBEEF(parsed.toAtomicBEEF()).id('hex'), txid)
  assert.throws(
    () => parseGorillaPoolTransactionProof([...gorillaPoolProof(transaction), 0]),
    /unexpected trailing bytes/,
  )
})

test('a successful primary raw reader avoids noisy secondary requests and is cached', async () => {
  const requests: string[] = []
  const fetcher = (async (input: string | URL | Request) => {
    requests.push(String(input))
    return new Response(rawHex, { status: 200 })
  }) as typeof fetch
  const read = createRawTransactionReader(fetcher)

  assert.equal((await read(txid)).id('hex'), txid)
  assert.equal((await read(txid)).id('hex'), txid)
  assert.equal(requests.length, 1)
  assert.match(requests[0] ?? '', /whatsonchain/)
})

test('raw transaction reading falls back sequentially without probing GorillaPool unnecessarily', async () => {
  const requests: string[] = []
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input)
    requests.push(url)
    return url.includes('whatsonchain')
      ? new Response('', { status: 503 })
      : new Response(rawHex, { status: 200 })
  }) as typeof fetch

  assert.equal((await createRawTransactionReader(fetcher)(txid)).id('hex'), txid)
  assert.equal(requests.length, 2)
  assert.match(requests[1] ?? '', /bitails/)
  assert.equal(requests.some((url) => url.includes('gorillapool')), false)
})
