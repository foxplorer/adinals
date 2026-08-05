import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  BigNumber,
  P2PKH,
  PrivateKey,
  ProtoWallet,
  PublicKey,
  Script,
  Spend,
  Transaction,
  Utils,
  type CreateActionResult,
  type CreateSignatureArgs,
  type WalletProtocol,
} from '@bsv/sdk'
import {
  createAndCompleteNoSendAction,
  LostSignActionSessionError,
  signOrdLockCancelInput,
} from './actionSigning.ts'
import { ORDLOCK_CANCEL_UNLOCKING_SCRIPT_MAX } from '../protocol/ordLockLimits.ts'

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

const protocolID: WalletProtocol = [1, 'adinals cancel test']
const keyID = 'listing-owner'

/**
 * Rebuilds a listing under the mainnet OrdLock contract for a test key.
 *
 * The contract bytes are the ones a real Adinals listing was published under,
 * so a cancellation that satisfies this also satisfies the live marketplace.
 */
const ordLockListing = async (sellerAddress: string, priceSatoshis: number): Promise<Script> => {
  const contract = JSON.parse(await readFile(
    new URL('../../tests/fixtures/ordlock/mainnet-ordlock-contract.json', import.meta.url),
    'utf8',
  )) as { prefixHex: string; suffixHex: string }
  const payout = new Utils.Writer()
  const payoutScript = new P2PKH().lock(sellerAddress).toBinary()
  payout.writeUInt64LEBn(new BigNumber(priceSatoshis))
  payout.writeVarIntNum(payoutScript.length)
  payout.write(payoutScript)
  return new Script()
    .writeScript(Script.fromHex(contract.prefixHex))
    .writeBin(Utils.fromBase58Check(sellerAddress).data as number[])
    .writeBin(payout.toArray())
    .writeScript(Script.fromHex(contract.suffixHex))
}

const cancellationSpend = async (
  wallet: Pick<ProtoWallet, 'createSignature' | 'getPublicKey'>,
  sellerAddress: string,
): Promise<boolean> => {
  const listing = new Transaction()
  listing.addInput({
    sourceTXID: '00'.repeat(32),
    sourceOutputIndex: 0,
    unlockingScript: new Script(),
    sequence: 0xffffffff,
  })
  listing.addOutput({ lockingScript: await ordLockListing(sellerAddress, 1_000_000), satoshis: 1 })

  // The wallet funds its own fee, so the cancellation is never a single-input
  // transaction in production.
  const funding = new Transaction()
  funding.addInput({
    sourceTXID: '11'.repeat(32),
    sourceOutputIndex: 0,
    unlockingScript: new Script(),
    sequence: 0xffffffff,
  })
  funding.addOutput({ lockingScript: new P2PKH().lock(sellerAddress), satoshis: 5_000 })

  const cancellation = new Transaction()
  cancellation.addInput({ sourceTransaction: listing, sourceOutputIndex: 0, sequence: 0xffffffff })
  cancellation.addInput({ sourceTransaction: funding, sourceOutputIndex: 0, sequence: 0xffffffff })
  cancellation.addOutput({ lockingScript: new P2PKH().lock(sellerAddress), satoshis: 1 })
  cancellation.addOutput({ lockingScript: new P2PKH().lock(sellerAddress), satoshis: 4_900 })

  const unlockingScript = Script.fromHex(
    await signOrdLockCancelInput(wallet as never, cancellation, 0, protocolID, keyID),
  )
  assert.ok(
    unlockingScript.toBinary().length <= ORDLOCK_CANCEL_UNLOCKING_SCRIPT_MAX,
    'the reserved unlocking script length must cover the signed script',
  )
  cancellation.inputs[0]!.unlockingScript = unlockingScript
  return new Spend({
    sourceTXID: listing.id('hex'),
    sourceOutputIndex: 0,
    lockingScript: listing.outputs[0]!.lockingScript,
    sourceSatoshis: 1,
    transactionVersion: cancellation.version,
    otherInputs: cancellation.inputs.slice(1),
    unlockingScript,
    inputSequence: 0xffffffff,
    inputIndex: 0,
    outputs: cancellation.outputs,
    lockTime: cancellation.lockTime,
  }).validate()
}

test('a cancellation satisfies the mainnet OrdLock contract', async () => {
  const wallet = new ProtoWallet(PrivateKey.fromRandom())
  const { publicKey } = await wallet.getPublicKey({
    protocolID,
    keyID,
    counterparty: 'self',
    forSelf: true,
  })
  assert.equal(await cancellationSpend(wallet, PublicKey.fromString(publicKey).toAddress()), true)
})

/**
 * The failure this guards against: `OrdLock.cancelWithWallet` sends the sighash
 * preimage as `data` next to `hashToDirectlySign`. Those two are alternatives,
 * so a wallet that prefers `data` signs a single SHA-256 where a Bitcoin sighash
 * needs the double hash, and the cancellation dies at OP_CHECKSIG with a
 * correct public key on the stack.
 */
test('a cancellation never sends signing data a wallet could prefer', async () => {
  const wallet = new ProtoWallet(PrivateKey.fromRandom())
  const { publicKey } = await wallet.getPublicKey({
    protocolID,
    keyID,
    counterparty: 'self',
    forSelf: true,
  })
  const requests: CreateSignatureArgs[] = []
  const dataPreferring = {
    getPublicKey: wallet.getPublicKey.bind(wallet),
    createSignature: async (args: CreateSignatureArgs) => {
      requests.push(args)
      return wallet.createSignature(
        args.data ? { ...args, hashToDirectlySign: undefined } : args,
      )
    },
  }

  assert.equal(
    await cancellationSpend(dataPreferring, PublicKey.fromString(publicKey).toAddress()),
    true,
  )
  assert.equal(requests.length, 1)
  assert.equal(requests[0]?.data, undefined)
  assert.equal(requests[0]?.hashToDirectlySign?.length, 32)
})
