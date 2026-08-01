import assert from 'node:assert/strict'
import test from 'node:test'
import { readRecords, submitToIndexer } from './productCatalog.ts'

const txid = 'a'.repeat(64)
const outpoint = `${txid}_1`

test('a successful submission is retried until the exact output is indexed', async () => {
  let posts = 0
  let lookups = 0
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (init?.method === 'POST') {
      posts += 1
      return new Response(null, { status: 204 })
    }
    assert.match(String(input), new RegExp(`/txos/${outpoint}$`))
    lookups += 1
    return new Response(null, { status: lookups >= 3 ? 200 : 404 })
  }

  const indexed = await submitToIndexer(txid, outpoint, {
    fetcher: fetcher as typeof fetch,
    retryDelaysMs: [0, 0],
    settleDelayMs: 0,
  })
  assert.equal(indexed, true)
  assert.equal(posts, 2)
  assert.equal(lookups, 3)
})

test('submission never reports indexed from HTTP 204 alone', async () => {
  let posts = 0
  const fetcher = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (init?.method === 'POST') posts += 1
    return new Response(null, { status: init?.method === 'POST' ? 204 : 404 })
  }

  const indexed = await submitToIndexer(txid, outpoint, {
    fetcher: fetcher as typeof fetch,
    retryDelaysMs: [0, 0, 0],
    settleDelayMs: 0,
  })
  assert.equal(indexed, false)
  assert.equal(posts, 3)
})

test('a known spend with a missing successor is marked as incomplete', async () => {
  const origin = 'b'.repeat(64)
  const listing = 'c'.repeat(64)
  const purchase = 'd'.repeat(64)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify([{
    outpoint: `${listing}_0`,
    origin: {
      outpoint: `${origin}_0`,
      data: {
        map: { app: 'adinals', type: 'ord', subType: 'collectionItem', protocolVersion: '3' },
        sigma: [],
      },
    },
    owner: 'seller',
    spend: purchase,
    data: { list: { price: 100 } },
  }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  try {
    const rows = await readRecords('ad')
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.listing?.price, 100)
    assert.equal(rows[0]?.chainIncomplete, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})
