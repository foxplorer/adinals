import {
  BigNumber,
  ECDSA,
  Hash,
  PublicKey,
  Signature,
  type WalletInterface,
  type WalletProtocol,
} from '@bsv/sdk'

/**
 * Checks that a wallet signs with the same derived key it reports, and that it
 * honours a directly supplied hash.
 *
 * A P2PKH spend fails at `OP_CHECKSIG` with a truthy-stack error whenever the
 * signature does not match the pushed public key, which has two very different
 * causes: the wallet signed a different message than the one requested, or it
 * signed with a key other than the one `getPublicKey` returned. The failure
 * looks identical on chain, so this asks the wallet both questions directly.
 *
 * Nothing here creates, signs, or broadcasts a transaction.
 */
export type SigningConformance = {
  publicKey: string
  /** The wallet signed exactly the 32-byte hash it was given. */
  directHashHonoured: boolean
  /** The wallet hashed the supplied data once with SHA-256 before signing. */
  dataHashedOnce: boolean
  /** Set when the wallet signed a message neither convention explains. */
  unexplained: boolean
  errors: string[]
}

const verifies = (signature: number[], hash: number[], publicKey: string): boolean => {
  try {
    return ECDSA.verify(
      new BigNumber(hash),
      Signature.fromDER(signature),
      PublicKey.fromString(publicKey),
    )
  } catch {
    return false
  }
}

export async function readSigningConformance(
  wallet: Pick<WalletInterface, 'getPublicKey' | 'createSignature'>,
  protocolID: WalletProtocol,
  keyID: string,
): Promise<SigningConformance> {
  const errors: string[] = []
  const { publicKey } = await wallet.getPublicKey({
    protocolID,
    keyID,
    counterparty: 'self',
    forSelf: true,
  })

  const data = Array.from(crypto.getRandomValues(new Uint8Array(64)))
  const singleHash = Hash.sha256(data)
  const doubleHash = Hash.sha256(singleHash)

  let directHashHonoured = false
  let dataHashedOnce = false
  try {
    const { signature } = await wallet.createSignature({
      protocolID,
      keyID,
      counterparty: 'self',
      hashToDirectlySign: doubleHash,
    })
    directHashHonoured = verifies(signature, doubleHash, publicKey)
    // A wallet that ignores the supplied hash and signs the data instead
    // produces a signature over the single hash, which is the exact shape that
    // breaks a Bitcoin spend while looking correct everywhere else.
    if (!directHashHonoured && verifies(signature, singleHash, publicKey)) {
      errors.push('The wallet signed a hash of the request rather than the hash it was given.')
    } else if (!directHashHonoured) {
      errors.push('The wallet signature does not verify against the public key it reported.')
    }
  } catch (error) {
    errors.push(`hashToDirectlySign failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    const { signature } = await wallet.createSignature({
      protocolID,
      keyID,
      counterparty: 'self',
      data,
    })
    dataHashedOnce = verifies(signature, singleHash, publicKey)
    if (!dataHashedOnce && verifies(signature, doubleHash, publicKey)) {
      errors.push('The wallet double-hashed supplied data before signing.')
    }
  } catch (error) {
    errors.push(`data signing failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    publicKey,
    directHashHonoured,
    dataHashedOnce,
    unexplained: !directHashHonoured && !dataHashedOnce,
    errors,
  }
}

export const summarizeSigningConformance = (result: SigningConformance): string => {
  if (result.directHashHonoured) {
    return 'This wallet signs the exact hash it is given, so transaction signing should match its reported key.'
  }
  if (result.unexplained) {
    return 'This wallet signed with a key that does not match the one it reported, which breaks every derived-key spend.'
  }
  return 'This wallet ignores a directly supplied hash, so a Bitcoin sighash must not be sent as data.'
}
