/**
 * BRC-100 createAction needs an upper bound before the wallet builds its final
 * change outputs. The current OrdLock purchase template produced 2,666 bytes
 * in Yours; 4 KiB leaves room for wallet-added output serialization while
 * remaining a narrow fee estimate rather than an unbounded placeholder.
 */
export const ORDLOCK_PURCHASE_UNLOCKING_SCRIPT_MAX = 4_096

/**
 * The cancel branch pushes a signature, a public key, and the branch selector.
 * A DER signature can reach 72 bytes, plus its sighash byte and push opcode
 * (74), the 33-byte compressed key and its push opcode (34), and `OP_1` (1).
 * The template's own estimate of 108 assumes the common 71-byte signature and
 * under-reserves the worst case by one byte.
 */
export const ORDLOCK_CANCEL_UNLOCKING_SCRIPT_MAX = 109
