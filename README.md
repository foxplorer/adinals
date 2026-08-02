# Adinals

[Live application](https://adinals.com) ·
[GitHub](https://github.com/foxplorer/adinals) ·
[MIT License](LICENSE)

Adinals is an open-source protocol explorer and BRC-100 wallet application for
finite, ownable live-content slots on Bitcoin SV. Creators define a collection,
mint its slots, and choose whether owner updates publish automatically or require
creator review. Owners can update, list, buy, and resell a slot without giving
Adinals their private keys.

The production application uses the exact MAP identity `app=adinals`,
`type=ord`, and `protocolVersion=3`.

> **Beta:** Mainnet actions use real BSV and create permanent public records.
> Protocol-valid content is not automatically safe, lawful, endorsed, or
> guaranteed display. Publishers retain final control.

## What is included

- Public collection discovery and immutable collection/ad routes.
- Text and image collections with finite capacities and permanent rules.
- BRC-100 collection creation, self-minting, owner updates, creator decisions,
  OrdLock listings, cancellation, and purchases.
- Independent browser verification of MAP, SIGMA, raw transactions, ownership
  transitions, owner epochs, duplicate slots, expiration, and collection rules.
- JSON collection/ad endpoints and a framework-neutral embed component.
- Recovery-aware no-send construction that avoids blindly retrying uncertain
  wallet actions.

## Wallet model

Adinals talks to wallets through the standard `WalletInterface` from
`@bsv/sdk`. Yours Wallet and Metanet Desktop receive the same BRC-100 calls and
the same transaction bytes; the application does not branch on wallet brand.

Production first negotiates the BRC-99 basket `p 1sat ordinals`, then falls back
to the portable `adinals` basket when a wallet does not implement that scheme.
Baskets track outputs; they do not determine private keys or recipient
addresses. Funding, key derivation, signatures, and custody remain inside the
connected wallet.

## Version 3 in brief

1. A creator-signed `collection` fixes capacity, format, approval mode, content
   policy, optional expiration, and creative limits.
2. The creator signs one numbered `collectionItem` for each finite slot.
3. The slot origin remains its permanent identity while its one-satoshi output
   advances through updates, transfers, listings, and purchases.
4. An `adUpdate` spends the exact current state at input 0, returns the state at
   output 0, and commits the complete creative record at output 1.
5. Creator-reviewed collections require a creator-signed `adDecision` tied to
   the exact update transition and owner epoch. Open collections do not.
6. Readers independently reconstruct custody and eligibility; publishers still
   choose what to display.

The exact record subtypes are `collection`, `collectionItem`, `adUpdate`, and
`adDecision`. Version 2 records remain historical and are not silently treated
as version 3.

## Run locally

Requirements: a current Node.js release supported by Vite 8 and a compatible
BRC-100 wallet.

```bash
npm install
npm run dev
```

The development server listens on port `5176`.

```bash
npm test
npm run build
npm run preview
```

The repository currently passes 32 browser/application Node test files, the
independent collection script/fixture verifier, the backend overlay suite,
TypeScript compilation, and the production Vite build.

## Environment switches

Production is the default. These variables are explicit operator controls:

| Variable | Purpose |
| --- | --- |
| `VITE_ADINALS_ENV=development` | Use the isolated development namespace. |
| `VITE_ENABLE_COLLECTION_PUBLISH=false` | Emergency read-only switch for collection creation. |
| `VITE_ENABLE_LIFECYCLE_PUBLISH=false` | Emergency read-only switch for mint/update/market actions. |
| `VITE_ADINALS_API_BASE` | Override the derived JSON reader base URL. |
| `VITE_ADINALS_EMBED_SCRIPT_URL` | Override the hosted web-component URL. |
| `VITE_ADINALS_OVERLAY_URL` | Enable browser overlay delivery at an explicit endpoint; local Vite development defaults to `http://localhost:8080`. |

Do not change the production namespace, key protocol, basket, or action labels
casually; existing wallet custody and public records depend on them.

## Public reading and embedding

The hosted reader currently uses this base URL:

`https://tenmillionfoxes-99288f417d7b.herokuapp.com/adinals/v1`

It exposes:

- `https://tenmillionfoxes-99288f417d7b.herokuapp.com/adinals/v1/collections/{origin}/live`
- `https://tenmillionfoxes-99288f417d7b.herokuapp.com/adinals/v1/ads/{origin}`

Those are reader-service routes, not relative routes on `adinals.com`. The web
application and embed component use the configured `VITE_ADINALS_API_BASE`.
A stable `api.adinals.com` origin is planned before publishing the agent SDK.

Consumers must check `displayEligible`. Render text as text rather than HTML,
treat destination URLs as untrusted external links, and keep a local fallback
for temporary reader outages. The supplied `public/adinals-embed.js` component
supports both text and image creatives.

## Current infrastructure boundary

The browser currently uses GorillaPool for record discovery, spend history, and
index submission, with WhatsOnChain/raw transaction checks for independent
verification. A successful index-submission response does not prove an output
is already queryable, so the UI verifies exact outpoints separately.

Explicit inscription records often appear before confirmation. Cross-wallet
purchase history can lag until the next block because the indexer may expose a
listing or update before it exposes the intervening spend chain and owner epoch.
The application labels these states as provisional and never approves an update
whose ownership path cannot yet be proven.

An experimental local LARS overlay is now included under `backend/`. Its topic
manager and lookup resolver replay the confirmed production version 3
namespace, including OrdLock listing/purchase classification, owner epochs,
updates, creator decisions, full history, current creative, collection-wide
live proof sets, and pending-decision resolution. A clean 2026-08-01 replay
admitted 69 transactions spanning five collections, 18 mints, 38 lifecycle
transitions, and eight decisions with no failures or unresolved confirmed spend
links. It is not deployed publicly or used by the production browser yet;
GorillaPool remains the live discovery path.

The browser write path now queues every wallet-accepted collection and
lifecycle transaction to the local overlay using the same verified Atomic
BEEF. It treats submit as a processing acknowledgment, polls exact hydrated
outputs, persists provisional/indexed/retrying/failed delivery state, and
retries outages without changing the wallet action's success. Updates require
both state output 0 and record output 1. Local Vite development uses
localhost:8080; production builds require an explicit HTTPS overlay URL and
therefore never call a visitor's localhost. The live wallet-to-LARS canary has since
passed, and GorillaPool remains the production discovery and fallback path
until a deployed shadow node has been replayed and observed without unexplained
divergence.

The 2026-08-02 local checkpoint has only the required Adinals MySQL, Mongo, and
overlay containers running. Health and service registration pass, the populated
production-fixture smoke replay remains idempotent with 11 already-present
transactions and a 19-output collection-live proof, and the reusable client
passes a live duplicate submit plus hydrated exact-output lookup. No new wallet
transaction was created or broadcast for that check.

The frontend proof adapter now reconstructs semantic state from hydrated
overlay formulas while a separate adapter normalizes the current public reader.
Four consecutive `npm run overlay:parity` runs pass across all five discovered
collections and 20 canonical ads: live membership, current outpoints and owners,
proposal state, creative text or image bytes/source, collection rules,
expiration, and display eligibility agree with the current public reader. The
two retained complete vectors also match ownership history, owner epoch, and
final listing state. This remains shadow validation and does not switch
production reads.

`npm run overlay:shadow` runs parity and confirmed reconciliation together as
one repeatable shadow round, retains a JSON report per round plus an appended
history line, keeps the exact transcript of any failed command, and exits
non-zero on a divergent or unreachable overlay. Two scheduled rounds on
2026-08-02 were clean, and a deliberately failing overlay was recorded as
divergent with both transcripts retained.

`npm run overlay:reconcile` is the confirmed-only recovery path for marketplace
spends created elsewhere or writes missed when a browser closes. It combines
independently proven predecessor/spender transactions, submits through the
normal Topic Manager, and waits for exact successor visibility. Its first full
live pass checked all 18 current states with zero failures and no missing
confirmed spends. Unconfirmed spends are deliberately left to immediate browser
submission or a later confirmed pass.

The first real local browser attempt minted production Ad #4 at
`4eeb833ffd469fb9952385d7659f9c1a63fc36658c9d2c3d7ab2298ebab4c7e0_0`.
The wallet broadcast and GorillaPool/public-reader checks passed, increasing
the public namespace inventory to 19 mints, but LARS exact lookup remained
empty and received no `/submit` for that transaction. The canary therefore has
not passed. The main receipt now displays local-overlay state separately from
GorillaPool indexing and follows background queue transitions; reload the local
client before the next check. Startup now also recreates a missing queue entry
from the accepted publication record and retained Atomic BEEF, without relying
on a public indexer or weakening overlay validation. A second hard refresh did
not recover this live mint, so immediate browser delivery remains an open
defect. A scoped confirmed-only backfill passed with 16 existing transactions
and zero failures; it correctly skipped still-unconfirmed Ad #4 and remains the
eventual recovery path after confirmation.

Local development now routes overlay calls through the same-origin
`/adinals-overlay` Vite proxy to port 8080. The accepted publication path awaits
its first delivery cycle and reports the actual overlay result, avoiding a
silent fire-and-forget request while preserving wallet success.
The first post-proxy refresh found no retained Ad #4 queue/BEEF row to replay,
so that existing mint still awaits confirmed backfill and does not count as a
successful browser proxy canary.

Ad #5 then exposed the browser-only cause: native `fetch` was invoked with the
overlay client as its receiver, and Brave rejected it as an illegal invocation
before HTTP. The client now invokes `globalThis.fetch` through a wrapper, with
a regression test. Ad #5's BEEF remains in the durable retry queue.

The retained retry then passed without another transaction: Brave submitted
the 2,329-byte BEEF through the same-origin proxy, LARS responded in 573 ms,
and exact output 0 became visible with hydrated BEEF before confirmation. The
live immediate browser-to-overlay canary is now complete.
After confirmation, the scoped backfill admitted Ad #4 as exactly one new
transaction with zero failures, and LARS now returns its exact output 0 with
hydrated BEEF. Confirmed eventual recovery is therefore proven. Both canary
mints are now confirmed and public, so the confirmed namespace is five
collections, 20 mints, 38 lifecycle transitions, 12 sibling updates, and eight
decisions.

A CARS shadow node is now deployed at
`https://backend.93913ed6b421f18f80e669c61239a690.projects.babbage.systems`.
`npm run overlay:cars:preflight` verifies offline that the packaged backend has
no import outside `backend/src` and no undeclared dependency, and
`npm run overlay:cars:build` writes only a local artifact. Because a cloud node
starts with an empty database, releasing it was not the last step: the confirmed
namespace was replayed into it and verified with the same shadow harness the
local node uses. It matches the public reader across every discovered
collection and canonical ad, and reconciliation reports no missing confirmed
spends. GorillaPool remains the production discovery and fallback path.

Reads have not moved. The product still hydrates from GorillaPool and the
derived public reader; the overlay is a write path plus a background comparison.
Opening a collection now schedules one shadow read that projects the same
collection from the overlay and records whether it agrees, without affecting
anything on screen. Overlay-first hydration and discovery are later stages
described in [OVERLAY.md](OVERLAY.md); creative images will keep loading from
public content hosts, with the overlay supplying the hash that makes them
verifiable.

Browser overlay delivery now targets that node. A Metanet Desktop collection
published from local development posted its BEEF cross-origin over HTTPS with
no proxy and reached `indexed`, while the local LARS node correctly holds
nothing for it. `.env.production` is committed so a static host without
dashboard environment variables still builds with the endpoint configured; a
local `.env` overrides it and stays out of Git. Overlay reads remain
unchanged: the product still reads through the derived public reader.

## Roadmap

1. Complete the remaining wallet-restart, image-lifecycle, and emergency-switch
   beta drills, then tag the reference application.
2. Fund a CARS project, release the prepared BRC-22/BRC-24/BRC-64 shadow node,
   replay the confirmed namespace into it, and keep the scheduled parity and
   reconciliation rounds running against both nodes while retaining fallback.
3. Publish a read-only typed SDK/CLI or MCP interface against a stable
   `api.adinals.com` origin, then add wallet-authorized actions through an
   injected BRC-100 `WalletInterface`; never accept seeds, WIFs, or mnemonics.
4. Add publisher moderation, reputation, scam warnings, and clearer separation
   between protocol-valid, collection-approved, and publisher-featured content.
5. Consider BRC-121 HTTP 402 payments only for hosted services such as
   high-availability history, proof delivery, moderation, analytics, and relays.
   Direct wallet actions and independent verification should remain permissionless.

See [BRC100_COLLECTION_MATRIX.md](BRC100_COLLECTION_MATRIX.md) for the current
wallet compatibility and release gates, and [OVERLAY.md](OVERLAY.md) for the
local LARS, lifecycle-indexing, parity, and CARS deployment plan. The
[continuation handoff](OVERLAY.md#continuation-handoff) is the canonical prompt
for resuming implementation without reconstructing the current state.

## Public fixture policy

Only synthetic vectors or transactions already irreversibly public on mainnet
may be committed. Never commit private keys, seeds, mnemonics, wallet identity
keys, wallet-local action references, or a signed unbroadcast transaction
package. A complete no-send Atomic BEEF can itself authorize a broadcast even
when it contains no private key.

The retained production lifecycle manifest in
`tests/fixtures/overlay/production-lifecycle-b70c33ad.json` contains public
outpoints and expected derived state only. It deliberately excludes raw
transactions, Atomic BEEF, and wallet-local routing data.

Two infrastructure identifiers are committed on purpose: the overlay's HTTPS
endpoint in `.env.production` and its CARS project identifier in
`deployment-info.json`. Neither is a credential. Browsers reveal the endpoint
whenever they deliver a transaction, the overlay is a public read/submit service
by design, and every administrative CARS operation is authorized by a wallet
identity rather than by knowing the project's name. Generated server keys, ARC
credentials, database state under `local-data/`, shadow reports, and every other
`.env` file stay out of Git.

## License

The repository's software and documentation are available under the
[MIT License](LICENSE). User-published creative content remains subject to its
own rights and responsibilities.
