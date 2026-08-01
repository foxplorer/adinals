import { readFile } from 'node:fs/promises'
import { Inscription, OrdLock } from '@1sat/templates'
import {
  Beef,
  ECDSA,
  BigNumber,
  Hash,
  P2PKH,
  PrivateKey,
  Script,
  Spend,
  Transaction,
  Utils,
  type CreateSignatureArgs,
  type GetPublicKeyArgs,
} from '@bsv/sdk'
import { buildCollectionMap } from '../src/protocol/collectionMetadata.ts'
import { findUnresolvedBeefDependencies } from '../src/protocol/beefValidation.ts'
import { findByteIdenticalOneSatOutputs } from '../src/protocol/transactionChecks.ts'
import {
  parseProtocolOutpoint,
  validateOwnerInputZero,
  validateSpendLinkedRecord,
} from '../src/protocol/transitions.ts'
import {
  appendWalletSigma,
  buildUnsignedCollectionScript,
  decodeMapSet,
  extractUnsignedSigmaScript,
  inspectSigmaSuffix,
  verifyCollectionScript,
} from '../src/protocol/collectionScript.ts'
import { readOwnedCustody } from '../src/readers/ownedCustody.ts'

// Deterministic so an intermittent DER/public-key shape cannot turn this
// byte-layout regression test into a random test vector.
const key = PrivateKey.fromString('1'.padStart(64, '0'), 'hex')
const wallet = {
  async createSignature(args: CreateSignatureArgs) {
    if (!args.hashToDirectlySign) throw new Error('Missing direct hash')
    return { signature: ECDSA.sign(new BigNumber(args.hashToDirectlySign), key, true).toDER() as number[] }
  },
  async getPublicKey(_args: GetPublicKeyArgs) {
    return { publicKey: key.toPublicKey().toString() }
  },
}
const outpoint = { txid: '11'.repeat(32), vout: 0 }

async function verifyVector(
  name: string,
  description: string,
  cover?: { data: Uint8Array; type: string },
) {
  const input = cover
    ? {
        name,
        description,
        maxSupply: 2,
        approval: 'creator' as const,
        format: 'image' as const,
        cover,
      }
    : {
        name,
        description,
        maxSupply: 2,
        approval: 'creator' as const,
        format: 'text' as const,
        maxChars: 280,
      }
  const map = buildCollectionMap(input, {
    app: 'adinals-brc100-test',
    now: new Date('2026-07-30T20:00:00.000Z'),
  })
  const unsigned = buildUnsignedCollectionScript(key.toPublicKey().toString(), map, input)
  const signed = await appendWalletSigma(
    wallet as never,
    unsigned,
    outpoint,
    [1, 'adinals brc100 test'],
    'self-test',
  )
  const inspection = inspectSigmaSuffix(signed)
  if (inspection.index < 1) throw new Error(`${name}: raw SIGMA suffix inspection failed`)
  const serialized = Script.fromHex(signed.toHex())
  if (inspectSigmaSuffix(serialized).index < 1) {
    throw new Error(`${name}: serialized SIGMA suffix inspection failed`)
  }
  const verification = verifyCollectionScript(serialized, unsigned, outpoint, map)
  if (!verification.valid) throw new Error(`${name}: ${verification.errors.join('; ')}`)
  return verification
}

const ordinary = await verifyVector('Script self-test', 'Local deterministic structure check')
const collision = await verifyVector('SIGMA', 'SIGMA')
const largeImage = await verifyVector(
  'Image script self-test',
  'Large PUSHDATA2 cover followed by MAP and SIGMA',
  {
    data: Uint8Array.from({ length: 2323 }, (_, index) => index % 251),
    type: 'image/png',
  },
)

type StoredCollectionFixture = {
  format: string
  broadcast: boolean
  txid: string
  outpoint: string
  stateOutpoint?: string
  anchorTxid: string
  rawtx: string
  atomicBeef: { encoding: string; bytes: number; sha256: string; data: string }
  map: Record<string, string>
  verification: { signerPublicKey: string }
}

async function verifyStoredFixture(filename: string, label: string) {
  const fixture = JSON.parse(await readFile(
    new URL(`../tests/fixtures/collections/${filename}`, import.meta.url),
    'utf8',
  )) as StoredCollectionFixture
  if (fixture.format !== 'adinals-brc100-collection-fixture-v1' || !fixture.broadcast) {
    throw new Error(`${label} fixture header is invalid`)
  }
  const fixtureBeefBytes = Utils.toArray(fixture.atomicBeef.data, 'base64')
  if (fixtureBeefBytes.length !== fixture.atomicBeef.bytes) throw new Error(`${label} fixture BEEF length mismatch`)
  if (Utils.toHex(Hash.sha256(fixtureBeefBytes)) !== fixture.atomicBeef.sha256) {
    throw new Error(`${label} fixture BEEF hash mismatch`)
  }
  const fixtureBeef = Beef.fromBinary(fixtureBeefBytes)
  if (findUnresolvedBeefDependencies(fixtureBeef).length) {
    throw new Error(`${label} fixture contains unresolved dependencies`)
  }
  const fixtureTransaction = Transaction.fromAtomicBEEF(fixtureBeefBytes)
  if (fixtureTransaction.id('hex') !== fixture.txid || fixtureTransaction.toHex() !== fixture.rawtx) {
    throw new Error(`${label} fixture subject transaction mismatch`)
  }
  const fixtureVout = Number(fixture.outpoint.split('_').at(-1))
  const fixtureOutput = fixtureTransaction.outputs[fixtureVout]
  if (!fixtureOutput) throw new Error(`${label} fixture output is missing`)
  const fixtureInscription = Inscription.decode(fixtureOutput.lockingScript)
  const fixtureMap = decodeMapSet(fixtureOutput.lockingScript)
  const fixtureUnsigned = extractUnsignedSigmaScript(fixtureOutput.lockingScript)
  if (!fixtureInscription || !fixtureMap || !fixtureUnsigned) {
    throw new Error(`${label} fixture protocol frame is incomplete`)
  }
  const fixtureAnchor = fixtureTransaction.inputs[0]
  if (!fixtureAnchor) throw new Error(`${label} fixture anchor input is missing`)
  const fixtureAnchorTxid = fixtureAnchor.sourceTXID ?? fixtureAnchor.sourceTransaction?.id('hex') ?? ''
  if (fixtureAnchorTxid !== fixture.anchorTxid) throw new Error(`${label} fixture anchor mismatch`)
  const fixtureVerification = verifyCollectionScript(
    fixtureOutput.lockingScript,
    fixtureUnsigned,
    { txid: fixtureAnchorTxid, vout: fixtureAnchor.sourceOutputIndex },
    fixture.map as never,
  )
  if (!fixtureVerification.valid) throw new Error(`${label} fixture: ${fixtureVerification.errors.join('; ')}`)
  if (fixtureVerification.signerPublicKey !== fixture.verification.signerPublicKey) {
    throw new Error(`${label} fixture recovered signer mismatch`)
  }
  const fixtureCanonical = buildUnsignedCollectionScript(
    fixtureVerification.signerPublicKey,
    fixture.map as never,
    {
      name: fixture.map.name,
      cover: {
        data: Uint8Array.from(fixtureInscription.file.content),
        type: fixtureInscription.file.type,
      },
    },
  )
  if (fixtureCanonical.toHex() !== fixtureUnsigned.toHex()) throw new Error(`${label} fixture is not canonical`)
  return {
    fixture,
    fixtureBeefBytes,
    fixtureBeef,
    fixtureTransaction,
    fixtureOutput,
    fixtureInscription,
    fixtureUnsigned,
    fixtureAnchor,
    fixtureAnchorTxid,
    fixtureVerification,
  }
}

const {
  fixture,
  fixtureBeef,
  fixtureTransaction,
  fixtureOutput,
  fixtureInscription,
  fixtureUnsigned,
  fixtureAnchor,
  fixtureAnchorTxid,
  fixtureVerification,
} = await verifyStoredFixture('published-mainnet-yours-446af364.json', 'Published mainnet')

type StoredActionFixture = {
  format: string
  walletVersion: string
  kind: string
  broadcast: boolean
  txid: string
  outpoint: string
  anchorTxid?: string
  ownerAddress: string
  rawtx: string
  atomicBeef: { encoding: string; bytes: number; sha256: string; data: string }
  map?: Record<string, string>
}

async function verifyActionFixture(filename: string) {
  const action = JSON.parse(await readFile(filename, 'utf8')) as StoredActionFixture
  if (
    action.format !== 'adinals-brc100-action-fixture-v1' ||
    action.broadcast ||
    (action.kind !== 'mint' && action.kind !== 'update' && action.kind !== 'decision' && action.kind !== 'listing' && action.kind !== 'purchase')
  ) {
    throw new Error('Action fixture header is invalid')
  }
  if (action.kind !== 'listing' && action.kind !== 'purchase' && !action.map) throw new Error('Action fixture is missing MAP')
  const bytes = Utils.toArray(action.atomicBeef.data, 'base64')
  if (bytes.length !== action.atomicBeef.bytes) throw new Error('Action fixture BEEF length mismatch')
  if (Utils.toHex(Hash.sha256(bytes)) !== action.atomicBeef.sha256) throw new Error('Action fixture BEEF hash mismatch')
  const beef = Beef.fromBinary(bytes)
  if (findUnresolvedBeefDependencies(beef).length) throw new Error('Action fixture contains unresolved dependencies')
  const transaction = Transaction.fromAtomicBEEF(bytes)
  if (transaction.id('hex') !== action.txid || transaction.toHex() !== action.rawtx) {
    throw new Error('Action fixture subject transaction mismatch')
  }
  const outputIndex = Number(action.outpoint.split('_').at(-1))
  const output = transaction.outputs[outputIndex]
  const input = transaction.inputs[0]
  if (!output || output.satoshis !== 1 || !input) throw new Error('Action fixture ordinal layout is invalid')
  const inputTxid = input.sourceTXID ?? input.sourceTransaction?.id('hex') ?? ''
  if (action.kind === 'purchase') {
    const sourceTransaction = beef.findAtomicTransaction(inputTxid)
    const listingOutput = sourceTransaction?.outputs[input.sourceOutputIndex]
    if (!sourceTransaction || !listingOutput) throw new Error('Purchase listing source is absent from Atomic BEEF')
    const terms = OrdLock.decode(listingOutput.lockingScript)
    if (!terms || !input.unlockingScript || !OrdLock.isPurchase(input.unlockingScript)) {
      throw new Error('Purchase input is not the OrdLock purchase path')
    }
    const spend = new Spend({
      sourceTXID: inputTxid,
      sourceOutputIndex: input.sourceOutputIndex,
      lockingScript: listingOutput.lockingScript,
      sourceSatoshis: listingOutput.satoshis ?? 0,
      transactionVersion: transaction.version,
      otherInputs: transaction.inputs.slice(1).map((other) => ({
        sourceTXID: other.sourceTXID as string,
        sourceOutputIndex: other.sourceOutputIndex,
        sequence: other.sequence ?? 0xffffffff,
      })),
      unlockingScript: input.unlockingScript,
      inputSequence: input.sequence ?? 0xffffffff,
      inputIndex: 0,
      outputs: transaction.outputs,
      lockTime: transaction.lockTime,
    })
    if (!spend.validate()) throw new Error('OrdLock purchase script execution failed')
    if (output.lockingScript.toHex() !== new P2PKH().lock(action.ownerAddress).toHex()) {
      throw new Error('Purchase output 0 does not pay the fixture buyer')
    }
    const payoutReader = new Utils.Reader(terms.payout)
    const payoutSatoshis = Number(payoutReader.readUInt64LEBn().toString())
    const payoutScript = Script.fromBinary(payoutReader.read(payoutReader.readVarIntNum()))
    const payoutOutput = transaction.outputs[1]
    if (!payoutOutput || payoutOutput.satoshis !== payoutSatoshis || payoutOutput.lockingScript.toHex() !== payoutScript.toHex()) {
      throw new Error('Purchase output 1 does not reproduce the encoded seller payout')
    }
    return {
      kind: action.kind,
      walletVersion: action.walletVersion,
      txid: action.txid,
      listingOutpoint: `${inputTxid}_${input.sourceOutputIndex}`,
      buyerAddress: action.ownerAddress,
      sellerAddress: terms.seller,
      payoutSatoshis,
      beefTransactions: beef.txs.length,
    }
  }
  if (action.kind === 'listing') {
    const sourceTransaction = beef.findAtomicTransaction(inputTxid)
    if (!sourceTransaction) throw new Error('Listing source is absent from Atomic BEEF')
    const sourceOutpoint = `${inputTxid}_${input.sourceOutputIndex}`
    const ownerProof = validateOwnerInputZero(transaction, sourceTransaction, sourceOutpoint)
    if (ownerProof.error || ownerProof.owner !== action.ownerAddress) {
      throw new Error(`Listing owner authorization failed: ${ownerProof.error || 'owner mismatch'}`)
    }
    const terms = OrdLock.decode(output.lockingScript)
    if (!terms || terms.seller !== action.ownerAddress) throw new Error('Listing OrdLock seller mismatch')
    const payoutReader = new Utils.Reader(terms.payout)
    const payoutSatoshis = Number(payoutReader.readUInt64LEBn().toString())
    const payoutScript = Script.fromBinary(payoutReader.read(payoutReader.readVarIntNum()))
    if (!Number.isSafeInteger(payoutSatoshis) || payoutSatoshis < 1) throw new Error('Listing payout amount is invalid')
    if (payoutScript.toHex() !== new P2PKH().lock(action.ownerAddress).toHex()) {
      throw new Error('Listing payout script does not pay the fixture owner')
    }
    return {
      kind: action.kind,
      walletVersion: action.walletVersion,
      txid: action.txid,
      sourceOutpoint,
      ownerAddress: action.ownerAddress,
      payoutSatoshis,
      beefTransactions: beef.txs.length,
    }
  }
  const actionMap = action.map as Record<string, string>
  let transitionOwner = ''
  if (action.kind === 'mint' || action.kind === 'decision') {
    if (!action.anchorTxid) throw new Error(`${action.kind} fixture is missing its anchor`)
    if (!beef.findAtomicTransaction(action.anchorTxid)) throw new Error('Action fixture anchor is absent from Atomic BEEF')
    if (inputTxid !== action.anchorTxid || input.sourceOutputIndex !== 0) throw new Error('Action fixture spends the wrong anchor')
    if (action.kind === 'decision') {
      const update = parseProtocolOutpoint(actionMap.updateOutpoint ?? '')
      const state = parseProtocolOutpoint(actionMap.adOutpoint ?? '')
      const revision = parseProtocolOutpoint(actionMap.revisionOutpoint ?? '')
      if (!update || update.vout !== 1 || !state || state.vout !== 0 || update.txid !== state.txid) {
        throw new Error('Decision fixture does not reference sibling update/state outputs')
      }
      if (!revision || revision.normalized !== update.normalized || actionMap.transitionTxid !== update.txid) {
        throw new Error('Decision fixture transition aliases are inconsistent')
      }
      if (actionMap.decision !== 'approved' && actionMap.decision !== 'disapproved') {
        throw new Error('Decision fixture verdict is invalid')
      }
    }
  } else {
    const predecessor = parseProtocolOutpoint(actionMap.adOutpoint ?? '')
    if (!predecessor) throw new Error('Update fixture predecessor outpoint is invalid')
    const predecessorTransaction = beef.findAtomicTransaction(predecessor.txid)
    if (!predecessorTransaction) throw new Error('Update fixture predecessor is absent from Atomic BEEF')
    const proof = validateSpendLinkedRecord(transaction, predecessorTransaction, predecessor.normalized, action.outpoint)
    if (proof.error) throw new Error(`Update transition: ${proof.error}`)
    if (proof.successorOutpoint !== action.stateOutpoint) throw new Error('Update fixture successor outpoint mismatch')
    if (proof.owner !== action.ownerAddress) throw new Error('Update transition owner mismatch')
    transitionOwner = proof.owner
  }
  const inscription = Inscription.decode(output.lockingScript)
  const decodedMap = decodeMapSet(output.lockingScript)
  const unsigned = extractUnsignedSigmaScript(output.lockingScript)
  if (!inscription || !decodedMap || !unsigned) throw new Error('Action fixture protocol frame is incomplete')
  const verification = verifyCollectionScript(
    output.lockingScript,
    unsigned,
    { txid: inputTxid, vout: input.sourceOutputIndex },
    actionMap as never,
  )
  if (!verification.valid) throw new Error(`Action fixture: ${verification.errors.join('; ')}`)
  const suffix = new Script()
  for (const chunk of new P2PKH().lock(action.ownerAddress).chunks) suffix.chunks.push(chunk)
  for (const chunk of MAPTemplate.set(actionMap).chunks) suffix.chunks.push(chunk)
  const canonical = new Script(Inscription.create(
    Uint8Array.from(inscription.file.content),
    inscription.file.type,
    { scriptSuffix: suffix },
  ).lock().chunks)
  if (canonical.toHex() !== unsigned.toHex()) throw new Error('Action fixture unsigned record is not canonical')
  return {
    kind: action.kind,
    walletVersion: action.walletVersion,
    txid: action.txid,
    anchorTxid: action.anchorTxid,
    ...(action.stateOutpoint && { stateOutpoint: action.stateOutpoint }),
    signerAddress: verification.signerAddress,
    ownerAddress: action.ownerAddress,
    ...(transitionOwner && { transitionOwner }),
    contentType: verification.contentType,
    contentBytes: verification.contentBytes,
    beefTransactions: beef.txs.length,
  }
}

const externalActionFixture = process.argv[2]
  ? await verifyActionFixture(process.argv[2])
  : null

const findBytes = (haystack: number[], needle: number[]): number => {
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((byte, offset) => haystack[index + offset] === byte)) return index
  }
  return -1
}
const negativeVectors: string[] = []
const expectInvalidScript = (
  name: string,
  script: Script,
  sigmaInput = { txid: fixtureAnchorTxid, vout: fixtureAnchor.sourceOutputIndex },
) => {
  const verification = verifyCollectionScript(
    script,
    fixtureUnsigned,
    sigmaInput,
    fixture.map as never,
  )
  if (verification.valid) throw new Error(`${name} negative vector was accepted`)
  negativeVectors.push(name)
}

const fixtureScriptBytes = fixtureOutput.lockingScript.toBinary()
const sigmaPrefix = Utils.toArray('017c055349474d410342534d', 'hex')
const sigmaStart = findBytes(fixtureScriptBytes, sigmaPrefix)
if (sigmaStart < 0) throw new Error('Published fixture SIGMA prefix is unavailable')

const flippedSignature = [...fixtureScriptBytes]
const compactSignatureStart = sigmaStart + 48
flippedSignature[compactSignatureStart] = (flippedSignature[compactSignatureStart] as number) ^ 0x01
expectInvalidScript('flipped-compact-signature', Script.fromBinary(flippedSignature))

expectInvalidScript('wrong-anchor-txid', fixtureOutput.lockingScript, {
  txid: '00'.repeat(32),
  vout: fixtureAnchor.sourceOutputIndex,
})
expectInvalidScript('wrong-anchor-vout', fixtureOutput.lockingScript, {
  txid: fixtureAnchorTxid,
  vout: fixtureAnchor.sourceOutputIndex + 1,
})

const changedMap = [...fixtureScriptBytes]
const mapNeedle = Utils.toArray('0561644d61780133', 'hex')
const mapValueStart = findBytes(changedMap, mapNeedle)
if (mapValueStart < 0) throw new Error('Published fixture adMax field is unavailable')
changedMap[mapValueStart + mapNeedle.length - 1] = 0x34
expectInvalidScript('changed-map-after-signing', Script.fromBinary(changedMap))

expectInvalidScript('removed-sigma-suffix', Script.fromBinary(fixtureScriptBytes.slice(0, sigmaStart)))

const changedOwner = [...fixtureScriptBytes]
const ownerP2PKH = new P2PKH().lock(fixtureVerification.signerAddress).toBinary()
const ownerStart = findBytes(changedOwner, ownerP2PKH)
if (ownerStart < 0) throw new Error('Published fixture owner P2PKH is unavailable')
changedOwner[ownerStart + 3] = (changedOwner[ownerStart + 3] as number) ^ 0x01
expectInvalidScript('changed-owner-after-signing', Script.fromBinary(changedOwner))

const duplicateOutputTransaction = Transaction.fromHex(fixture.rawtx)
duplicateOutputTransaction.outputs.push({
  satoshis: fixtureOutput.satoshis,
  lockingScript: Script.fromHex(fixtureOutput.lockingScript.toHex()),
})
if (findByteIdenticalOneSatOutputs(duplicateOutputTransaction, fixtureOutput.lockingScript).length !== 2) {
  throw new Error('duplicate-output negative vector was accepted')
}
negativeVectors.push('duplicate-byte-identical-output')

let genericBeefAccepted = false
try {
  Transaction.fromAtomicBEEF(fixtureBeef.toBinary())
  genericBeefAccepted = true
} catch {
  // Expected: a generic BEEF lacks the BRC-95 subject prefix.
}
if (genericBeefAccepted) throw new Error('non-atomic BEEF negative vector was accepted')
negativeVectors.push('non-atomic-beef')

const partialBeef = new Beef()
partialBeef.mergeRawTx(Utils.toArray(fixture.rawtx, 'hex'))
const partialAtomic = Beef.fromBinary(partialBeef.toBinaryAtomic(fixture.txid))
if (!findUnresolvedBeefDependencies(partialAtomic).includes(fixtureAnchorTxid)) {
  throw new Error('partial BEEF negative vector was accepted')
}
negativeVectors.push('partial-beef-missing-anchor')

if (fixtureTransaction.id('hex') === 'ff'.repeat(32)) throw new Error('reported-txid mismatch vector was accepted')
negativeVectors.push('reported-txid-mismatch')

// ---------------------------------------------------------------------------
// Ownership parity: the live collection must be discoverable as *mine* from
// wallet custody alone. The raw-key reader compared one permanent ordAddress;
// here the basket output's routing key is derived and the script rebuilt from
// it, so no fixed address is assumed anywhere.
// ---------------------------------------------------------------------------

/** Stands in for a connected wallet holding exactly the retained fixture. */
const custodyWalletFor = (fixture: {
  txid: string
  outpoint: string
  atomicBeef: { data: string }
  verification: { signerPublicKey: string }
}, routing: Record<string, unknown>) => ({
  async listOutputs() {
    return {
      totalOutputs: 1,
      BEEF: Utils.toArray(fixture.atomicBeef.data, 'base64'),
      outputs: [{
        outpoint: `${fixture.txid}.${Number(fixture.outpoint.split('_').at(-1))}`,
        satoshis: 1,
        spendable: true,
        customInstructions: JSON.stringify({
          protocolID: [1, 'adinals brc100 test'],
          counterparty: 'self',
          ...routing,
        }),
        tags: ['app:adinals-brc100-test'],
      }],
    }
  },
  async getPublicKey() {
    return { publicKey: fixture.verification.signerPublicKey }
  },
})

const yoursCollectionCustody = await readOwnedCustody(
  custodyWalletFor(fixture, {
    keyID: 'collection-owner-live',
    protocol: 'adinals-v3',
    subType: 'collection',
  }) as never,
  'adinals brc100 test',
)
const custodiedCollection = yoursCollectionCustody.outputs[0]
if (yoursCollectionCustody.outputs.length !== 1 || !custodiedCollection) {
  throw new Error('live collection custody vector returned no interpretable output')
}
if (custodiedCollection.kind !== 'collection' || !custodiedCollection.verified) {
  throw new Error(`live collection custody vector failed: ${custodiedCollection.errors.join('; ')}`)
}
if (custodiedCollection.outpoint !== fixture.outpoint) {
  throw new Error('live collection custody vector resolved the wrong outpoint')
}

// A wallet that cannot derive the routing key must not claim the record, even
// though the transaction bytes and SIGMA signature are entirely valid.
const foreignCustody = await readOwnedCustody(
  {
    ...custodyWalletFor(fixture, {
      keyID: 'collection-owner-live',
      protocol: 'adinals-v3',
      subType: 'collection',
    }),
    async getPublicKey() {
      return { publicKey: key.toPublicKey().toString() }
    },
  } as never,
  'adinals brc100 test',
)
if (foreignCustody.outputs[0]?.verified !== false) {
  throw new Error('custody was granted to a wallet that does not derive the owner key')
}

// A basket output routed under another application's key protocol is not this
// application's record, and must be left uninterpreted rather than claimed.
const foreignProtocolWallet = custodyWalletFor(fixture, {
  keyID: 'collection-owner-live',
  protocol: 'adinals-v3',
  subType: 'collection',
})
const foreignProtocolCustody = await readOwnedCustody(
  {
    ...foreignProtocolWallet,
    async listOutputs() {
      const result = await foreignProtocolWallet.listOutputs()
      const output = result.outputs[0]!
      const instructions = JSON.parse(output.customInstructions) as Record<string, unknown>
      instructions.protocolID = [1, 'someone elses protocol']
      return { ...result, outputs: [{ ...output, customInstructions: JSON.stringify(instructions) }] }
    },
  } as never,
  'adinals brc100 test',
)
if (foreignProtocolCustody.outputs.length !== 0 || foreignProtocolCustody.unrecognized !== 1) {
  throw new Error('a foreign key protocol was interpreted as an Adinals record')
}

console.log(JSON.stringify({
  ordinary: ordinary.valid,
  literalSigmaContent: collision.valid,
  largeImageMapAndSigma: largeImage.valid,
  publishedMainnetFixture: fixtureVerification.valid,
  publishedMainnetBeefTransactions: fixtureBeef.txs.length,
  liveCollectionOwnedFromCustody: custodiedCollection.verified,
  liveCollectionOwner: custodiedCollection.derivedOwner,
  custodyDeniedToNonDerivingWallet: foreignCustody.outputs[0]?.verified === false,
  custodyDeniedToForeignProtocol: foreignProtocolCustody.unrecognized === 1,
  negativeVectors,
  signerAddress: ordinary.signerAddress,
  contentType: ordinary.contentType,
  contentBytes: ordinary.contentBytes,
  ...(externalActionFixture && { actionFixture: externalActionFixture }),
}))
