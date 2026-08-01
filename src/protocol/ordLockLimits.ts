/**
 * BRC-100 createAction needs an upper bound before the wallet builds its final
 * change outputs. The current OrdLock purchase template produced 2,666 bytes
 * in Yours; 4 KiB leaves room for wallet-added output serialization while
 * remaining a narrow fee estimate rather than an unbounded placeholder.
 */
export const ORDLOCK_PURCHASE_UNLOCKING_SCRIPT_MAX = 4_096
