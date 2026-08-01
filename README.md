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

The repository currently passes 27 browser/application Node test files, the
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

## Roadmap

1. Complete the remaining wallet-restart, image-lifecycle, and emergency-switch
   beta drills, then tag the reference application.
2. Submit successful wallet actions to the local overlay and run automated
   dual-read parity against GorillaPool/the current reader, then deploy the
   BRC-22/BRC-24/BRC-64 service in CARS shadow mode while retaining fallback.
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

## License

The repository's software and documentation are available under the
[MIT License](LICENSE). User-published creative content remains subject to its
own rights and responsibilities.
