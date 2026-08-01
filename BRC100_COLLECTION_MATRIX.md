# BRC-100 compatibility and release matrix

This is the public release record for the production Adinals BRC-100 wallet
boundary. A TypeScript build alone is not compatibility: a passing action must
also preserve exact transaction bytes, signatures, output positions, custody,
and recovery behavior.

Last updated: 2026-08-01.

## Shared wallet contract

Yours Wallet and Metanet Desktop are treated as implementations of the same
`@bsv/sdk` `WalletInterface`. Adinals uses the same calls for both:

- authentication, network, height, and identity discovery;
- derived public keys under `[1, "adinals"]`;
- `createAction` and `signAction` no-send construction;
- `listOutputs` custody and `listActions` recovery;
- `abortAction` cleanup; and
- wallet-owned publication of verified transactions.

The only intentional compatibility negotiation is the output basket. Production
tries `p 1sat ordinals` and falls back to `adinals` if the wallet rejects the
BRC-99 basket scheme.

## Wallet compatibility

| Check | Yours Wallet | Metanet Desktop |
| --- | --- | --- |
| BRC-100 authentication and network/height | Pass | Pass |
| Derived collection/owner keys | Pass | Pass |
| Size-aware SIGMA fee reserve | Pass: 200-sat reserve + observed 23-sat fee for a small mint | Construction pass; current production prompt retest pending |
| Exact collection output verification | Pass | Pass |
| Exact mint/update output verification | Pass | Pass |
| Basket custody and ownership reconstruction | Pass with `p 1sat ordinals` | Pass with negotiated basket |
| No-send refresh recovery | Pass | Pass |
| Lost `signAction` session handling | Safe abort-then-rebuild path implemented; live restart retest pending | Same shared path; live restart retest pending |
| Listing/cancel | Pass | Pass through shared implementation |
| Purchase | Pass | Pass |
| Creator approval/rejection | Pass | Buyer update produced valid creator-review input |

Wallet prompts and retained proof timing may differ. Those differences do not
change the Adinals transaction or authorization rules.

## Production action matrix

| Action | Required authority | Current status |
| --- | --- | --- |
| Create collection | New wallet-derived creator key and SIGMA | Live |
| Mint collection item | Immutable collection creator SIGMA | Live |
| Update owned item | Input-0 owner signature and matching owner SIGMA | Live |
| Approve/reject update | Immutable collection creator SIGMA | Live |
| List | Current owner spends state into OrdLock | Live |
| Cancel listing | Seller authorization through OrdLock | Live |
| Purchase | OrdLock purchase path, seller payout, fresh buyer owner key | Live |
| Embed/read | No wallet permission; full reader validation required | Live |

## Verified production observations

- Yours Wallet 5.0.2 created production text mints using a 200-satoshi temporary
  reserve rather than the former fixed 2,000-satoshi anchor.
- Exact collection-item records have appeared through GorillaPool while still
  unconfirmed with complete MAP, inscription, and valid SIGMA data.
- GorillaPool can return HTTP 200 for an exact listing output while its complete
  transaction/Atomic-BEEF endpoint still returns HTTP 404.
- A buyer in the same browser can reuse the seller's locally retained verified
  proof; another browser may need to wait for public proof delivery.
- In two cross-wallet vectors, the buyer update record appeared before
  GorillaPool exposed the intervening OrdLock purchase path. The creator inbox
  became actionable after block confirmation.
- Creator decision records indexed promptly once their referenced ownership
  transition was derivable.

Transaction identifiers in this public document are intentionally abbreviated.
The automated suite uses one already-published mainnet fixture and locally
constructed synthetic negative mutations. No signed unbroadcast package belongs
in the public repository.

## Fail-closed verification gates

Every applicable action must prove:

1. Atomic BEEF parses and contains the declared subject transaction.
2. The recomputed txid matches the wallet result.
3. Required dependencies are present; unresolved txid-only ancestors fail.
4. The expected one-satoshi output exists exactly once at its mandated index.
5. Inscription and MAP bytes match canonical construction.
6. SIGMA recovers the expected creator or current owner.
7. Spend-linked updates commit all inputs and outputs and spend the exact current
   predecessor at input 0.
8. Owner epoch, successor output, sibling update output, and decision aliases
   agree.
9. Duplicate slots, expired collections, malformed records, and conflicting
   creator decisions fail closed.
10. Accepted or uncertain wallet actions are never blindly retried.

The independent verifier also mutates signatures, MAP values, anchors, owner
locks, output uniqueness, BEEF completeness, and reported txids and confirms
that every negative vector is rejected.

## Current release gates

| Gate | Status |
| --- | --- |
| Production namespace/version 3 | Pass |
| Yours and Metanet core action parity | Pass, with live recovery retests noted above |
| Exact-output index status rather than submit-only status | Implemented and tested |
| Provisional UI for incomplete or invisible cross-wallet spends | Implemented and tested |
| Signed-out immutable routes and fallback browser checks | Pending final public-release pass |
| Emergency read-only switches | Automated pass; live operator drill pending |
| Public fixture/history sanitation | Current tree sanitized; clean public history pending |
| Overlay parity and unconfirmed proof delivery | Not implemented |
| Agent SDK/CLI/MCP interface | Not implemented |
| Publisher moderation/reputation layer | Not implemented |

Overlay and agent work are roadmap items, not prerequisites for publishing the
current application as an explicitly labeled open-source beta. Repository
sanitation and a clean public history are prerequisites.

## Next implementation order

1. Create the clean public Git history and perform a final tracked-object audit.
2. Tag the current frontend/reference verifier as `v0.1.0-beta`.
3. Build the minimal Adinals overlay and dual-read it against GorillaPool.
4. Publish the wallet-injected agent action package.
5. Add publisher moderation/reputation tools before promoting unrestricted
   collection discovery as trusted advertising inventory.
