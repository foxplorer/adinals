# BRC-100 compatibility and release matrix

This is the public release record for the production Adinals BRC-100 wallet
boundary. A TypeScript build alone is not compatibility: a passing action must
also preserve exact transaction bytes, signatures, output positions, custody,
and recovery behavior.

Last updated: 2026-08-02.

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
| Exact collection output verification | Pass | Pass; its extra funding input is accepted after the anchor rule was corrected |
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
- GorillaPool accepted a mint submission and still did not expose the record
  until the transaction confirmed, so an accepted-but-unexposed submission is
  frequently the expected outcome rather than a failure. The receipt now
  separates `submitted, public index pending` from `index submission
  unavailable` instead of calling both delayed. The submission retry
  window is about thirty seconds against a roughly ten-minute block interval.
  The same mint was queryable on the Adinals overlay immediately, unconfirmed.
- GorillaPool can return HTTP 200 for an exact listing output while its complete
  transaction/Atomic-BEEF endpoint still returns HTTP 404.
- A buyer in the same browser can reuse the seller's locally retained verified
  proof; another browser may need to wait for public proof delivery.
- In two cross-wallet vectors, the buyer update record appeared before
  GorillaPool exposed the intervening OrdLock purchase path. The creator inbox
  became actionable after block confirmation.
- Creator decision records indexed promptly once their referenced ownership
  transition was derivable.
- `abortAction` requires the reference `createAction` returned, and `listActions`
  never returns one, so an action whose reference is lost cannot be released
  through BRC-100 alone. Wallet-toolbox wallets accept reserved `listActions`
  labels that release no-send actions using the reference they hold internally.
- A no-send action reserves its funding input and its no-send change until it is
  published or aborted, while the wallet still counts both in its displayed
  balance. One abandoned collection rehearsal can therefore make most of a
  balance unspendable, which looks like a wallet fault and is not one.
- `createSignature` treats `data` and `hashToDirectlySign` as alternatives.
  Yours Wallet honours the supplied hash when both are sent; Metanet Desktop
  prefers `data` and signs a single SHA-256 of it. A Bitcoin sighash is a double
  SHA-256, so the resulting signature verifies against the wallet's own reported
  key while failing `OP_CHECKSIG`, which reads as a key or wallet fault and is
  neither. Send the sighash alone.
- Wallets do not preserve declared output or input positions. Reading the SIGMA
  fee reserve from output 0, or signing the anchor spend at input 0, works with
  Yours Wallet and fails against a wallet that adds its own funding. Both are
  now located by content rather than position.
- Yours Wallet funds a collection by spending only the sized SIGMA anchor, while
  Metanet Desktop adds its own funding input after it. Both are protocol-valid:
  version 3 anchors the signature to the outpoint spent at input 0 and ignores
  later inputs. A no-send audit that required exactly one input refused Metanet
  collections until it was narrowed to the anchor position.

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
| Signed-out immutable routes and embed availability | Live production pass |
| Emergency read-only switches | Automated pass; live operator drill pending |
| Public fixture/history sanitation | Pass; clean public repository and history published |
| Production lifecycle parity manifest | Two complete sale/update/approval vectors retained and passing against a populated overlay |
| Stable public API origin | Pending `api.adinals.com` before agent SDK release |
| Local overlay admission/history | Pass: clean confirmed v3 namespace replay admitted 69 transactions with zero failures |
| Local overlay restart/client smoke | Pass: required containers only; 11-transaction idempotent lifecycle replay and reusable-client exact lookup pass |
| Browser unconfirmed overlay submission | Pass: retained Ad #5 BEEF retried through Brave/Vite, LARS returned 200 in 573 ms, and exact hydrated output 0 was visible before confirmation |
| Browser dual-read parity | Pass in four consecutive local runs: 5 collections, 20 canonical ads, image byte hashes, and two deep lifecycle histories match |
| Confirmed external-spend reconciliation | Implemented and automated; four live scans each checked 20 current states with zero failures and no missing spends |
| Confirmed missed-mint backfill | Pass: Ad #4 was admitted as exactly one new transaction after confirmation and exact output 0 is hydrated |
| Scheduled shadow rounds | Implemented: `overlay:shadow` retains per-round reports, keeps failing transcripts, and exits non-zero; two clean rounds plus a verified failure round |
| Transition-type admission coverage | Pass on chain for collections, mints, listings, purchases, cancellation, updates, and decisions; plain transfers have unit coverage only, with no live mainnet vector yet |
| Cross-wallet purchase, update, and approval | Pass on the hosted node: bought with Yours, updated by the buyer, approved with Metanet, all resolving against the public reader |
| Image collections, mints, and updates | Automated only: a 150 KB parsing/SIGMA vector and image byte-hash parity; no recent live wallet run |
| CARS shadow deployment | Live: release `6cbe8de9` serves `tm_adinals`/`ls_adinals` over HTTPS, replayed the confirmed namespace, and passes full shadow rounds |
| Hosted cross-origin browser submission | Pass: a Metanet Desktop collection posted BEEF from Brave to the CARS node with no proxy and reached indexed |
| In-app overlay shadow read | Implemented and unit tested; compares the overlay against the rendered public reader in the background and never affects the view |
| Overlay-first reads | Not started: hydration and discovery remain on GorillaPool with the derived reader |
| Agent SDK/CLI/MCP interface | Not implemented |
| Publisher moderation/reputation layer | Not implemented |

The explicitly labeled open-source beta is live from the clean public repository.
Overlay and agent work are the next infrastructure phase rather than blockers
for the current beta.

## Next implementation order

1. Complete live restart recovery in Yours and Metanet, one image lifecycle,
   and an emergency-switch preview drill.
2. Tag the current frontend/reference verifier as `v0.1.0-beta`.
3. Keep the scheduled `overlay:shadow` rounds running locally and retain every
   divergence report; the live wallet-to-LARS canary, namespace parity, and
   confirmed reconciliation have already passed.
4. With a running Metanet Desktop wallet, create and fund a CARS mainnet
   project, set its identifier on the prepared `adinals-shadow` configuration,
   release the backend, replay the confirmed namespace into the new node, and
   require repeated clean remote shadow runs before moving the reader behind
   `api.adinals.com`.
5. Publish a read-only agent package, followed by wallet-injected write actions.
6. Add publisher moderation/reputation tools before promoting unrestricted
   collection discovery as trusted advertising inventory.

Use the canonical [overlay continuation handoff](OVERLAY.md#continuation-handoff)
when resuming implementation in a later coding session.
