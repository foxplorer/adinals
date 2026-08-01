/**
 * Standard 1Sat basket identifiers used at the wallet boundary.
 *
 * Kept in this tiny compatibility module because @1sat/types 0.0.34 publishes
 * extensionless ESM re-exports that work through Vite but not through Node's
 * native test resolver. This value matches its exported ORDINALS_BASKET.
 */
export const ORDINALS_BASKET = 'p 1sat ordinals' as const

/**
 * Portable BRC-46 basket for wallets that do not implement the reserved
 * BRC-99 `p 1sat` permission scheme.
 */
export const ADINALS_BASKET = 'adinals' as const

/** Mainnet-safe development basket shared by all wallets during parity work. */
export const TEST_ADINALS_BASKET = 'adinals brc100 test' as const

export const ADINALS_BASKET_CANDIDATES = [ORDINALS_BASKET, ADINALS_BASKET] as const
