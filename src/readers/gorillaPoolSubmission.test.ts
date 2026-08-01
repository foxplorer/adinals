import assert from 'node:assert/strict'
import test from 'node:test'
import { submitTransactionToGorillaPool } from './gorillaPoolSubmission.ts'

test('submits only the exact txid to the GorillaPool indexing endpoint', async () => {
  const txid = 'a'.repeat(64)
  let requestUrl = ''
  let requestMethod = ''
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input)
    requestMethod = init?.method ?? ''
    return new Response('', { status: 200 })
  }) as typeof fetch
  assert.equal(await submitTransactionToGorillaPool(txid, fetcher), true)
  assert.equal(requestUrl, `https://ordinals.gorillapool.io/api/tx/${txid}/submit`)
  assert.equal(requestMethod, 'POST')
})

test('submission failures remain separate from wallet publication', async () => {
  const fetcher = (async () => new Response('', { status: 503 })) as typeof fetch
  assert.equal(await submitTransactionToGorillaPool('b'.repeat(64), fetcher), false)
})
