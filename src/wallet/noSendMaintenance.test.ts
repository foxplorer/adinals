import assert from 'node:assert/strict'
import test from 'node:test'
import {
  reviewNoSendActions,
  SPEC_OP_NO_SEND_ACTIONS,
  type NoSendMaintenanceWallet,
} from './noSendMaintenance.ts'

const action = (txid: string, satoshis: number) => ({
  txid,
  satoshis,
  status: 'nosend' as const,
  isOutgoing: true,
  description: 'Rehearse Adinals collection',
  version: 1,
  lockTime: 0,
})

const wallet = (
  actions = [action('aa'.repeat(32), -1200), action('bb'.repeat(32), -909000)],
): NoSendMaintenanceWallet & { args: unknown[] } => {
  const args: unknown[] = []
  return {
    args,
    async listActions(received) {
      args.push(received)
      return { totalActions: actions.length, actions }
    },
  } as NoSendMaintenanceWallet & { args: unknown[] }
}

test('reviewing asks only for no-send actions and does not release them', async () => {
  const target = wallet()
  const summary = await reviewNoSendActions(target)
  assert.deepEqual(
    (target.args[0] as { labels: string[] }).labels,
    [SPEC_OP_NO_SEND_ACTIONS],
  )
  assert.equal(summary.totalActions, 2)
  assert.equal(summary.satoshis, 910_200)
})

test('releasing adds the abort label the wallet intercepts', async () => {
  const target = wallet()
  await reviewNoSendActions(target, { abort: true })
  assert.deepEqual(
    (target.args[0] as { labels: string[] }).labels,
    [SPEC_OP_NO_SEND_ACTIONS, 'abort'],
  )
})

test('a wallet with nothing reserved reports an empty release', async () => {
  const summary = await reviewNoSendActions(wallet([]), { abort: true })
  assert.equal(summary.totalActions, 0)
  assert.equal(summary.satoshis, 0)
  assert.deepEqual(summary.actions, [])
})

test('a wallet that rejects the reserved label surfaces its own error', async () => {
  const target: NoSendMaintenanceWallet = {
    async listActions() { throw new Error('unsupported label') },
  }
  await assert.rejects(reviewNoSendActions(target), /unsupported label/)
})
