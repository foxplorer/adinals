import assert from 'node:assert/strict'
import test from 'node:test'
import { readCollectionNetworkPreflight } from './networkStatus.ts'

const TXID_A = 'a'.repeat(64)
const TXID_B = 'b'.repeat(64)

test('network preflight passes only when both readers report both transactions absent', async () => {
  const fetcher = (async () => new Response('', { status: 404 })) as typeof fetch
  const result = await readCollectionNetworkPreflight(TXID_A, TXID_B, fetcher)
  assert.equal(result.allReadersAbsent, true)
  assert.equal(result.anchor.whatsOnChain.presence, 'absent')
  assert.equal(result.collection.gorillaPool.presence, 'absent')
})

test('reader failures are unavailable and never count as absence', async () => {
  const fetcher = (async (input: string | URL | Request) => {
    if (String(input).includes('whatsonchain')) throw new Error('offline')
    return new Response('', { status: 404 })
  }) as typeof fetch
  const result = await readCollectionNetworkPreflight(TXID_A, TXID_B, fetcher)
  assert.equal(result.allReadersAbsent, false)
  assert.equal(result.anchor.whatsOnChain.presence, 'unavailable')
  assert.equal(result.anchor.gorillaPool.presence, 'absent')
})

test('a transaction found by either reader blocks the absence gate', async () => {
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('whatsonchain') && url.endsWith(TXID_B)) {
      return new Response(JSON.stringify({ confirmations: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch
  const result = await readCollectionNetworkPreflight(TXID_A, TXID_B, fetcher)
  assert.equal(result.allReadersAbsent, false)
  assert.equal(result.collection.whatsOnChain.presence, 'present')
  assert.equal(result.collection.whatsOnChain.detail, 'Seen in mempool')
})

test('GorillaPool presence checks the inscription index rather than raw transaction storage', async () => {
  const urls: string[] = []
  const fetcher = (async (input: string | URL | Request) => {
    urls.push(String(input))
    return new Response('', { status: 404 })
  }) as typeof fetch
  await readCollectionNetworkPreflight(TXID_A, TXID_B, fetcher)
  assert.ok(urls.includes(`https://ordinals.gorillapool.io/api/inscriptions/txid/${TXID_A}`))
  assert.ok(urls.includes(`https://ordinals.gorillapool.io/api/inscriptions/txid/${TXID_B}`))
  assert.equal(urls.some((url) => /\/api\/tx\/[a-f0-9]{64}$/.test(url)), false)
})

test('an empty successful GorillaPool inscription response still means absent', async () => {
  const fetcher = (async (input: string | URL | Request) => {
    if (String(input).includes('gorillapool')) {
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch
  const result = await readCollectionNetworkPreflight(TXID_A, TXID_B, fetcher)
  assert.equal(result.allReadersAbsent, true)
  assert.equal(result.collection.gorillaPool.detail, 'No indexed inscription returned')
})

test('an exact ordinal outpoint uses GorillaPool origin-indexed txo presence', async () => {
  const urls: string[] = []
  const fetcher = (async (input: string | URL | Request) => {
    urls.push(String(input))
    return new Response('', { status: 404 })
  }) as typeof fetch
  await readCollectionNetworkPreflight(TXID_A, TXID_B, fetcher, `${TXID_B}_0`)
  assert.ok(urls.includes(`https://ordinals.gorillapool.io/api/txos/${TXID_B}_0`))
})
