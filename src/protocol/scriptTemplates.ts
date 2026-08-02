import { Hash, OP, Script, Utils } from '@bsv/sdk'

const ORDLOCK_PREFIX = Utils.toArray(
  '2097dfd76851bf465e8f715593b217714858bbe9570ff3bd5e33840a34e20ff0262102ba79df5f8ae7604a9830f03c7933028186aede0675a16f025dc4f8be8eec0382201008ce7480da41702918d1ec8e6849ba32b4d65b1e40dc669c31a1e6306b266c0000',
  'hex',
)
const ORDLOCK_SUFFIX_BYTES = 702
const ORDLOCK_SUFFIX_SHA256 =
  'a208540ae84c8c389126731c9e69958a778e0bde2c2b4cbb4c1e3fe11973a1ad'

const equalBytes = (left: readonly number[], right: readonly number[]): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index])

export type DecodedP2PKH = { address: string; publicKeyHash: number[] }

export function decodeP2PKHScript(script: Script): DecodedP2PKH | null {
  const bytes = script.toBinary()
  if (
    bytes.length !== 25 ||
    bytes[0] !== OP.OP_DUP ||
    bytes[1] !== OP.OP_HASH160 ||
    bytes[2] !== 20 ||
    bytes[23] !== OP.OP_EQUALVERIFY ||
    bytes[24] !== OP.OP_CHECKSIG
  ) return null
  const publicKeyHash = bytes.slice(3, 23)
  return { address: Utils.toBase58Check(publicKeyHash, [0x00]), publicKeyHash }
}

export function decodeEmbeddedP2PKHScript(script: Script): DecodedP2PKH | null {
  const matches: DecodedP2PKH[] = []
  for (let index = 0; index <= script.chunks.length - 5; index += 1) {
    const match = decodeP2PKHScript(new Script(script.chunks.slice(index, index + 5)))
    if (match) matches.push(match)
  }
  return matches.length === 1 ? matches[0]! : null
}

export type DecodedOrdLock = {
  seller: string
  priceSatoshis: number
  payoutScript: number[]
}

/** Recognizes the exact OrdLock contract pinned by the v3 writer. */
export function decodeOrdLockScript(script: Script): DecodedOrdLock | null {
  const bytes = script.toBinary()
  if (!equalBytes(bytes.slice(0, ORDLOCK_PREFIX.length), ORDLOCK_PREFIX)) return null
  let cursor = ORDLOCK_PREFIX.length
  if (bytes[cursor] !== 20) return null
  const sellerHash = bytes.slice(cursor + 1, cursor + 21)
  if (sellerHash.length !== 20) return null
  cursor += 21

  const payoutLength = bytes[cursor]
  if (payoutLength !== 34) return null
  const payout = bytes.slice(cursor + 1, cursor + 1 + payoutLength)
  if (payout.length !== payoutLength) return null
  cursor += 1 + payoutLength

  const suffix = bytes.slice(cursor)
  if (
    suffix.length !== ORDLOCK_SUFFIX_BYTES ||
    Utils.toHex(Hash.sha256(suffix)) !== ORDLOCK_SUFFIX_SHA256
  ) return null
  let price = 0n
  for (let offset = 0; offset < 8; offset += 1) {
    price |= BigInt(payout[offset]!) << BigInt(offset * 8)
  }
  if (price < 1n || price > BigInt(Number.MAX_SAFE_INTEGER) || payout[8] !== 25) return null
  const payoutScript = payout.slice(9)
  if (payoutScript.length !== 25 || !decodeP2PKHScript(Script.fromBinary(payoutScript))) return null
  return {
    seller: Utils.toBase58Check(sellerHash, [0x00]),
    priceSatoshis: Number(price),
    payoutScript,
  }
}

