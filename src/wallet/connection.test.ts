import assert from 'node:assert/strict'
import test from 'node:test'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import { ADINALS_BASKET, ORDINALS_BASKET } from '../onesat/constants.ts'
import { inspectOrdinalBasket, inspectWallet, walletErrorMessage, type WalletProbe } from './connection.ts'

function mockWallet(authenticated: boolean): { wallet: WalletProbe; waits: () => number } {
  let waitCalls = 0
  const wallet = {
    getVersion: async () => ({ version: 'wallet-1.0' }),
    isAuthenticated: async () => ({ authenticated }),
    waitForAuthentication: async () => {
      waitCalls += 1
      return { authenticated: true as const }
    },
    getNetwork: async () => ({ network: 'mainnet' as const }),
    getHeight: async () => ({ height: 960_131 }),
    getPublicKey: async () => ({ publicKey: `02${'a'.repeat(64)}` }),
    listOutputs: async () => ({ totalOutputs: 3, outputs: [] }),
  } as unknown as WalletProbe
  return { wallet, waits: () => waitCalls }
}

test('inspectWallet waits for authentication and reports wallet capabilities', async () => {
  const { wallet, waits } = mockWallet(false)
  const result = await inspectWallet(wallet)
  assert.equal(waits(), 1)
  assert.equal(result.network, 'mainnet')
  assert.equal(result.height, 960_131)
  assert.equal(result.ordinalCount, 3)
  assert.match(result.identityKey, /^02[a-f0-9]{64}$/)
})

test('inspectWallet does not repeat authentication for an authenticated wallet', async () => {
  const { wallet, waits } = mockWallet(true)
  await inspectWallet(wallet, { inspectOrdinals: false })
  assert.equal(waits(), 0)
})

test('wallet errors are converted into useful connection guidance', () => {
  assert.match(walletErrorMessage(new Error('No wallet available over any communication substrate')), /BRC-100 wallet/)
  assert.match(walletErrorMessage(new Error('User rejected permission')), /did not approve/)
})

test('uses the standard 1Sat ordinal basket identifier', () => {
  assert.equal(ORDINALS_BASKET, 'p 1sat ordinals')
})

test('defaults to the production namespace', () => {
  assert.equal(ADINALS_NAMESPACE.environment, 'production')
  assert.equal(ADINALS_NAMESPACE.app, 'adinals')
  assert.equal(ADINALS_NAMESPACE.basket, ADINALS_BASKET)
  assert.equal(ADINALS_NAMESPACE.messageBox, 'adinals_inbox')
})

test('falls back to the portable Adinals basket when p 1sat is unsupported', async () => {
  const { wallet } = mockWallet(true)
  const requested: string[] = []
  wallet.listOutputs = async ({ basket }) => {
    requested.push(basket)
    if (basket === ORDINALS_BASKET) throw new Error('Unsupported p basket protocol')
    return { totalOutputs: 2, outputs: [] }
  }

  const result = await inspectOrdinalBasket(wallet, null, [ORDINALS_BASKET, ADINALS_BASKET])
  assert.deepEqual(requested, [ORDINALS_BASKET, ADINALS_BASKET])
  assert.deepEqual(result, { basket: ADINALS_BASKET, totalOutputs: 2 })
})
