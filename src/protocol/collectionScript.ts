import { Inscription, MAP as MAPTemplate, MAP_PREFIX } from '@1sat/templates'
import {
  BSM,
  BigNumber,
  Hash,
  OP,
  P2PKH,
  PublicKey,
  Script,
  Signature,
  Utils,
  type WalletInterface,
  type WalletProtocol,
} from '@bsv/sdk'
import type { AdinalsCollectionMap, CreateCollectionInput } from './collectionMetadata.ts'

export const COLLECTION_VERIFIER_REVISION = 'brc100-r7-raw-sigma' as const

export type SigmaInput = { txid: string; vout: number }

const uint32LE = (value: number): number[] => [
  value & 0xff,
  (value >> 8) & 0xff,
  (value >> 16) & 0xff,
  (value >> 24) & 0xff,
]

const sigmaMessageHash = (lockingScript: Script, input: SigmaInput): number[] => {
  if (!/^[0-9a-f]{64}$/i.test(input.txid) || !Number.isSafeInteger(input.vout) || input.vout < 0) {
    throw new Error('SIGMA requires a valid transaction outpoint.')
  }
  const inputHash = Hash.sha256([
    ...Utils.toArray(input.txid, 'hex'),
    ...uint32LE(input.vout),
  ])
  const dataHash = Hash.sha256(lockingScript.toBinary())
  return Hash.sha256([...inputHash, ...dataHash])
}

export function buildUnsignedCollectionScript(
  ownerPublicKey: string,
  map: AdinalsCollectionMap,
  input: Pick<CreateCollectionInput, 'name' | 'cover'>,
): Script {
  const ownerAddress = PublicKey.fromString(ownerPublicKey).toAddress()
  const suffix = new Script()
  for (const chunk of new P2PKH().lock(ownerAddress).chunks) suffix.chunks.push(chunk)
  for (const chunk of MAPTemplate.set(map).chunks) suffix.chunks.push(chunk)

  const content = input.cover ?? {
    data: new TextEncoder().encode(input.name.trim()),
    type: 'text/plain;charset=utf-8',
  }
  return new Script(
    Inscription.create(content.data, content.type, { scriptSuffix: suffix }).lock().chunks,
  )
}

export async function appendWalletSigma(
  wallet: WalletInterface,
  lockingScript: Script,
  input: SigmaInput,
  protocolID: WalletProtocol,
  keyID: string,
): Promise<Script> {
  const messageHash = sigmaMessageHash(lockingScript, input)
  const bsmHash = BSM.magicHash(messageHash)
  const [{ signature }, { publicKey }] = await Promise.all([
    wallet.createSignature({
      protocolID,
      keyID,
      counterparty: 'self',
      hashToDirectlySign: bsmHash,
    }),
    wallet.getPublicKey({
      protocolID,
      keyID,
      counterparty: 'self',
      forSelf: true,
    }),
  ])
  const signer = PublicKey.fromString(publicKey)
  const der = Signature.fromDER(signature)
  const recovery = der.CalculateRecoveryFactor(signer, new BigNumber(bsmHash))

  const suffix = new Script()
  if (lockingScript.chunks.some((chunk) => chunk.op === OP.OP_RETURN)) {
    suffix.writeBin(Utils.toArray('|'))
  } else {
    suffix.writeOpCode(OP.OP_RETURN)
  }
  suffix.writeBin(Utils.toArray('SIGMA'))
  suffix.writeBin(Utils.toArray('BSM'))
  suffix.writeBin(Utils.toArray(signer.toAddress()))
  suffix.writeBin(der.toCompact(recovery, true) as number[])
  suffix.writeBin(Utils.toArray('0'))

  // Concatenate serialized bytes. Mutating `Script.chunks` is unsafe here:
  // after a serialized script is parsed, @bsv/sdk deliberately collapses a
  // top-level OP_RETURN and its remainder into one execution chunk.
  return Script.fromBinary([...lockingScript.toBinary(), ...suffix.toBinary()])
}

type RawScriptChunk = {
  op: number
  data?: number[]
  start: number
  end: number
  invalidLength: boolean
}

/**
 * Parses every opcode and push in the serialized script, including pushes
 * after a top-level OP_RETURN. @bsv/sdk intentionally represents OP_RETURN and
 * all remaining bytes as one chunk when reading a serialized script, which is
 * correct for script execution but not sufficient for Bitcom protocol frames.
 */
const parseRawScriptChunks = (lockingScript: Script): RawScriptChunk[] => {
  const bytes = lockingScript.toBinary()
  const chunks: RawScriptChunk[] = []
  let cursor = 0

  while (cursor < bytes.length) {
    const start = cursor
    const op = bytes[cursor++] as number
    let length: number | null = null
    let lengthBytes = 0

    if (op > 0 && op < OP.OP_PUSHDATA1) {
      length = op
    } else if (op === OP.OP_PUSHDATA1) {
      lengthBytes = 1
    } else if (op === OP.OP_PUSHDATA2) {
      lengthBytes = 2
    } else if (op === OP.OP_PUSHDATA4) {
      lengthBytes = 4
    }

    if (lengthBytes > 0) {
      if (cursor + lengthBytes > bytes.length) {
        chunks.push({ op, start, end: bytes.length, invalidLength: true })
        break
      }
      length = 0
      for (let offset = 0; offset < lengthBytes; offset += 1) {
        length += (bytes[cursor + offset] as number) * (2 ** (8 * offset))
      }
      cursor += lengthBytes
    }

    if (length === null) {
      chunks.push({ op, start, end: cursor, invalidLength: false })
      continue
    }

    const end = Math.min(cursor + length, bytes.length)
    chunks.push({
      op,
      data: bytes.slice(cursor, end),
      start,
      end,
      invalidLength: end - cursor !== length,
    })
    cursor = end
  }
  return chunks
}

const chunkAscii = (chunks: RawScriptChunk[], index: number): string => {
  const data = chunks[index]?.data
  if (!data) return ''
  let value = ''
  for (const byte of data) value += String.fromCharCode(byte)
  return value
}

const chunkEqualsAscii = (
  chunks: RawScriptChunk[],
  index: number,
  expected: string,
): boolean => {
  const data = chunks[index]?.data
  if (!data || data.length !== expected.length) return false
  for (let offset = 0; offset < expected.length; offset += 1) {
    if (data[offset] !== expected.charCodeAt(offset)) return false
  }
  return true
}

export type DecodedMapSet = {
  cmd: 'SET'
  data: Record<string, string>
}

const cleanMapString = (value: string): string =>
  value.replace(/\0/g, ' ').replace(/\\u0000/g, ' ')

/**
 * Decodes the canonical MAP SET frame directly from serialized script bytes.
 *
 * `@bsv/sdk` intentionally collapses everything after a top-level OP_RETURN
 * into one execution chunk. That is correct for script execution, but the MAP
 * template's decoder consequently cannot see MAP in a serialized inscription
 * when a larger PUSHDATA payload (such as an image) precedes it. Reading the
 * raw pushes also keeps this check symmetric with the raw SIGMA suffix parser.
 */
export function decodeMapSet(lockingScript: Script): DecodedMapSet | null {
  const chunks = parseRawScriptChunks(lockingScript)
  for (let index = 0; index < chunks.length - 2; index += 1) {
    if (
      chunks[index]?.op !== OP.OP_RETURN
      || !chunkEqualsAscii(chunks, index + 1, MAP_PREFIX)
      || !chunkEqualsAscii(chunks, index + 2, 'SET')
    ) continue

    const data: Record<string, string> = {}
    for (let cursor = index + 3; cursor < chunks.length; cursor += 2) {
      if (chunkEqualsAscii(chunks, cursor, '|')) return { cmd: 'SET', data }
      const key = chunks[cursor]?.data
      const value = chunks[cursor + 1]?.data
      if (!key || !value) return null
      data[cleanMapString(Utils.toUTF8(key))] = cleanMapString(Utils.toUTF8(value))
    }
    return { cmd: 'SET', data }
  }
  return null
}

export type SigmaSuffixInspection = {
  index: number
  markers: string[]
  tail: string[]
}

/**
 * Locates the suffix using exact serialized pushes, including protocol fields
 * following OP_RETURN. It therefore behaves identically for freshly assembled
 * scripts and scripts parsed from wallet-returned transaction bytes.
 */
export function inspectSigmaSuffix(lockingScript: Script): SigmaSuffixInspection {
  const chunks = parseRawScriptChunks(lockingScript)
  let index = -1
  for (let cursor = chunks.length - 1; cursor >= 1; cursor -= 1) {
    if (
      chunkEqualsAscii(chunks, cursor - 1, '|') &&
      chunkEqualsAscii(chunks, cursor, 'SIGMA') &&
      chunkEqualsAscii(chunks, cursor + 1, 'BSM')
    ) {
      index = cursor
      break
    }
  }

  const markers = chunks.flatMap((_, cursor) => {
    if (chunkEqualsAscii(chunks, cursor, '|')) return [`${cursor}:|`]
    if (chunkEqualsAscii(chunks, cursor, 'SIGMA')) return [`${cursor}:SIGMA`]
    if (chunkEqualsAscii(chunks, cursor, 'BSM')) return [`${cursor}:BSM`]
    return []
  })
  const tailStart = Math.max(0, chunks.length - 10)
  const tail = chunks.slice(tailStart).map((chunk, offset) => {
    const cursor = tailStart + offset
    const data = chunk.data
    const bytes = data ? Array.from(data) : []
    return `${cursor}:op=${chunk.op}:len=${bytes.length}:hex=${Utils.toHex(bytes.slice(0, 12)) || '-'}${chunk.invalidLength ? ':invalid' : ''}`
  })
  return { index, markers, tail }
}

export type CollectionScriptVerification = {
  valid: boolean
  errors: string[]
  signerAddress: string
  signerPublicKey: string
  map: Record<string, string> | null
  contentType: string
  contentBytes: number
}

export function extractUnsignedSigmaScript(lockingScript: Script): Script | null {
  const sigma = inspectSigmaSuffix(lockingScript)
  if (sigma.index < 1) return null
  const rawChunks = parseRawScriptChunks(lockingScript)
  const unsignedEnd = rawChunks[sigma.index - 1]?.start
  return unsignedEnd === undefined
    ? null
    : Script.fromBinary(lockingScript.toBinary().slice(0, unsignedEnd))
}

/**
 * Re-parses and cryptographically checks the output bytes returned by a wallet.
 * This deliberately does not trust the MAP object used to build the output.
 */
export function verifyCollectionScript(
  lockingScript: Script,
  expectedUnsignedScript: Script,
  sigmaInput: SigmaInput,
  expectedMap: AdinalsCollectionMap,
): CollectionScriptVerification {
  const errors: string[] = []
  // Content and arbitrary MAP values are allowed to equal the literal word
  // "SIGMA". Locate the protocol suffix structurally from the end instead of
  // mistaking an earlier inscription/MAP push for the signature marker. Do
  // this before invoking any protocol decoder so diagnostics describe the
  // exact Script object supplied by the wallet transaction.
  const sigma = inspectSigmaSuffix(lockingScript)
  const sigmaIndex = sigma.index
  const rawChunks = parseRawScriptChunks(lockingScript)
  const decodedInscription = Inscription.decode(lockingScript)
  const decodedMap = decodeMapSet(lockingScript)
  let signerAddress = ''
  let signerPublicKey = ''

  if (!decodedInscription) errors.push('inscription not found')
  if (!decodedMap || decodedMap.cmd !== 'SET') errors.push('MAP SET not found')
  if (decodedMap && JSON.stringify(decodedMap.data) !== JSON.stringify(expectedMap)) {
    errors.push('MAP fields do not match the canonical collection record')
  }

  if (sigmaIndex < 1) {
    errors.push(
      `SIGMA suffix not found [${COLLECTION_VERIFIER_REVISION}; markers=${sigma.markers.join(',') || 'none'}; tail=${sigma.tail.join(',') || 'empty'}]`,
    )
  } else if (
    !chunkEqualsAscii(rawChunks, sigmaIndex + 1, 'BSM') ||
    !chunkEqualsAscii(rawChunks, sigmaIndex + 4, '0')
  ) {
    errors.push('SIGMA fields are malformed')
  } else {
    signerAddress = chunkAscii(rawChunks, sigmaIndex + 2)
    const compact = rawChunks[sigmaIndex + 3]?.data
    const unsignedEnd = rawChunks[sigmaIndex - 1]?.start ?? 0
    const unsigned = Script.fromBinary(lockingScript.toBinary().slice(0, unsignedEnd))
    if (unsigned.toHex() !== expectedUnsignedScript.toHex()) {
      errors.push('signed output changed the inscription or MAP bytes')
    }
    try {
      if (!compact || compact.length !== 65) throw new Error('invalid compact signature')
      const messageHash = sigmaMessageHash(unsigned, sigmaInput)
      const bsmHash = BSM.magicHash(messageHash)
      const publicKey = PublicKey.fromMsgHashAndCompactSignature(
        new BigNumber(bsmHash),
        compact,
      )
      signerPublicKey = publicKey.toString()
      const signature = Signature.fromCompact(compact)
      if (publicKey.toAddress() !== signerAddress || !BSM.verify(messageHash, signature, publicKey)) {
        errors.push('SIGMA signature is invalid')
      }
    } catch {
      errors.push('SIGMA signature is invalid')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    signerAddress,
    signerPublicKey,
    map: decodedMap?.data ?? null,
    contentType: decodedInscription?.file.type ?? '',
    contentBytes: decodedInscription?.file.content.length ?? 0,
  }
}
