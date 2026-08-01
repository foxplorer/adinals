import assert from 'node:assert/strict'
import test from 'node:test'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import {
  classifyCustody,
  linkUpdateSiblings,
  parseCustodyRouting,
  type CustodyRouting,
  type OwnedCustodyOutput,
} from './custodyRouting.ts'

const protocolID = [1, ADINALS_NAMESPACE.keyProtocol]

const instructions = (extra: Record<string, unknown>): string =>
  JSON.stringify({ protocolID, counterparty: 'self', ...extra })

test('reads the collection writer routing, which names its key `keyID`', () => {
  const { routing, error } = parseCustodyRouting(
    instructions({ keyID: 'collection-owner-abc', protocol: 'adinals-v3', subType: 'collection' }),
  )
  assert.equal(error, '')
  assert.equal(routing?.ownerKeyID, 'collection-owner-abc')
  assert.equal(routing?.signerKeyID, '')
  assert.equal(classifyCustody(routing as CustodyRouting), 'collection')
})

test('reads the lifecycle writer routing, which separates owner and signer keys', () => {
  // A pre-fix mint's ordinal owner is deliberately not the creator's signing
  // key, so both must survive routing.
  const { routing, error } = parseCustodyRouting(
    instructions({
      ownerKeyID: 'mint-owner-abc',
      signerKeyID: 'collection-owner-abc',
      protocol: 'adinals-v3',
      subType: 'collectionItem',
    }),
  )
  assert.equal(error, '')
  assert.equal(routing?.ownerKeyID, 'mint-owner-abc')
  assert.equal(routing?.signerKeyID, 'collection-owner-abc')
  assert.equal(classifyCustody(routing as CustodyRouting), 'mint')
})

test('refuses routing from another key protocol or another party', () => {
  const foreignProtocol = JSON.stringify({
    protocolID: [1, 'someone elses protocol'],
    counterparty: 'self',
    keyID: 'k',
    protocol: 'adinals-v3',
    subType: 'collection',
  })
  assert.equal(parseCustodyRouting(foreignProtocol).routing, null)

  const counterpartyHeld = JSON.stringify({
    protocolID,
    counterparty: '02abc',
    keyID: 'k',
    protocol: 'adinals-v3',
    subType: 'collection',
  })
  assert.equal(parseCustodyRouting(counterpartyHeld).routing, null)

  assert.equal(parseCustodyRouting(undefined).routing, null)
  assert.equal(parseCustodyRouting('not json').routing, null)
  assert.equal(
    parseCustodyRouting(instructions({ keyID: 'k', protocol: 'someone-elses-v1' })).routing,
    null,
  )
})

test('separates the live state from the record that produced it', () => {
  const kinds: Array<[Record<string, unknown>, string | null]> = [
    [{ protocol: 'adinals-v3-state' }, 'state'],
    [{ protocol: 'adinals-v3-record' }, 'update'],
    [{ protocol: 'adinals-v3-listing' }, 'listing'],
    [{ protocol: 'adinals-v3', subType: 'collection' }, 'collection'],
    [{ protocol: 'adinals-v3', subType: 'collectionItem' }, 'mint'],
    [{ protocol: 'adinals-v3', subType: 'adDecision' }, 'decision'],
    [{ protocol: 'adinals-v3', subType: 'somethingElse' }, null],
  ]
  for (const [extra, expected] of kinds) {
    const { routing } = parseCustodyRouting(instructions({ keyID: 'k', ...extra }))
    assert.ok(routing, JSON.stringify(extra))
    assert.equal(classifyCustody(routing), expected, JSON.stringify(extra))
  }
})

const custodyOutput = (
  overrides: Partial<OwnedCustodyOutput> & Pick<OwnedCustodyOutput, 'kind' | 'txid' | 'vout'>,
): OwnedCustodyOutput => ({
  outpoint: `${overrides.txid}_${overrides.vout}`,
  walletOutpoint: `${overrides.txid}.${overrides.vout}`,
  satoshis: 1,
  ownerKeyID: 'owner-key',
  signerKeyID: '',
  derivedOwner: 'owner-address',
  scriptOwner: 'owner-address',
  signer: '',
  map: null,
  sigmaSource: '',
  stateOutpoint: '',
  recordOutpoint: '',
  listing: null,
  spendable: true,
  tags: [],
  atomicBeef: [],
  errors: [],
  verified: true,
  ...overrides,
})

test('pairs an update record with the live state in the same transaction', () => {
  // Both outputs land in the same basket. Unpaired they would read as two ads.
  const txid = 'a'.repeat(64)
  const outputs = [
    custodyOutput({ kind: 'state', txid, vout: 0 }),
    custodyOutput({ kind: 'update', txid, vout: 1 }),
  ]
  linkUpdateSiblings(outputs)
  assert.equal(outputs[0]?.recordOutpoint, `${txid}_1`)
  assert.equal(outputs[1]?.stateOutpoint, `${txid}_0`)
})

test('leaves a purchase state and a mint unpaired', () => {
  // A purchase writes a state with no record, and a mint's record *is* its
  // state, so neither should acquire a sibling.
  const purchaseTxid = 'b'.repeat(64)
  const mintTxid = 'c'.repeat(64)
  const outputs = [
    custodyOutput({ kind: 'state', txid: purchaseTxid, vout: 0 }),
    custodyOutput({ kind: 'mint', txid: mintTxid, vout: 0 }),
  ]
  linkUpdateSiblings(outputs)
  assert.equal(outputs[0]?.recordOutpoint, '')
  assert.equal(outputs[1]?.stateOutpoint, '')
})

test('does not pair outputs that merely share a kind across transactions', () => {
  const outputs = [
    custodyOutput({ kind: 'state', txid: 'd'.repeat(64), vout: 0 }),
    custodyOutput({ kind: 'update', txid: 'e'.repeat(64), vout: 1 }),
  ]
  linkUpdateSiblings(outputs)
  assert.equal(outputs[0]?.recordOutpoint, '')
  assert.equal(outputs[1]?.stateOutpoint, '')
})
