import assert from 'node:assert/strict'
import test from 'node:test'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import {
  chainOrder,
  readCollectionAds,
  readCollectionSubmissions,
  readIndexedAdinals,
  readIndexedRecord,
  type IndexedAdinalsRecord,
} from './adinalsIndex.ts'

test('index search uses the active namespace and v3 subtype', async () => {
  let body: Record<string, any> = {}
  const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body)) as Record<string, any>
    return new Response(JSON.stringify([{
      outpoint: `${'a'.repeat(64)}_0`,
      owner: 'owner',
      origin: {
        outpoint: `${'a'.repeat(64)}_0`,
        data: { map: { subType: 'collection' }, sigma: [{ valid: true, address: 'signer' }] },
      },
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const rows = await readIndexedAdinals('collection', fetcher as typeof fetch)
  assert.equal(body.map.app, ADINALS_NAMESPACE.app)
  assert.equal(body.map.protocolVersion, '3')
  assert.equal(body.map.subType, 'collection')
  assert.equal(rows[0]?.signer, 'signer')
})

test('index reader fails closed on a malformed response', async () => {
  const fetcher = async () => new Response('{}', { status: 200 })
  await assert.rejects(() => readIndexedAdinals('ad', fetcher as typeof fetch), /non-array/)
})

const collectionId = `${'a'.repeat(64)}_0`

const indexRow = (outpoint: string, map: Record<string, unknown>) => ({
  outpoint,
  owner: 'owner',
  origin: { outpoint, data: { map, sigma: [{ valid: true, address: 'signer' }] } },
})

test('finds third-party submissions against a collection by top-level collectionId', async () => {
  // A creator cannot see another owner's update in their own basket, so this
  // server-side filter is the only way a creator-approval collection becomes
  // reviewable at all.
  const filters: Array<Record<string, string>> = []
  const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { map: Record<string, string> }
    filters.push(body.map)
    return new Response(JSON.stringify(
      body.map.subType === 'adUpdate'
        ? [indexRow(`${'b'.repeat(64)}_1`, { subType: 'adUpdate', collectionId })]
        : [],
    ), { status: 200 })
  }
  const { updates, decisions } = await readCollectionSubmissions(collectionId, fetcher as typeof fetch)
  assert.equal(updates.length, 1)
  assert.equal(decisions.length, 0)
  for (const filter of filters) {
    assert.equal(filter.collectionId, collectionId)
    assert.equal(filter.app, ADINALS_NAMESPACE.app)
  }
  assert.deepEqual(filters.map((filter) => filter.subType).sort(), ['adDecision', 'adUpdate'])
})

test('rejects a malformed collection outpoint before querying', async () => {
  const fetcher = async () => {
    throw new Error('the reader must not issue a request for a malformed outpoint')
  }
  await assert.rejects(
    () => readCollectionSubmissions('not-an-outpoint', fetcher as typeof fetch),
    /valid collection outpoint/,
  )
})

test('narrows ads to one collection client-side, since subTypeData is not filterable', async () => {
  const other = `${'c'.repeat(64)}_0`
  const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { map: Record<string, string> }
    assert.equal(body.map.subType, 'collectionItem')
    assert.equal(body.map.collectionId, undefined)
    return new Response(JSON.stringify([
      indexRow(`${'d'.repeat(64)}_0`, {
        subType: 'collectionItem',
        subTypeData: JSON.stringify({ collectionId, mintNumber: 1 }),
      }),
      indexRow(`${'e'.repeat(64)}_0`, {
        subType: 'collectionItem',
        subTypeData: JSON.stringify({ collectionId: other, mintNumber: 1 }),
      }),
      indexRow(`${'f'.repeat(64)}_0`, { subType: 'collectionItem', subTypeData: 'not json' }),
    ]), { status: 200 })
  }
  const ads = await readCollectionAds(collectionId, fetcher as typeof fetch)
  assert.equal(ads.length, 1)
  assert.equal(ads[0]?.outpoint, `${'d'.repeat(64)}_0`)
})

test('reads one exact output and reports an unindexed one as absent', async () => {
  const seen: string[] = []
  const fetcher = async (input: string | URL | Request) => {
    seen.push(String(input))
    return String(input).includes('a'.repeat(64))
      ? new Response(JSON.stringify(indexRow(collectionId, { subType: 'collection' })), { status: 200 })
      : new Response('not found', { status: 404 })
  }
  const found = await readIndexedRecord(collectionId, fetcher as typeof fetch)
  assert.equal(found?.outpoint, collectionId)
  // The exact txo endpoint, not the transaction-level inscription endpoint.
  assert.ok(seen[0]?.endsWith(`/txos/${collectionId}`), seen[0])

  assert.equal(await readIndexedRecord(`${'9'.repeat(64)}_0`, fetcher as typeof fetch), null)
})

test('accepts either outpoint separator and rejects malformed ones', async () => {
  const fetcher = async () => new Response(JSON.stringify(indexRow(collectionId, {})), { status: 200 })
  assert.ok(await readIndexedRecord(`${'a'.repeat(64)}.0`, fetcher as typeof fetch))
  await assert.rejects(() => readIndexedRecord('nope', fetcher as typeof fetch), /valid outpoint/)
})

test('orders a spend chain oldest first, leaving mempool records last', () => {
  const record = (height: number | null, index: number): IndexedAdinalsRecord =>
    ({ height, index } as IndexedAdinalsRecord)
  const ordered = [record(null, 0), record(900, 5), record(900, 1), record(800, 9)].sort(chainOrder)
  assert.deepEqual(
    ordered.map((entry) => [entry.height, entry.index]),
    [[800, 9], [900, 1], [900, 5], [null, 0]],
  )
})
