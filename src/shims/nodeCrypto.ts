/**
 * Browser-only Vite replacement for optional `node:crypto` probes in
 * @bsv/sdk. Undefined native functions make the SDK use its audited pure-JS
 * SHA/RIPEMD implementations; secure randomness still comes from Web Crypto.
 */
export const createHash = undefined
export const createHmac = undefined
export const randomBytes = undefined
export const createCipheriv = undefined
export const createDecipheriv = undefined

export default {}
