import assert from 'node:assert/strict'
import test from 'node:test'
import { buildActionFixture } from './actionFixture.ts'

test('exported fixtures never disclose wallet-local abort references', () => {
  const fixture = buildActionFixture({
    status: 'rehearsed', broadcast: false, kind: 'mint', txid: 'a'.repeat(64), outpoint: `${'a'.repeat(64)}_0`,
    rawtx: '', atomicBeef: [], basket: 'test', protocolID: [1, 'test'], ownerKeyID: 'owner',
    ownerAddress: 'owner', verifierRevision: 'brc100-r7-raw-sigma', actionReference: 'child-secret',
    anchorReference: 'parent-secret',
  }, { walletVersion: 'test-wallet' }) as Record<string, unknown>
  assert.equal('actionReference' in fixture, false)
  assert.equal('anchorReference' in fixture, false)
  assert.equal(JSON.stringify(fixture).includes('child-secret'), false)
  assert.equal(JSON.stringify(fixture).includes('parent-secret'), false)
})
