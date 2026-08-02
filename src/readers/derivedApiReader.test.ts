import assert from 'node:assert/strict'
import test from 'node:test'
import { readDerivedCollectionProjection } from './derivedApiReader.ts'

const origin = `${'a'.repeat(64)}_0`
const adOrigin = `${'b'.repeat(64)}_0`
const current = `${'c'.repeat(64)}_0`
const creative = `${'c'.repeat(64)}_1`

const response = (body: unknown): Response => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'content-type': 'application/json' },
})

test('maps the current derived reader into provider-neutral parity fields', async () => {
  const projection = await readDerivedCollectionProjection(origin, {
    apiBase: 'https://reader.example/v1/',
    fetcher: (async (url) => {
      assert.equal(String(url), `https://reader.example/v1/collections/${origin}/live`)
      return response({
        protocolVersion: '3', namespace: 'adinals', displayEligible: true,
        collection: {
          id: origin, creator: '1Creator', capacity: 5, approval: 'creator',
          format: 'text', expiresAt: '2026-08-08T17:38:39.643Z',
        },
        ads: [{
          slot: 1, origin: adOrigin, currentOutpoint: current, owner: '1Owner',
          proposalStatus: 'live', creative: {
            kind: 'text', text: 'hello', sourceOutpoint: creative,
          },
        }],
      })
    }) as typeof fetch,
  })
  assert.equal(projection.ads[0]?.creative.text, 'hello')
  assert.equal(projection.collection.displayEligible, true)
})

test('rejects malformed current-reader membership instead of inventing parity', async () => {
  await assert.rejects(() => readDerivedCollectionProjection(origin, {
    fetcher: (async () => response({
      protocolVersion: '3', namespace: 'adinals', displayEligible: true,
      collection: { id: origin, creator: '1Creator', capacity: 5, approval: 'creator', format: 'text' },
      ads: [{ slot: 1, origin: 'bad', currentOutpoint: current, owner: '1Owner', proposalStatus: 'live', creative: { kind: 'text', text: '', sourceOutpoint: creative } }],
    })) as typeof fetch,
  }), /invalid ad/)
})

test('hashes image bytes from the immutable creative source URL', async () => {
  const bytes = Uint8Array.from([1, 2, 3, 4])
  const projection = await readDerivedCollectionProjection(origin, {
    fetcher: (async (url) => String(url).includes('/collections/')
      ? response({
          protocolVersion: '3', namespace: 'adinals', displayEligible: true,
          collection: { id: origin, creator: '1Creator', capacity: 1, approval: 'open', format: 'image' },
          ads: [{ slot: 1, origin: adOrigin, currentOutpoint: current, owner: '1Owner', proposalStatus: 'live', creative: {
            kind: 'image', sourceOutpoint: creative,
            contentUrl: `https://content.example/${creative}`,
          } }],
        })
      : new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } })) as typeof fetch,
  })
  assert.equal(projection.ads[0]?.creative.contentHash.length, 64)
})
