import assert from 'node:assert/strict'
import test from 'node:test'
import { BigNumber, ECDSA, Hash, PrivateKey, ProtoWallet } from '@bsv/sdk'
import { readSigningConformance, summarizeSigningConformance } from './signingConformance.ts'

const protocolID = [1, 'adinals'] as const
const keyID = 'signing-conformance-probe'

test('a reference wallet signs the exact hash with the key it reports', async () => {
  const result = await readSigningConformance(
    new ProtoWallet(PrivateKey.fromRandom()),
    [...protocolID] as [1, string],
    keyID,
  )
  assert.equal(result.directHashHonoured, true)
  assert.equal(result.unexplained, false)
  assert.deepEqual(result.errors, [])
  assert.match(summarizeSigningConformance(result), /signs the exact hash/)
})

/** Stands in for a wallet that ignores `hashToDirectlySign` and signs the data. */
const ignoresSuppliedHash = (key: PrivateKey) => {
  const reference = new ProtoWallet(key)
  return {
    getPublicKey: reference.getPublicKey.bind(reference),
    async createSignature(args: { data?: number[]; hashToDirectlySign?: number[] }) {
      const derived = key
      const message = Hash.sha256(args.data ?? args.hashToDirectlySign ?? [])
      return { signature: ECDSA.sign(new BigNumber(message), derived, true).toDER() as number[] }
    },
  }
}

test('a wallet that signs a hash of the request is named as such', async () => {
  const key = PrivateKey.fromRandom()
  const result = await readSigningConformance(
    ignoresSuppliedHash(key) as never,
    [...protocolID] as [1, string],
    keyID,
  )
  assert.equal(result.directHashHonoured, false)
  assert.ok(result.errors.length > 0)
  assert.match(summarizeSigningConformance(result), /ignores a directly supplied hash|does not match/)
})

test('a wallet signing with an unrelated key is reported as unexplained', async () => {
  const reference = new ProtoWallet(PrivateKey.fromRandom())
  const stranger = PrivateKey.fromRandom()
  const wallet = {
    getPublicKey: reference.getPublicKey.bind(reference),
    async createSignature(args: { data?: number[]; hashToDirectlySign?: number[] }) {
      const message = args.hashToDirectlySign ?? Hash.sha256(args.data ?? [])
      return { signature: ECDSA.sign(new BigNumber(message), stranger, true).toDER() as number[] }
    },
  }
  const result = await readSigningConformance(wallet as never, [...protocolID] as [1, string], keyID)
  assert.equal(result.unexplained, true)
  assert.match(summarizeSigningConformance(result), /does not match the one it reported/)
})
