import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { CreateActionResult } from '@bsv/sdk'
import {
  createAndCompleteNoSendAction,
  LostSignActionSessionError,
} from './actionSigning.ts'

const lostReference = new Error(
  'recovery of out-of-session signAction reference data is not yet implemented.',
)

const fixtureBeef = async (): Promise<{ txid: string; tx: number[] }> => {
  const source = JSON.parse(await readFile(
    new URL('../../tests/fixtures/collections/published-mainnet-yours-446af364.json', import.meta.url),
    'utf8',
  )) as { txid: string; atomicBeef: { data: string } }
  return { txid: source.txid, tx: Array.from(Buffer.from(source.atomicBeef.data, 'base64')) }
}

test('a confirmed stale signing reference is rebuilt exactly once', async () => {
  const fixture = await fixtureBeef()
  let creates = 0
  let signs = 0
  let aborts = 0
  const create = async (): Promise<CreateActionResult> => ({
    signableTransaction: { reference: `reference-${++creates}`, tx: fixture.tx },
  })
  const wallet = {
    signAction: async () => {
      signs += 1
      if (signs === 1) throw lostReference
      return { txid: fixture.txid, tx: fixture.tx }
    },
    abortAction: async () => {
      aborts += 1
      return { aborted: true }
    },
  }

  const result = await createAndCompleteNoSendAction(wallet as never, create)
  assert.equal(result.retriedAfterLostSession, true)
  assert.equal(result.created.signableTransaction?.reference, 'reference-2')
  assert.equal(result.completed.txid, fixture.txid)
  assert.equal(creates, 2)
  assert.equal(signs, 2)
  assert.equal(aborts, 1)
})

test('a stale reference is never retried unless the wallet confirms abort', async () => {
  const fixture = await fixtureBeef()
  let creates = 0
  const create = async (): Promise<CreateActionResult> => {
    creates += 1
    return { signableTransaction: { reference: 'retained-reference', tx: fixture.tx } }
  }
  const wallet = {
    signAction: async () => { throw lostReference },
    abortAction: async () => ({ aborted: false }),
  }

  await assert.rejects(
    () => createAndCompleteNoSendAction(wallet as never, create),
    (error: unknown) => error instanceof LostSignActionSessionError && !error.aborted,
  )
  assert.equal(creates, 1)
})
