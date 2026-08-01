import assert from 'node:assert/strict'
import test from 'node:test'
import { abortLifecycleRehearsal, classifyLifecycleActions } from './lifecycleInventory.ts'

const anchorTxid = 'a'.repeat(64)
const mintTxid = 'b'.repeat(64)

test('inventory pairs an exact mint input with its no-send anchor', () => {
  const inventory = classifyLifecycleActions([
    { txid: anchorTxid, status: 'nosend', description: 'Prepare Adinals mint fee reserve (unused value returns)', inputs: [] },
    {
      txid: mintTxid,
      status: 'nosend',
      description: 'Rehearse Adinals ad mint',
      inputs: [{ sourceOutpoint: `${anchorTxid}.0` }],
    },
  ] as never, new Date('2026-07-31T16:00:00.000Z'))
  assert.equal(inventory.pairs.length, 1)
  assert.equal(inventory.pairs[0]?.child.kind, 'mint')
  assert.equal(inventory.pairs[0]?.anchor?.txid, anchorTxid)
  assert.equal(inventory.unpairedAnchors.length, 0)
})

test('inventory never presents a collection anchor as an orphaned lifecycle anchor', () => {
  const collectionAnchor = 'c'.repeat(64)
  const inventory = classifyLifecycleActions([
    { txid: collectionAnchor, status: 'nosend', description: 'Prepare Adinals SIGMA anchor', inputs: [] },
  ] as never)
  assert.equal(inventory.unpairedAnchors.length, 0)
  assert.equal(inventory.otherActions[0]?.txid, collectionAnchor)
})

test('abort releases child before parent and refuses missing capabilities', async () => {
  const calls: string[] = []
  const wallet = {
    listActions: async () => ({ totalActions: 0, actions: [] }),
    abortAction: async ({ reference }: { reference: string }) => {
      calls.push(reference)
      return { aborted: true }
    },
  }
  await abortLifecycleRehearsal(wallet as never, {
    status: 'rehearsed', broadcast: false, kind: 'mint', txid: mintTxid, outpoint: `${mintTxid}_0`,
    rawtx: '', atomicBeef: [], basket: 'test', protocolID: [1, 'test'], ownerKeyID: 'owner',
    ownerAddress: 'owner', verifierRevision: 'brc100-r7-raw-sigma', actionReference: 'child', anchorReference: 'anchor',
  })
  assert.deepEqual(calls, ['child', 'anchor'])
  await assert.rejects(() => abortLifecycleRehearsal(wallet as never, {
    status: 'rehearsed', broadcast: false, kind: 'mint', txid: mintTxid, outpoint: `${mintTxid}_0`,
    rawtx: '', atomicBeef: [], basket: 'test', protocolID: [1, 'test'], ownerKeyID: 'owner',
    ownerAddress: 'owner', verifierRevision: 'brc100-r7-raw-sigma',
  }), /no retained wallet abort reference/)
})
