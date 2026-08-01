const docs = `# Adinals topic manager

\`tm_adinals\` is the version 3 Adinals lifecycle topic. Its production policy
is to admit only cryptographically verified collection records and valid
spend-linked Adinal transitions.

The implementation admits creator-signed collections, tightly validated signed
mint and decision candidates, and input-0-linked listings, purchases,
cancellations, transfers, and updates. It recognizes the exact pinned OrdLock
contract, verifies seller/payout continuity, and admits both the one-satoshi
successor and sibling update record for a valid update.

Cross-record creator authority, collection rules, owner epochs, duplicate
slots, and decision references are resolved by the lookup layer before a
candidate is returned as protocol-valid. A confirmed reconciliation package
must include the immediately preceding transaction as BEEF evidence even when
the current transaction has its own Merkle proof.
`

export default docs
