import { ADINALS_NAMESPACE } from '../config/environment.ts'

const withoutTrailingSlash = (value: string): string => value.replace(/\/+$/, '')

const viteEnv = (
  import.meta as ImportMeta & { env?: Record<string, string | undefined> }
).env ?? {}

/** Public MessageBox service operated by Babbage and advertised by x402 Agency. */
export const MESSAGEBOX_HOST = withoutTrailingSlash(
  viteEnv.VITE_MESSAGEBOX_HOST || 'https://messagebox.babbage.systems'
)

/** Identity-scoped queue used only for Adinals transfer offers. */
export const ADINALS_MESSAGEBOX = ADINALS_NAMESPACE.messageBox
