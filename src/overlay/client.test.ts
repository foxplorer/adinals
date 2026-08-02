import assert from 'node:assert/strict'
import test from 'node:test'
import { P2PKH, PrivateKey, Transaction } from '@bsv/sdk'
import { AdinalsOverlayClient } from './client.ts'

const transaction = new Transaction()
transaction.addOutput({
  satoshis: 1,
  lockingScript: new P2PKH().lock(PrivateKey.fromRandom().toAddress()),
})
const txid = transaction.id('hex')
const outpoint = `${txid}_0`
const beef = transaction.toBEEF()

const jsonResponse = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json' } },
)

test('overlay client submits binary BEEF with the exact topic header', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const client = new AdinalsOverlayClient('http://localhost:8080/', {
    fetcher: (async (url, init) => {
      requests.push({ url: String(url), init })
      return jsonResponse({ tm_adinals: { outputsToAdmit: [0], coinsToRetain: [] } })
    }) as typeof fetch,
  })
  const result = await client.submit(beef)
  const request = requests[0]!
  assert.deepEqual(result.tm_adinals?.outputsToAdmit, [0])
  assert.equal(request.url, 'http://localhost:8080/submit')
  assert.equal(new Headers(request.init?.headers).get('x-topics'), '["tm_adinals"]')
  assert.deepEqual(Array.from(request.init?.body as Uint8Array), beef)
})

test('exact output lookup hydrates BEEF and verifies its txid', async () => {
  const client = new AdinalsOverlayClient('http://localhost:8080', {
    fetcher: (async (_url, init) => {
      const envelope = JSON.parse(String(init?.body)) as { query: { origin: string } }
      assert.equal(envelope.query.origin, outpoint)
      return jsonResponse({ outputs: [{ beef, outputIndex: 0 }] })
    }) as typeof fetch,
  })
  assert.equal(await client.hasOutput(outpoint), true)

  const other = new Transaction()
  other.addOutput({ satoshis: 2, lockingScript: transaction.outputs[0]!.lockingScript })
  const mismatched = new AdinalsOverlayClient('http://localhost:8080', {
    fetcher: (async () => jsonResponse({
      outputs: [{ beef: other.toBEEF(), outputIndex: 0 }],
    })) as typeof fetch,
  })
  assert.equal(await mismatched.hasOutput(outpoint), false)
})

test('default browser fetch is invoked through the global receiver', async () => {
  const original = globalThis.fetch
  let receiver: unknown
  globalThis.fetch = function (this: unknown) {
    receiver = this
    return Promise.resolve(new Response(JSON.stringify({ type: 'output-list', outputs: [] }), {
      headers: { 'content-type': 'application/json' },
    }))
  } as typeof fetch
  try {
    const client = new AdinalsOverlayClient('http://localhost:8080')
    await client.lookup({ type: 'output', version: 1, origin: `${'a'.repeat(64)}_0` })
    assert.equal(receiver, globalThis)
  } finally {
    globalThis.fetch = original
  }
})

test('empty duplicate STEAK acknowledgment is accepted for lookup verification', async () => {
  let calls = 0
  const client = new AdinalsOverlayClient('http://localhost:8080', {
    fetcher: (async (url) => {
      calls += 1
      return String(url).endsWith('/submit')
        ? jsonResponse({ tm_adinals: { outputsToAdmit: [], coinsToRetain: [] } })
        : jsonResponse({ outputs: [{ beef, outputIndex: 0 }] })
    }) as typeof fetch,
  })
  assert.deepEqual((await client.submit(beef)).tm_adinals?.outputsToAdmit, [])
  assert.equal(await client.hasOutput(outpoint), true)
  assert.equal(calls, 2)
})
