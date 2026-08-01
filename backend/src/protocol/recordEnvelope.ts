import {
  BSM,
  BigNumber,
  Hash,
  OP,
  PublicKey,
  Script,
  Signature,
  Transaction,
  Utils
} from '@bsv/sdk'

const MAP_PREFIX = '1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5'

export const ADINALS_APP = 'adinals' as const
export const ADINALS_PROTOCOL_VERSION = '3' as const
export const ADINALS_RECORD_SUBTYPES = [
  'collection',
  'collectionItem',
  'adUpdate',
  'adDecision'
] as const

export type AdinalsRecordSubtype = typeof ADINALS_RECORD_SUBTYPES[number]
export type SigmaInput = { txid: string; vout: number }

type RawScriptChunk = {
  op: number
  data?: number[]
  start: number
  invalidLength: boolean
}

export type AdinalsRecordEnvelope = {
  valid: boolean
  errors: string[]
  map: Record<string, string> | null
  subType: AdinalsRecordSubtype | null
  signerAddress: string
  signerPublicKey: string
  contentType: string
  contentBytes: number
  content: number[]
}

const uint32LE = (value: number): number[] => [
  value & 0xff,
  (value >> 8) & 0xff,
  (value >> 16) & 0xff,
  (value >> 24) & 0xff
]

export const sigmaMessageHash = (
  lockingScript: Script,
  input: SigmaInput
): number[] => {
  if (
    !/^[0-9a-f]{64}$/i.test(input.txid) ||
    !Number.isSafeInteger(input.vout) ||
    input.vout < 0
  ) {
    throw new Error('SIGMA requires a valid transaction outpoint')
  }
  const inputHash = Hash.sha256([
    ...Utils.toArray(input.txid, 'hex'),
    ...uint32LE(input.vout)
  ])
  return Hash.sha256([
    ...inputHash,
    ...Hash.sha256(lockingScript.toBinary())
  ])
}

const parseRawScriptChunks = (lockingScript: Script): RawScriptChunk[] => {
  const bytes = lockingScript.toBinary()
  const chunks: RawScriptChunk[] = []
  let cursor = 0

  while (cursor < bytes.length) {
    const start = cursor
    const op = bytes[cursor++] as number
    let length: number | null = null
    let lengthBytes = 0

    if (op > 0 && op < OP.OP_PUSHDATA1) length = op
    else if (op === OP.OP_PUSHDATA1) lengthBytes = 1
    else if (op === OP.OP_PUSHDATA2) lengthBytes = 2
    else if (op === OP.OP_PUSHDATA4) lengthBytes = 4

    if (lengthBytes > 0) {
      if (cursor + lengthBytes > bytes.length) {
        chunks.push({ op, start, invalidLength: true })
        break
      }
      length = 0
      for (let offset = 0; offset < lengthBytes; offset += 1) {
        length += (bytes[cursor + offset] as number) * (2 ** (8 * offset))
      }
      cursor += lengthBytes
    }

    if (length === null) {
      chunks.push({ op, start, invalidLength: false })
      continue
    }

    const end = Math.min(cursor + length, bytes.length)
    chunks.push({
      op,
      data: bytes.slice(cursor, end),
      start,
      invalidLength: end - cursor !== length
    })
    cursor = end
  }

  return chunks
}

const equalsAscii = (
  chunks: RawScriptChunk[],
  index: number,
  expected: string
): boolean => {
  const data = chunks[index]?.data
  if (!data || data.length !== expected.length) return false
  return expected.split('').every(
    (character, offset) => data[offset] === character.charCodeAt(0)
  )
}

const ascii = (chunks: RawScriptChunk[], index: number): string => {
  const data = chunks[index]?.data
  return data ? Utils.toUTF8(data) : ''
}

export const decodeMapSet = (
  lockingScript: Script
): Record<string, string> | null => {
  const chunks = parseRawScriptChunks(lockingScript)
  for (let index = 0; index < chunks.length - 2; index += 1) {
    if (
      chunks[index]?.op !== OP.OP_RETURN ||
      !equalsAscii(chunks, index + 1, MAP_PREFIX) ||
      !equalsAscii(chunks, index + 2, 'SET')
    ) continue

    const map: Record<string, string> = {}
    for (let cursor = index + 3; cursor < chunks.length; cursor += 2) {
      if (equalsAscii(chunks, cursor, '|')) return map
      const key = chunks[cursor]?.data
      const value = chunks[cursor + 1]?.data
      if (!key || !value) return null
      map[Utils.toUTF8(key).replace(/\0/g, ' ').replace(/\\u0000/g, ' ')] =
        Utils.toUTF8(value).replace(/\0/g, ' ').replace(/\\u0000/g, ' ')
    }
    return map
  }
  return null
}

const findSigmaIndex = (chunks: RawScriptChunk[]): number => {
  for (let index = chunks.length - 5; index >= 1; index -= 1) {
    if (
      equalsAscii(chunks, index - 1, '|') &&
      equalsAscii(chunks, index, 'SIGMA') &&
      equalsAscii(chunks, index + 1, 'BSM')
    ) return index
  }
  return -1
}

const decodeInscription = (
  chunks: RawScriptChunk[]
): { contentType: string; contentBytes: number; content: number[] } | null => {
  for (let index = 0; index < chunks.length - 7; index += 1) {
    if (
      chunks[index]?.op !== OP.OP_0 ||
      chunks[index + 1]?.op !== OP.OP_IF ||
      !equalsAscii(chunks, index + 2, 'ord') ||
      chunks[index + 3]?.op !== OP.OP_1 ||
      !chunks[index + 4]?.data ||
      chunks[index + 5]?.op !== OP.OP_0
    ) continue

    let contentBytes = 0
    const content: number[] = []
    let cursor = index + 6
    while (cursor < chunks.length && chunks[cursor]?.op !== OP.OP_ENDIF) {
      const contentChunk = chunks[cursor]?.data
      if (!contentChunk) return null
      contentBytes += contentChunk.length
      for (const byte of contentChunk) content.push(byte)
      cursor += 1
    }
    if (chunks[cursor]?.op !== OP.OP_ENDIF || contentBytes < 1) return null
    return {
      contentType: Utils.toUTF8(chunks[index + 4]?.data ?? []),
      contentBytes,
      content
    }
  }
  return null
}

const isSubtype = (value: string): value is AdinalsRecordSubtype =>
  ADINALS_RECORD_SUBTYPES.some((subType) => subType === value)

export const inspectAdinalsRecordScript = (
  lockingScript: Script,
  sigmaInput: SigmaInput,
  expectedApp: string = ADINALS_APP
): AdinalsRecordEnvelope => {
  const errors: string[] = []
  const chunks = parseRawScriptChunks(lockingScript)
  const map = decodeMapSet(lockingScript)
  const inscription = decodeInscription(chunks)
  const sigmaIndex = findSigmaIndex(chunks)
  let signerAddress = ''
  let signerPublicKey = ''
  let subType: AdinalsRecordSubtype | null = null

  if (!inscription) errors.push('inscription not found')
  if (!map) errors.push('MAP SET not found')
  if (map) {
    if (map.app !== expectedApp) errors.push('app mismatch')
    if (map.type !== 'ord') errors.push('type must be ord')
    if (map.protocolVersion !== ADINALS_PROTOCOL_VERSION) {
      errors.push('protocolVersion must be 3')
    }
    if (!isSubtype(map.subType ?? '')) errors.push('unsupported record subtype')
    else subType = map.subType as AdinalsRecordSubtype
    if (!map.name?.trim()) errors.push('name is required')
  }

  if (chunks.some((chunk) => chunk.invalidLength)) {
    errors.push('script contains an invalid push length')
  }
  if (sigmaIndex < 1) {
    errors.push('SIGMA suffix not found')
  } else if (
    sigmaIndex + 4 !== chunks.length - 1 ||
    !equalsAscii(chunks, sigmaIndex + 1, 'BSM') ||
    !equalsAscii(chunks, sigmaIndex + 4, '0')
  ) {
    errors.push('SIGMA fields are malformed')
  } else {
    signerAddress = ascii(chunks, sigmaIndex + 2)
    const compact = chunks[sigmaIndex + 3]?.data
    const unsignedEnd = chunks[sigmaIndex - 1]?.start
    try {
      if (!compact || compact.length !== 65 || unsignedEnd === undefined) {
        throw new Error('invalid SIGMA fields')
      }
      const unsigned = Script.fromBinary(
        lockingScript.toBinary().slice(0, unsignedEnd)
      )
      const messageHash = sigmaMessageHash(unsigned, sigmaInput)
      const bsmHash = BSM.magicHash(messageHash)
      const publicKey = PublicKey.fromMsgHashAndCompactSignature(
        new BigNumber(bsmHash),
        compact
      )
      const signature = Signature.fromCompact(compact)
      signerPublicKey = publicKey.toString()
      if (
        publicKey.toAddress() !== signerAddress ||
        !BSM.verify(messageHash, signature, publicKey)
      ) {
        throw new Error('invalid SIGMA signature')
      }
    } catch {
      errors.push('SIGMA signature is invalid')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    map,
    subType,
    signerAddress,
    signerPublicKey,
    contentType: inscription?.contentType ?? '',
    contentBytes: inscription?.contentBytes ?? 0,
    content: inscription?.content ?? []
  }
}

export const inspectAdinalsTransactionOutput = (
  tx: Transaction,
  outputIndex: number,
  expectedApp: string = ADINALS_APP
): AdinalsRecordEnvelope => {
  const input = tx.inputs[0]
  const output = tx.outputs[outputIndex]
  const txid = input?.sourceTXID ?? input?.sourceTransaction?.id('hex') ?? ''
  const vout = input?.sourceOutputIndex
  if (!output || !txid || vout === undefined) {
    return {
      valid: false,
      errors: ['record transaction requires input 0 and the requested output'],
      map: null,
      subType: null,
      signerAddress: '',
      signerPublicKey: '',
      contentType: '',
      contentBytes: 0,
      content: []
    }
  }
  return inspectAdinalsRecordScript(
    output.lockingScript,
    { txid, vout },
    expectedApp
  )
}
