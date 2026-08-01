# Collection fixtures

This directory intentionally contains one complete positive fixture:
`published-mainnet-yours-446af364.json`. Its exact collection transaction,
anchor, signatures, and dependencies were published on BSV mainnet before the
fixture was admitted to Git.

The fixture contains no private key or wallet-local action capability. Its
signed bytes are safe to redistribute because they no longer authorize a new
transaction; they reproduce an already-public transaction.

Do not add an exported no-send action merely because it contains no private
key. A signed raw transaction or Atomic BEEF can itself be sufficient to
broadcast a wallet-authorized spend. New positive fixtures must be synthetic
with nonexistent funding or already irreversibly public. Negative vectors
should be generated locally from the allowlisted fixture.
