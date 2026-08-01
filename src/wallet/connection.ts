import { WalletClient, type WalletInterface } from '@bsv/sdk'
import { ACTIVE_BASKET_CANDIDATES } from '../config/environment.ts'

export type AdinalsBasket = string

export type WalletProbe = Pick<
  WalletInterface,
  | 'getVersion'
  | 'isAuthenticated'
  | 'waitForAuthentication'
  | 'getNetwork'
  | 'getHeight'
  | 'getPublicKey'
  | 'listOutputs'
>

export type ConnectedWallet = {
  wallet: WalletInterface
  version: string
  network: 'mainnet' | 'testnet'
  height: number
  identityKey: string
  basket: AdinalsBasket | null
  ordinalCount: number | null
  connectedAt: string
}

export function createWalletClient(): WalletInterface {
  return new WalletClient('auto')
}

export async function inspectWallet(
  wallet: WalletProbe,
  options: { inspectOrdinals?: boolean } = {}
): Promise<Omit<ConnectedWallet, 'wallet'>> {
  const { version } = await wallet.getVersion({})
  const authentication = await wallet.isAuthenticated({}) as { authenticated: boolean }
  if (!authentication.authenticated) await wallet.waitForAuthentication({})

  const [{ network }, { height }, { publicKey }] = await Promise.all([
    wallet.getNetwork({}),
    wallet.getHeight({}),
    wallet.getPublicKey({ identityKey: true }),
  ])

  let basket: AdinalsBasket | null = null
  let ordinalCount: number | null = null
  if (options.inspectOrdinals !== false) {
    const inspection = await inspectOrdinalBasket(wallet)
    basket = inspection?.basket ?? null
    ordinalCount = inspection?.totalOutputs ?? null
  }

  return {
    version,
    network,
    height,
    identityKey: publicKey,
    basket,
    ordinalCount,
    connectedAt: new Date().toISOString(),
  }
}

export async function connectWallet(
  wallet: WalletInterface = createWalletClient()
): Promise<ConnectedWallet> {
  const details = await inspectWallet(wallet)
  return { wallet, ...details }
}

export async function inspectOrdinalBasket(
  wallet: WalletProbe,
  preferredBasket?: AdinalsBasket | null,
  configuredCandidates: readonly string[] = ACTIVE_BASKET_CANDIDATES
): Promise<{ basket: AdinalsBasket; totalOutputs: number } | null> {
  const candidates = [
    ...(preferredBasket ? [preferredBasket] : []),
    ...configuredCandidates,
  ].filter((basket, index, values): basket is AdinalsBasket => values.indexOf(basket) === index)

  for (const basket of candidates) {
    try {
      const result = await wallet.listOutputs({ basket, limit: 1 })
      return { basket, totalOutputs: result.totalOutputs }
    } catch {
      // BRC-99 requires wallets to reject `p <scheme>` baskets they do not
      // implement. Try the portable application basket before treating basket
      // inspection as unavailable.
    }
  }
  return null
}

export function walletErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/no wallet available|substrate/i.test(message)) {
    return 'No compatible BRC-100 wallet was found. Open or install a wallet such as BSV Desktop, then try again.'
  }
  if (/permission|denied|rejected|cancel/i.test(message)) {
    return 'The wallet did not approve the connection request. Nothing was signed or sent.'
  }
  return message || 'The BRC-100 wallet connection failed.'
}
