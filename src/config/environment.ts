import {
  ADINALS_BASKET,
  ORDINALS_BASKET,
  TEST_ADINALS_BASKET,
} from '../onesat/constants.ts'

type AdinalsEnvironment = 'development' | 'production'

const viteEnv = (
  import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }
).env ?? {}

const envText = (name: string): string =>
  typeof viteEnv[name] === 'string' ? (viteEnv[name] as string).trim() : ''

export const ADINALS_ENVIRONMENT: AdinalsEnvironment =
  viteEnv.VITE_ADINALS_ENV === 'development' ? 'development' : 'production'

// This is the production product, so writes are enabled unless an operator
// deliberately compiles a read-only emergency build.
export const COLLECTION_PUBLISH_ENABLED =
  viteEnv.VITE_ENABLE_COLLECTION_PUBLISH !== 'false'

// Keep the independent switch as a kill switch, not a deployment requirement.
export const LIFECYCLE_PUBLISH_ENABLED =
  viteEnv.VITE_ENABLE_LIFECYCLE_PUBLISH !== 'false'

const configuredOverlayUrl = envText('VITE_ADINALS_OVERLAY_URL').replace(/\/+$/, '')

/**
 * Local Vite development talks to LARS directly. Production builds stay off
 * the overlay until an explicit HTTPS shadow endpoint is configured; a hosted
 * application must never try a visitor's localhost.
 */
export const ADINALS_OVERLAY_URL = configuredOverlayUrl ||
  (viteEnv.DEV === true && typeof window !== 'undefined'
    ? new URL('/adinals-overlay', window.location.origin).toString().replace(/\/$/, '')
    : '')

const defaults = ADINALS_ENVIRONMENT === 'production'
  ? {
      app: 'adinals',
      basket: ADINALS_BASKET,
      keyProtocol: 'adinals',
      actionLabel: 'adinals action',
      messageBox: 'adinals_inbox',
      overlayTopic: 'tm_adinals',
    }
  : {
      app: 'adinals-brc100-test',
      basket: TEST_ADINALS_BASKET,
      keyProtocol: 'adinals brc100 test',
      actionLabel: 'adinals brc100 test action',
      messageBox: 'adinals_brc100_test_inbox',
      overlayTopic: 'tm_adinals_brc100_test',
    }

export const ADINALS_NAMESPACE = {
  environment: ADINALS_ENVIRONMENT,
  app: envText('VITE_ADINALS_APP') || defaults.app,
  basket: envText('VITE_ADINALS_BASKET') || defaults.basket,
  keyProtocol: envText('VITE_ADINALS_KEY_PROTOCOL') || defaults.keyProtocol,
  actionLabel: envText('VITE_ADINALS_ACTION_LABEL') || defaults.actionLabel,
  messageBox: envText('VITE_ADINALS_MESSAGEBOX') || defaults.messageBox,
  overlayTopic: envText('VITE_ADINALS_OVERLAY_TOPIC') || defaults.overlayTopic,
} as const

/**
 * Development deliberately uses one isolated BRC-46 basket in every wallet.
 * Production prefers Yours' native 1Sat basket, then falls back for wallets
 * that correctly reject the unsupported BRC-99 `p 1sat` scheme.
 */
export const ACTIVE_BASKET_CANDIDATES: readonly string[] =
  ADINALS_ENVIRONMENT === 'production'
    ? [ORDINALS_BASKET, ADINALS_NAMESPACE.basket]
    : [ADINALS_NAMESPACE.basket]
