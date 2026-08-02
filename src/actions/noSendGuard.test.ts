import assert from 'node:assert/strict'
import test from 'node:test'
import { releaseOnFailure } from './noSendGuard.ts'
import type { AbortingWallet } from './releaseCollectionRehearsal.ts'

const wallet = (
  behaviour: () => Promise<{ aborted: boolean }> = async () => ({ aborted: true }),
): AbortingWallet & { calls: string[] } => {
  const calls: string[] = []
  return {
    calls,
    async abortAction({ reference }) {
      calls.push(reference)
      return behaviour()
    },
  } as AbortingWallet & { calls: string[] }
}

test('a passing verification returns its value and reserves nothing back', async () => {
  const target = wallet()
  const value = await releaseOnFailure(target, 'ref', async () => 'rehearsed')
  assert.equal(value, 'rehearsed')
  assert.deepEqual(target.calls, [])
})

test('a refused rehearsal releases its funding and reports the original reason', async () => {
  const target = wallet()
  await assert.rejects(
    releaseOnFailure(target, 'ref', () => {
      throw new Error('Wallet changed the mandatory update output layout.')
    }),
    /mandatory update output layout/,
  )
  assert.deepEqual(target.calls, ['ref'])
})

test('a wallet that cannot abort does not mask the original reason', async () => {
  const target = wallet(async () => { throw new Error('wallet locked') })
  await assert.rejects(
    releaseOnFailure(target, 'ref', () => { throw new Error('verification failed') }),
    /verification failed/,
  )
  assert.deepEqual(target.calls, ['ref'])
})

test('a missing reference still propagates the original reason', async () => {
  const target = wallet()
  await assert.rejects(
    releaseOnFailure(target, undefined, () => { throw new Error('verification failed') }),
    /verification failed/,
  )
  assert.deepEqual(target.calls, [])
})
