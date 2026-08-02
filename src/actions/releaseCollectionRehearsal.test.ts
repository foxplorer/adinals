import assert from 'node:assert/strict'
import test from 'node:test'
import { releaseCollectionRehearsal, type AbortingWallet } from './releaseCollectionRehearsal.ts'

const references = { actionReference: 'child-ref', anchorReference: 'anchor-ref' }

const wallet = (
  behaviour: (reference: string) => Promise<{ aborted: boolean }>,
): AbortingWallet & { calls: string[] } => {
  const calls: string[] = []
  return {
    calls,
    async abortAction({ reference }) {
      calls.push(reference)
      return behaviour(reference)
    },
  } as AbortingWallet & { calls: string[] }
}

test('a refused rehearsal releases the child before its anchor', async () => {
  const target = wallet(async () => ({ aborted: true }))
  const released = await releaseCollectionRehearsal(target, references)
  assert.deepEqual(target.calls, ['child-ref', 'anchor-ref'])
  assert.equal(released.childAborted, true)
  assert.equal(released.anchorAborted, true)
  assert.deepEqual(released.notes, ['collection action released', 'anchor released'])
})

test('a retained child leaves its anchor untouched', async () => {
  const target = wallet(async () => ({ aborted: false }))
  const released = await releaseCollectionRehearsal(target, references)
  assert.deepEqual(target.calls, ['child-ref'])
  assert.equal(released.childAborted, false)
  assert.equal(released.anchorAborted, null)
})

test('a wallet that throws is reported without replacing the original failure', async () => {
  const target = wallet(async () => { throw new Error('wallet locked') })
  const released = await releaseCollectionRehearsal(target, references)
  assert.equal(released.childAborted, false)
  assert.match(released.notes[0] ?? '', /cleanup unavailable: wallet locked/)
})

test('a missing reference is reported rather than guessed', async () => {
  const target = wallet(async () => ({ aborted: true }))
  const released = await releaseCollectionRehearsal(target, {
    actionReference: '',
    anchorReference: 'anchor-ref',
  })
  assert.deepEqual(target.calls, [])
  assert.equal(released.childAborted, false)
  assert.deepEqual(released.notes, ['collection action had no abort reference'])
})

test('a released child with no retained anchor still reports success', async () => {
  const target = wallet(async () => ({ aborted: true }))
  const released = await releaseCollectionRehearsal(target, {
    actionReference: 'child-ref',
    anchorReference: '',
  })
  assert.equal(released.childAborted, true)
  assert.equal(released.anchorAborted, false)
  assert.deepEqual(released.notes, ['collection action released', 'anchor had no abort reference'])
})
