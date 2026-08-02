# Adinals overlay development

This document is the implementation and deployment plan for the Adinals
BRC-22/BRC-24/BRC-64 overlay. The overlay is a validated discovery and history
service, not protocol authority. Bitcoin transaction validity, spend-linked
custody, collection rules, and signatures remain authoritative.

## Delivery order

1. Run one overlay locally with LARS.
2. Make its topic manager and lookup service pass the retained production
   lifecycle vectors.
3. Submit every successful Adinals wallet action to the local overlay and
   compare its answers with GorillaPool and the current public reader.
4. Add confirmed-transaction reconciliation for spends created outside the
   Adinals application.
5. Deploy one production node with CARS only after local parity passes.
6. Keep GorillaPool/raw-transaction fallback during production shadow testing.
7. Add SHIP/SLAP advertisements and GASP synchronization when another
   compatible Adinals node exists; a second node is not required for the beta.

No public push or CARS deployment is required while the local implementation is
incomplete.

## Current implementation status

As of 2026-08-02, `@bsv/lars` 1.5.8 is installed in the root development
dependencies. The repository contains `deployment-info.json` plus an isolated
`backend/` package registering `tm_adinals` and `ls_adinals`. The first local
configuration runs the backend only on BSV mainnet. A second, prepared
`adinals-shadow` CARS configuration now exists with no project identifier, so
its release commands fail closed until an operator deliberately creates and
funds a project.

The topic manager now admits valid production `collection` outputs after
independently checking the canonical inscription and MAP envelope, exact
namespace/version/subtype, standard SIGMA signature, and permanent collection
rules. It rejects the development namespace, changed signed bytes, invalid
rules, unrelated transactions, and malformed BEEF in backend tests. It also
admits signed, locally valid mint and decision candidates plus input-0-linked
listings, purchases, cancellations, ordinary P2PKH transfers, and updates. The
marketplace gate recognizes the exact pinned OrdLock contract and payout; the
update gate admits the same-owner successor at output 0 and signed sibling
record at output 1. The retained production chains pass these gates end to end.

The lookup resolver returns a mint only after matching its signer, format,
slot, and creative limits to a verified collection; confirmed duplicate slots
use block/transaction order, while multiple unconfirmed claims are
quarantined. The `history` query now follows retained `spentByTxid` links,
verifies each input-0 successor, derives owner epochs, validates updates against
collection and owner state, requires the collection creator for decisions, and
quarantines conflicting creator verdicts. Full live-creative and publisher
eligibility JSON remains in the separate reader layer, but the overlay now
returns the complete proof formulas for `adCurrent` and `collectionLive`. Do
not interpret a healthy server as full browser-reader parity.

The server parser deliberately has no runtime dependency on `@1sat/templates`.
That package's transitive `@1sat/types` release currently uses an extensionless
ESM import that Vite bundles but Node 22 cannot execute directly. The backend
therefore decodes the small canonical `ord` and MAP script envelopes itself,
with the already-public signed mainnet-development fixture as an independent
SIGMA conformance vector.

The lookup scaffold requests whole-transaction admission and spend
notifications and preserves spent rows by annotating them rather than deleting
them.

The first local LARS launch completed its image build and registered both
services. `GET /health`, `/listTopicManagers`, and
`/listLookupServiceProviders` respond on localhost. The status lookup returns
an empty `LookupFormula` because Overlay lookup services always return arrays
of verifiable output references; service phase/version is metadata, not
free-form lookup JSON.

The browser write path is now connected in code. `src/overlay/client.ts`
provides one typed client for binary `/submit` and versioned `/lookup` calls.
Every collection and lifecycle publication that the wallet classifies as
accepted queues the same locally verified Atomic BEEF for `tm_adinals`; updates
poll both the state output at index 0 and sibling update record at index 1.
Spend-linked action BEEF is built with its immediate predecessor as the wallet
`inputBEEF`, so the overlay receives the evidence required by the Topic
Manager rather than a raw current transaction alone.

Overlay delivery is deliberately downstream of wallet success. IndexedDB
version 5 adds an `overlay-submissions` queue keyed by exact outpoint, records
`provisional`, `indexed`, `retrying`, and `failed` states, accepts empty
admission instructions on an idempotent duplicate, and verifies hydrated
lookup BEEF against the expected txid and output index. A STEAK response is
only a processing acknowledgment: the client polls every required exact output
for up to ten seconds. Network outages and delayed storage are retained for an
exponential, capped retry; application startup replays due entries. Overlay
unavailability never changes an already accepted wallet publication into a
failed action.

Local Vite development defaults to `http://localhost:8080`. Production builds
do not contact a visitor's localhost and only enable the overlay when
`VITE_ADINALS_OVERLAY_URL` explicitly names the future HTTPS shadow endpoint.
The developer publication panels expose the initial local overlay state, and
all queue transitions are persisted and emitted as `adinals-overlay-status`
browser events. The first live attempt missed LARS, but the repaired Ad #5
retry subsequently passed end to end as recorded below.

Local browser delivery now uses the same-origin `/adinals-overlay` Vite proxy,
which forwards to LARS on port 8080 and removes cross-origin/private-network
browser policy from this boundary. Queue creation also awaits the first full
submit and exact-output polling cycle, returning its actual status to the
receipt without changing the accepted wallet result. The proxy passes a live
exact lookup and the Ad #5 browser submit canary.

The subsequent hard refresh reached the updated client but still emitted no
`/submit` for Ad #4. Its original browser session therefore has no recoverable
queue/BEEF row for this mint. The proxy transport is independently live, but
the existing transaction cannot be used as its browser-submit proof unless its
Atomic BEEF is recovered; confirmed backfill remains its safe recovery path.

The next live mint, Ad #5
`b660c95f9e38ee369769bf7c9b89efb4f45899f048a3c9133175c26dc23ba91c_0`,
proved the durable queue and exposed the exact transport defect: Brave stored
`Failed to execute 'fetch' on 'Window': Illegal invocation`. The overlay client
had retained native `fetch` as an object method, changing its required browser
receiver when invoked. It now calls `globalThis.fetch` through a wrapper. A
browser-receiver regression test and the production build pass; the retained
Ad #5 queue can retry without another wallet transaction.

That retained retry then passed end to end without another transaction. Brave
POSTed the 2,329-byte Atomic BEEF through the same-origin Vite proxy, LARS
returned HTTP 200 in 573 ms, the browser issued the exact-output lookup, and
`b660c95f9e38ee369769bf7c9b89efb4f45899f048a3c9133175c26dc23ba91c_0`
is visible with hydrated BEEF while unconfirmed. The live immediate browser
submission canary is therefore **pass**.

After Ad #4 confirmed, the same scoped backfill admitted exactly one new
transaction, reported 16 already present and zero failures, and exact lookup
returned output 0 with hydrated BEEF. This closes recovery for the missed mint
and proves eventual confirmed ingestion; it does not retroactively pass the
unconfirmed browser-submit canary.

`src/readers/overlayReader.ts` is the first frontend proof adapter. It hydrates
every lookup formula, rechecks transaction IDs and output indexes, verifies MAP
and SIGMA records, recognizes custody locks, follows input-0 ownership links,
derives current owner and owner epoch, carries listing terms, resolves proposal
status and creative source, and applies collection expiration. It does not
replace the existing reader: `src/readers/derivedApiReader.ts` normalizes the
current public JSON response for shadow comparison, and every disagreement or
overlay outage leaves the current reference path authoritative.

`npm run overlay:parity` bundles the browser verifier before running it so the
known extensionless Node ESM import in `@1sat/templates` does not leak into the
Node 22 command boundary. On 2026-08-02 two consecutive namespace-wide live
passes matched the current reader across five collections and 18 canonical ads:
live collection membership, slots, current outpoints, owners, proposal states,
creative text or image bytes/source, collection rules, expiration, and display
eligibility all agree. The two retained complete chains additionally match
every ownership outpoint, owner epoch, final listing state, and reviewed
creative. The comparison preserves expired membership in the deep overlay
projection while matching the public `/live` route's intentional empty display
set for an expired collection.

That namespace run found one frontend decoder drift before passing: a valid
pinned OrdLock listing was accepted by the backend but the browser template
decoder returned null. `src/protocol/scriptTemplates.ts` now performs the same
byte-length, suffix-hash, seller, price, and payout-script checks at the browser
boundary, with regression tests. No broader script shape was admitted.

Confirmed external-spend reconciliation is now a separate cron-friendly
command, `npm run overlay:reconcile`. It enumerates current states from the
overlay, asks GorillaPool only for spend discovery, requires txid-checked
confirmed proofs for both the predecessor and spender, combines them into valid
BEEF, submits through the normal fail-closed Topic Manager, and polls exact
successor output 0. Unconfirmed spends remain untouched. Its automated suite
covers successful ingestion, exact-output delay, idempotency, and partial
reader outage. The first full live pass checked all 18 current states with zero
failures and found zero missing confirmed spends to submit.

`npm run overlay:shadow` is the repeatable shadow-period harness. It checks
`/health`, runs parity and confirmed reconciliation in the same round even when
the first one fails, and writes one report per round to `reports/overlay-shadow/`
plus an appended `history.jsonl` summary line. Clean rounds retain only their
JSON summaries; a failing round retains the exact stdout and stderr of every
failed command, including the parity divergence dump. `--rounds` and
`--interval` make one cron entry or one long local watch equivalent. An
unreachable overlay is recorded as `overlay-unavailable` rather than silently
skipped, and any non-clean round exits non-zero.

On 2026-08-02 the local shadow period recorded four consecutive clean parity
runs and four clean reconciliation runs: two manual pairs and two scheduled
harness rounds two minutes apart. Both live canary mints are now confirmed and
public, so parity now covers 5 collections and 20 canonical ads, with the
retained collection at 5 ads in both the overlay and the current public reader.
Every reconciliation pass checked 20 current states and found zero confirmed
external spends to submit and zero failures. The harness failure path was
verified separately against a simulated overlay that answered `/health` and
failed every other request: the round was recorded as `divergent`, both command
transcripts were retained, and the command exited non-zero. Report files stay
out of Git; only their summaries belong in this document.

The first real browser canary on 2026-08-02 minted production Ad #4 at
`4eeb833ffd469fb9952385d7659f9c1a63fc36658c9d2c3d7ab2298ebab4c7e0_0`
in collection
`b70c33ad75c6588826bfdb0cee0f9ed5aedc39b7856232f2b13a69f57e8f6ed2_0`.
The wallet reported an accepted broadcast and GorillaPool plus the public
reader returned the exact live record. A namespace dry run consequently found
19 mints instead of 18. LARS exact-output lookup remained empty, however, and
its request log contained no `/submit` for this transaction. This is a failed
overlay-delivery canary, not an admission rejection. The confirmed-spend
reconciler correctly did not manufacture recovery for an unconfirmed mint and,
because it begins from overlay-known current states, is not mint discovery.

The main product receipt now reports the independent local-overlay status in
addition to GorillaPool status and listens for persisted queue transitions. If
an enabled local build returns without a queue record it shows `not-queued`;
otherwise it advances through `provisional`, `indexed`, `retrying`, or `failed`.
This removes the UI ambiguity exposed by the first attempt. The production
build and all 32 application test files pass after that observability change.
The first hard refresh confirmed that no queue entry had been retained. Startup
recovery now also joins wallet-accepted collection/lifecycle publication rows
to their retained rehearsals and recreates any missing queue entry from the
original Atomic BEEF. Existing queue keys are left untouched, so this repair is
idempotent and does not weaken admission. A second hard refresh still produced
no `/submit`, so the live browser recovery join is not yet proven and the
immediate-delivery defect remains open.

An idempotent backfill scoped to this collection then found one collection,
four mints, nine lifecycle transitions, three updates, and three decisions. It
reported 16 already-present confirmed transactions with zero failures. Ad #4
was still unconfirmed and was therefore correctly skipped by the confirmed-only
backfill. This proves the existing collection history remains consistent, not
that the new mint has reached LARS; after confirmation, the same backfill is the
independent eventual-recovery path.

LARS reserves ports 8080 (overlay), 8081 (optional Adminer), and 8082 (optional
Mongo Express). On 2026-08-02 SkateSV occupied 8080 and old Space
Payments/template UI containers occupied 8081 and 8082. Those three old-project
containers were stopped without deleting their data. Adinals now runs only
`overlay-dev-container` plus its MySQL and Mongo dependencies; the optional UI
ports remain free.

The live HTTP smoke test proves rejection, record admission, lifecycle
admission, exact output retention, and idempotency:

- the already-public `adinals-brc100-test` Atomic BEEF returns no admitted
  outputs; and
- the proof-anchored production collection
  `b70c33ad75c6588826bfdb0cee0f9ed5aedc39b7856232f2b13a69f57e8f6ed2_0`
  returns `outputsToAdmit: [0]` and is returned by collection and exact-output
  lookup as hydrated, txid-checked BEEF.

The 2026-08-02 restart returned `status: ok`, registered `tm_adinals` and
`ls_adinals`, and passed the populated smoke replay with zero new and eleven
already-present transactions. Both semantic histories, both current creative
proofs, the 19-output `collectionLive` formula, and empty resolved pending
decision set were reverified. The new reusable browser client was also run
directly against localhost: it resubmitted the already-public indexed
collection as an idempotent duplicate (`outputsToAdmit: []`) and independently
confirmed its hydrated exact output as visible.

Both retained production ads now replay from mint through listing, purchase,
update, and creator decision. On a clean database each mint, listing, purchase,
and decision admits output 0; each update admits outputs 0 and 1; every
spend-linked transition returns input 0 in `coinsToRetain`. A second full run
reported zero new and eleven already-present transactions while verifying every
retained outpoint. Each production `history` query returns exactly seven
semantically resolved outputs: collection, mint, listing, purchased state,
updated state, sibling update record, and creator decision.

Each production `adCurrent` query returns the complete seven-output reviewed
proof set: collection, every ownership state from mint through update, live
update record, and approving creator decision. The production `collectionLive`
query deduplicates the two retained fixture histories into 13 outputs. After
the confirmed namespace backfill adds Ad #1, the same query returns 19 outputs
and still contains every fixture proof. Its pending-decision query is empty
because the discovered production updates are already decided, while a positive
synthetic test proves an undecided current-epoch owner update is returned with
its supporting collection and custody chain.

The repeatable confirmed backfill now discovers the complete production v3
namespace exposed by GorillaPool. The 2026-08-01 clean replay found five
collections, 18 mint origins, 38 lifecycle transitions, 12 sibling update
records, and eight decisions. Updates are part of the lifecycle-transition
count, so this is 69 submitted transactions rather than 81. All 69 were newly
admitted on an empty local database with zero failures and no unresolved
confirmed spend links. An immediate repeat reported zero new, 69 already
present, and zero failures.

That replay caught two implementation defects before deployment. Large image
inscriptions were appended with JavaScript spread syntax and could overflow the
argument stack; parsing now iterates their bytes and has a 150 KB regression
vector. A pre-fix mint also proved that creator SIGMA authority and initial
spend-lock ownership may use different keys. Mint authority still comes from
the collection creator signature, while custody now comes from the one
unambiguous executable P2PKH lock embedded in the inscription script.

Unit coverage also proves open updates need no decision, disapproval
leaves the prior mint creative live, a new owner epoch resets creative to the
mint, conflicting decisions are quarantined, and expiration changes display
eligibility without deleting state.

Raw transaction hex alone is intentionally insufficient for `/submit`; the
engine rejected it until a confirmed GorillaPool BUMP was attached. A current
transaction's proof also makes its inputs redundant to the SDK's normal BEEF
serializer, but lifecycle classification still needs the immediate predecessor
script. Reconciliation therefore submits a valid regular BEEF containing the
separately proven predecessor and current transaction. The Topic Manager reads
that predecessor directly from the BEEF transaction set and rejects a topical
spend if the evidence is absent.

OverlayExpress invokes its STEAK callback before its storage mutations and
lookup notifications have necessarily completed. `/submit` success therefore
does not mean an immediate `/lookup` in the same event-loop turn will succeed.
The smoke runner polls the exact admitted outpoint for at most ten seconds
before submitting a dependent transaction. In normal local tests the delay is
only a fraction of a second.

In the current `@bsv/overlay` engine, returning empty admission instructions is
not the rejection signal: the transaction can still be recorded as applied and
an evidence-enriched retry will then be treated as a duplicate. `tm_adinals`
therefore throws for a well-formed transaction with no admissible Adinals
evidence, and also throws when `previousCoins` names a topical input whose
source transaction is absent from the submitted BEEF. A real topical spend
whose evidence is complete can retain its predecessor even if its unknown
successor shape is not admitted.

Run `npm run overlay:smoke` while localhost:8080 is live to replay both public
production lifecycle fixtures without creating or broadcasting a transaction.
An idempotent repeat may report no newly admitted outputs and must still return
every exact txid-verified output.

Local commands from the repository root are:

```sh
npm install --prefix backend
npm run overlay:typecheck
npm run overlay:test
npm run overlay:config
npm run overlay:start
npm run overlay:backfill -- --dry-run
npm run overlay:backfill
npm run overlay:smoke
npm run overlay:parity
npm run overlay:reconcile
npm run overlay:shadow -- --rounds=4 --interval=900
npm run overlay:cars:preflight
npm run overlay:cars:config
npm run overlay:cars:build
```

`overlay:shadow`, `overlay:parity`, and `overlay:reconcile` all honor
`ADINALS_OVERLAY_URL`, so the same commands verify a remote shadow node once one
exists. `overlay:cars:preflight` and `overlay:cars:config` are offline;
`overlay:cars:build` only writes a local artifact file. None of them contacts a
CARS Cloud, creates a project, or uploads a release.

LARS 1.5.8 starts on localhost by default; use its explicit `--with-ngrok` flag
only when a public development tunnel is actually wanted. `overlay:start`
requires Docker and Compose and may ask for server/provider key configuration.
Starting it is a separate step; dependency installation and unit tests do not
launch containers or expose a public tunnel.

## Repository layout

LARS runs from this repository root. The existing Vite application remains at
the root and continues to run on port `5176`; overlay code belongs in an
isolated backend package:

```text
deployment-info.json
backend/
  package.json
  tsconfig.json
  src/
    protocol/
    topic-managers/AdinalsTopicManager.ts
    lookup-services/AdinalsLookupServiceFactory.ts
    lookup-services/AdinalsStorage.ts
src/
  overlay/lifecycleParity.ts
tests/
  fixtures/overlay/
```

The backend must consume the same frozen version 3 validation rules as the
browser. A server copy must not drift silently: shared conformance vectors and
matching tests are mandatory, and extracting a shared protocol package is
preferred before production deployment if direct reuse is not reliable under
the CARS build boundary.

LARS 1.5.8 generates its overlay container by copying `backend/src` to
`/app/src`; it does not copy this repository's root `src`. A backend import such
as `../../src/protocol/...` may work on the host and then fail inside LARS.
Until a shared package is included in the generated build, server adapters live
under `backend/src/protocol` and must be checked against the root validator by
the same public conformance fixtures.

Generated LARS state, server keys, ARC credentials, ngrok configuration,
database files, and `local-data/` never belong in Git.

## Local HTTP boundary

OverlayExpress listens on `http://localhost:8080` under LARS.

### Submit

```http
POST /submit
Content-Type: application/octet-stream
x-topics: tm_adinals

<BEEF bytes>
```

Every successful collection, mint, update, decision, listing, cancellation,
purchase, and ordinary transfer performed through Adinals should submit its
verified transaction package to this endpoint. The wallet remains responsible
for keys and authorization.

### Lookup

```http
POST /lookup
Content-Type: application/json

{
  "service": "ls_adinals",
  "query": {
    "type": "ad",
    "origin": "<immutable-origin>"
  }
}
```

The generic path and envelope are provided by OverlayExpress. Adinals defines
and versions the query object. Initial query types are:

- `collection` by immutable origin;
- `collectionLive` by immutable origin;
- `ad` by immutable origin;
- `collections` with deterministic pagination;
- `collectionsByCreator`;
- `adsByOwner`;
- `pendingDecisions` by creator; and
- `history` by immutable ad origin.

Health and service discovery are available at `/health/live`, `/health/ready`,
`/health`, `/listTopicManagers`, and `/listLookupServiceProviders`.

During local development, the HTTP Vite application may call localhost. The
production HTTPS application must use the future CARS HTTPS endpoint or
`api.adinals.com`, never a localhost URL.

## Topic admission

`tm_adinals` validates complete BEEF and fails closed. Topic membership means
"credible Adinals evidence," not final display eligibility. It admits only
exact, case-sensitive production records using `app=adinals`, `type=ord`, and
`protocolVersion=3`, plus locally valid successor states that spend an
already-admitted Adinal. The lookup resolver performs cross-record validation
before an output is exposed as a valid collection, mint, decision, or live ad.

| Transition | Outputs to admit | Previous inputs to retain |
| --- | --- | --- |
| Collection | Creator-signed collection record | None |
| Mint | Signed, locally valid `collectionItem` candidate | None |
| Listing | Recognized OrdLock output 0 | Adinal input 0 |
| Purchase | Buyer-controlled successor at output 0 | Listing input 0 |
| Cancellation | Seller-controlled successor at output 0 | Listing input 0 |
| Transfer | New-owner successor at output 0 | Adinal input 0 |
| Update | Same-owner successor output 0 and `adUpdate` output 1 | Adinal input 0 |
| Decision | Signed, locally valid `adDecision` candidate | None |

For every spend-linked transition, input 0 must spend the exact current state.
Listings must decode as the recognized OrdLock contract. Purchases must execute
the purchase path and reproduce the encoded seller payout. Cancellations must
execute the seller path. Updates must preserve the owner at output 0 and bind
the sibling update at output 1. Unknown spend shapes are not interpreted as
valid marketplace or update events.

The Topic Manager receives `previousCoins`, the input indices that spend
previously admitted outputs. Returning those indices in `coinsToRetain`
preserves the historical chain required for BRC-64 lookup and GASP sync.
`identifyNeededInputs` should be implemented for historical ingestion so a
candidate successor can name the topical predecessors its validation requires.

### Version 3 cross-record boundary

A version 3 mint or decision names its collection origin in MAP metadata but
does not spend that collection output. BRC-22 gives a Topic Manager the current
BEEF and `previousCoins`; `identifyNeededInputs` can request actual transaction
inputs, not arbitrary metadata references. A stateless manager therefore
cannot prove the mint signer equals the referenced collection creator unless
that separate evidence happens to be bundled.

The deterministic v3 overlay consequently separates candidate admission from
semantic resolution:

- the Topic Manager checks the complete BEEF, exact record envelope, SIGMA,
  subtype-local fields, and spend-linked ancestry available in
  `previousCoins`;
- the Lookup Service stores candidate evidence but resolves referenced
  collection rules and creator authority before returning protocol-valid or
  live results;
- unresolved, conflicting, wrong-creator, and duplicate-slot candidates remain
  quarantined and never become display-eligible; and
- network/indexer lookups are reconciliation inputs, not hidden dependencies
  inside Topic Manager consensus.

Collections need no prior protocol record, so their full admission gate is
self-contained. A future protocol version could make other record
relationships UTXO-linked, but version 3 must be indexed according to the
records already on chain.

## Lookup and storage behavior

`ls_adinals` uses:

- `admissionMode = "whole-tx"`, so admission callbacks receive Atomic BEEF;
- `spendNotificationMode = "whole-tx"`, so a spend can be classified as a
  listing, purchase, cancellation, transfer, or update; and
- idempotent upserts keyed by transaction ID and output index.

Unlike a simple current-UTXO index, `outputSpent` must not delete Adinals
history. It marks the previous state spent, records the consuming transaction,
classifies the event, and links the successor. Legal eviction remains separate
from ordinary spending.

The first storage model should distinguish:

- immutable protocol records;
- permanent collection and Adinal origins;
- every ownership-state outpoint;
- listings and their terms;
- lifecycle events and their consuming transactions;
- updates and creator decisions;
- derived current state; and
- reconciliation status and last verified chain height.

Lookup answers return verifiable output references/BEEF through the overlay
engine. Derived JSON for embedders and agents remains a separate reader layer
that reuses the same protocol resolver and reports its evidence source.

## Ingestion and missing transactions

A single overlay sees a transition when the transaction is submitted to its
topic, synchronized from a compatible peer, or found by reconciliation. It does
not automatically learn every external 1Sat Market spend.

The beta therefore uses three paths:

1. **Immediate:** every Adinals action posts its verified BEEF to `/submit`.
2. **Reconciliation:** periodically follow known outpoint spends through
   GorillaPool and independently verify raw transactions before ingestion.
3. **Federation later:** use SHIP/SLAP discovery and GASP synchronization after
   another node supports `tm_adinals` and `ls_adinals`.

Missing or contradictory evidence produces a provisional/degraded response,
never an invented owner or creative. The overlay must be rebuildable from
public confirmed transactions.

### Historical backfill

The overlay does not need a fresh protocol launch. The repeatable
`scripts/overlay-backfill.ts` command reconstructs confirmed version 3 history
already on chain:

1. discover collection, mint, update, and decision candidates through
   GorillaPool searches;
2. fetch each candidate's confirmed raw transaction plus BUMP, verify its txid,
   and submit proof-anchored BEEF; every spend package must also contain its
   separately proven immediate predecessor transaction;
3. process collections before mints, then resolve all known Adinal spend chains
   to recover listings, purchases, cancellations, transfers, and updates;
4. submit decisions after their update transitions; and
5. compare the rebuilt state with the retained production lifecycle manifest
   and current reader.

Discovery rows do not grant admission. Every fetched transaction passes the
same local topic and lookup gates as a newly submitted transaction. Confirmed
history is recoverable; a transaction that was never confirmed and has fallen
out of every mempool has no durable protocol state to restore.

Use `npm run overlay:backfill -- --dry-run` to inventory the full namespace
without submitting anything. Add `--collection=<immutable_outpoint>` to scope
either a dry run or replay to one collection. The non-dry command is idempotent:
it polls exact output lookup after each STEAK response before submitting a
dependent spend.

## Parity gates

The retained fixture
`tests/fixtures/overlay/production-lifecycle-b70c33ad.json` covers two public
mainnet mint → listing → purchase → update → approval chains. Before CARS, the
local overlay must reproduce:

- collection creator, rules, capacity, and expiration;
- immutable ad origins and deterministic slots;
- every ownership outpoint in order;
- listing seller and price;
- buyer and owner epoch;
- exact update successor and sibling record;
- exact creator decision references; and
- current owner, proposal status, and live creative.

Additional gates are:

- rejection of other MAP namespaces, versions, and record subtypes;
- rejection of unrelated inscription, PushDrop, P2PKH, and OrdLock outputs;
- rejection of malformed or incomplete BEEF;
- duplicate-slot and conflicting-decision quarantine;
- parity with the current reader on confirmed state;
- immediate visibility for an Adinals-submitted unconfirmed transition;
- confirmed reconciliation of an externally created marketplace spend; and
- expiration-aware display eligibility.

## Next implementation milestone

The immutable envelope, collection, mint, decision-candidate, OrdLock, and
spend-linked lifecycle admission gates are complete against both retained
production chains. Semantic `history`, `adCurrent`, `collectionLive`, and
pending-decision resolution also pass their production and synthetic gates.
Next:

The live unconfirmed browser submission canary, repeated namespace parity, and
confirmed reconciliation have all passed, and the CARS shadow configuration is
prepared but undeployed. Next:

1. continue scheduled `npm run overlay:shadow` rounds through the local shadow
   period and keep every divergence report;
2. obtain and fund a CARS mainnet project, release the prepared
   `adinals-shadow` configuration, and replay the confirmed namespace into the
   new node before trusting any of its answers; and
3. compare the shadow node against both the local node and the current public
   reader before pointing any production build at it, while keeping derived
   embed JSON in the separate reader layer.

The topic manager stays fail closed for every transition that has not reached
its gate.

## Continuation handoff

Use this prompt when resuming the overlay work with another coding session:

```text
Continue the Adinals overlay work in:

/home/to/Desktop/WORKING 6-28/adinals

Read OVERLAY.md, README.md, and BRC100_COLLECTION_MATRIX.md completely first,
then inspect git status. Preserve existing work and keep all three documents
current. Do not commit, push, or deploy unless explicitly requested.

Verified state as of 2026-08-02, end of session:

- The CARS shadow node is live at
  `https://backend.93913ed6b421f18f80e669c61239a690.projects.babbage.systems`,
  project `93913ed6b421f18f80e669c61239a690`, release `6cbe8de9`. It holds the
  replayed namespace plus every live write since, and passes clean shadow rounds
  against the public reader.
- Browser overlay delivery targets that node in development and in production
  builds, through `.env` and the committed `.env.production`. Cross-origin
  binary `/submit` works with no proxy.
- Reads have not moved. Every rendered value still comes from GorillaPool and
  the derived reader; the overlay is a write path plus a background comparison.
- Local LARS still runs on `http://localhost:8080` but has deliberately diverged:
  it holds only the confirmed backfill and none of the day's live writes.
- The namespace is now 6 collections, 22 mints, 38 lifecycle transitions, 14
  updates, and 9 decisions, all matching the public reader.
- Three Metanet Desktop incompatibilities were found and fixed, none of which
  Yours Wallet would have surfaced: a collection audit that required exactly one
  input, a `createSignature` request that sent `data` alongside
  `hashToDirectlySign`, and anchor positions read from fixed indexes.
- Both wallets' signing conformance is measured rather than assumed. Yours
  honours a supplied hash in every case; Metanet honours it alone but prefers
  `data` when both arrive.
- Two classes of fund stranding are closed: a refused rehearsal now releases its
  reserved funding, and the developer panel exposes the wallet-toolbox spec op
  that releases no-send actions whose references were lost. That recovered
  roughly 909,000 satoshis of reserved balance.
- Proven live on the hosted node: collection, mint, update, purchase, and
  creator decision, including two full cross-wallet cycles bought in Yours and
  approved in Metanet, and one large image collection cover costing about eleven
  thousand satoshis whose 129 KB BEEF the browser submitted successfully.
- Stage one overlay shadow reads run in the product, comparing the configured
  overlay against the rendered reader on every collection view, and match.
- 178 application tests, 33 backend tests, typecheck, script self-test, and the
  production build all pass.
- Untested: a large image mint, a large image update, and overlay-first reads.

Implement the next phase:

1. Keep running scheduled `npm run overlay:shadow` rounds against the CARS
   endpoint and preserve the exact divergence reports; investigate any non-clean
   round before moving on. The local node is no longer a mirror and comparing
   the two proves nothing until a second peer makes GASP synchronization real.
2. Watch the CARS balance. Top-ups are capped at 10,000 satoshis each and the
   CLI reports success even when the cloud rejects the payment, so read the
   balance back after every attempt. An exhausted node degrades browser
   receipts to `retrying` without affecting wallet broadcasts.
3. Confirm the Metanet Desktop collection path end to end for a mint, update,
   and decision now that its funding input is accepted.
4. Keep GorillaPool as fallback and do not switch production reads until the
   shadow node's parity has no unexplained divergence over a longer period.
5. Update OVERLAY.md, README.md, and BRC100_COLLECTION_MATRIX.md with exact
   results.

If LARS is stopped, start only the required services; the old SkateSV, Space
Payments, and template UI containers were stopped without deleting their data:

docker compose -p lars_adinals -f local-data/docker-compose.yml up -d mysql mongo overlay-dev-container

Do not clear local-data unless a clean rebuild of the disposable overlay is
genuinely required. Do not include generated keys, database state, wallet-local
references, or unbroadcast Atomic BEEF in a public commit.
```

## Image records

The production namespace already contains image records at real sizes. The
Billboards collection cover is a 187 KB PNG, one of its ad updates carries a
107 KB PNG, and two of its mints are a few hundred bytes each. All are admitted
by the topic manager and compared during parity by content hash as well as by
source outpoint, so image admission and resolution are proven against genuine
records rather than fixtures alone. The 150 KB regression vector in the script
self-test exists because a record of that scale previously overflowed the
argument stack during parsing.

Size therefore matters, and it shows up first as cost. The anchor reserve is
computed from the unsigned record's byte length at a 100 satoshi per kilobyte
reference rate, so the 187 KB cover reserves roughly nineteen thousand satoshis
rather than the 200-satoshi floor a text record uses. An under-estimate makes
the wallet add funding inputs of its own, which is handled but was only fixed
once the anchor stopped being read from a fixed position.

Transport has headroom: 200 KB, 1 MB, and 4 MB `POST /submit` requests all reach
the hosted application and are rejected as invalid BEEF with HTTP 400 rather
than refused by an ingress with 413.

A large image collection cover has since been created on Metanet Desktop with
the current code, at
`41028763a833a3c4cef4befcb7c0b27b734181f1d185d9fc37a9098b9acc6009_0`. It cost
about eleven thousand satoshis, matching the reserve computed from the record's
byte length, and the wallet needed no correction. The path it exercises is the
widest in the application: the anchor is sized and located, the record is
signed, the recovery audit re-reads the entire transaction back out of the
wallet basket and re-verifies inscription, MAP, SIGMA, and canonical
reconstruction against it, and publication broadcasts the anchor and record
together.

The hosted node admitted its 129,011-byte BEEF from the browser, the largest
submission it has received. At that moment GorillaPool's content endpoint still
returned no image, so the creative was retrievable with proof from the overlay
while the public content host was still propagating it.

Still untested at that scale: a large image mint, a large image update, which is
the only two-output case, and either on Yours Wallet with the current code.

## Reader migration plan

Overlay delivery is a write path. The product still reads through
`src/readers/productCatalog.ts`, which uses GorillaPool for discovery, spend
history, and content, with WhatsOnChain for raw transactions. Moving reads onto
the overlay happens in three stages, and only the first is implemented.

**Stage 1, implemented: shadow read.** When an overlay endpoint is configured,
opening a collection schedules one background comparison 1.5 seconds later.
`src/readers/overlayShadowRead.ts` reads the derived public projection, reads
the same projection from the overlay, compares them with the parity suite's own
`comparePublicLifecycleProjection`, and retains the result. Nothing it produces
reaches the view. A missing baseline is recorded as `reference-unavailable`
rather than blamed on the overlay, both reads are bounded by a 12-second
timeout, and every outcome resolves instead of throwing. Results are retained in
memory, announced as `adinals-overlay-shadow-read` events, and reachable from
the console as `adinalsOverlayShadowReads()`. Every outcome is logged, a match
included, because a silent success cannot be distinguished from a comparison
that never ran. The comparison module deliberately avoids importing
`@1sat/templates` so it can be unit-tested under Node;
`src/readers/overlayShadowReadClient.ts` performs the wiring that cannot be.

The first live shadow read matched, reporting collection
`55acb61e975b1cd6d530c3519055ee57b68bf7ab251ac6fb0241b06261942c9b_0` in 4,318
milliseconds against the deployed CARS node. The second matched the
Metanet-published collection
`541cbf83d45fb2f33c6fb555ce6cf506d63a1a8063ed7a5b940cf101aa224d86_0` in 1,366
milliseconds, so the first figure carried a cold start in the derived reader
rather than describing steady state. The two reads run sequentially, letting a
failed baseline skip the overlay entirely, so either number is both round trips
combined. That is acceptable for background work; before stage two puts either
read on the render path, the slower half still needs identifying.

**Stage 2, not started: overlay-first hydration.** Ad and collection detail
views read from the overlay and fall back to the current reader. Nothing on the
site is populated from the overlay today: the CARS node receives every write and
is compared on every collection view, while every rendered value still comes
from GorillaPool and the derived reader. The fallback
must trigger on an *empty* result as well as an error, because an overlay only
knows what was submitted or backfilled into it and cannot discover a record it
never ingested. Rendering a never-ingested record as missing would be worse than
the lag it replaces.

**Stage 3, not started: overlay-first discovery.** Collection and ad listings
come from the overlay once its ingestion has proven complete over a longer
period, with the current reader retained as fallback.

One decision stands and one has been revised.

A lapsed CARS balance must still degrade reads silently to the fallback path
rather than to an error, because the node's funding is an operational detail
rather than a protocol one.

The image decision has changed, and a complete image lifecycle established the
case with measurements rather than argument.

The application shows the creator a local preview built from the bytes they
selected, so their own view is never blank and the gap is invisible to the
person best placed to notice it. Everyone else depends on a public content host.

A live image ad exercised mint, listing, purchase, owner update, and creator
approval. Minutes after its update was published, the hosted overlay held both
outputs of that update with a 126,499-byte BEEF each, containing the image.
GorillaPool's content endpoint returned HTTP 404 for the same record, and the
derived public reader consequently failed for the entire ad with
`Current Adinals image read failed: 404`. So the public API served nothing at
all for that ad, not merely a missing picture, while the overlay could have
answered completely. Embeds and agents are the consumers that lose most.

The in-app shadow read recorded this correctly as `reference-unavailable` and
skipped the overlay call rather than reporting a false divergence, which is the
attribution that stage-one design exists to produce.

Creative bytes ride inside the BEEF the overlay already returns, so serving them
from there closes the window while keeping the hash check that made the original
decision attractive. Stage two should render creatives from overlay BEEF when
available and fall back to the public content hosts, rather than the reverse.
The window closes at confirmation. Repeated checks throughout the unconfirmed
period returned 404, and once the transaction made a block the creative served
normally, the derived reader stopped failing, and the browser console reported
no errors. Image records have also been confirmed visible in a private browser
after that point. So this is roughly a one-block window for third-party viewers
rather than a permanent failure, on every new image ad and every image update.

## Collection anchor position and wallet funding

The first Metanet Desktop collection publication exposed a browser-side rule
that was stricter than the protocol. Version 3 anchors a collection's SIGMA
signature to the outpoint spent at input 0, and both the browser verifier and
`backend/src/protocol/recordEnvelope.ts` read the anchor from input 0 while
ignoring later inputs. The no-send recovery audit nevertheless required the
collection transaction to have exactly one input.

Yours Wallet spends the sized anchor alone, so that check never fired. Metanet
Desktop adds its own funding input, which is protocol-irrelevant but produced a
refused publication reading `collection transaction must spend exactly one
anchor input`. Nothing was broadcast, because the audit runs before publication.

`src/actions/collectionAnchor.ts` now holds the rule as a pure module: read the
anchor from input 0, and reject only an unresolvable anchor or one that is not
the outpoint the signature was made over. `recoverNoSendCollection` accepts the
expected anchor outpoint from the retained rehearsal, so a wallet that reorders
inputs and moves the anchor off index 0 is still refused, now with a message
naming both outpoints. Five regression tests cover the accepted and refused
shapes. The helper deliberately imports nothing from `@1sat/templates` so it
runs under Node's test runner, which cannot resolve that package's
extensionless ESM chain.

## Signing a Bitcoin sighash through BRC-100

`createSignature` accepts `data` or `hashToDirectlySign`, and the two are
alternatives rather than companions. The derived-input signer sent both, which
leaves the choice to the wallet. Yours Wallet honours the hash. Metanet Desktop
prefers `data` and signs a single SHA-256 of it, while a Bitcoin sighash is the
double hash, so its signature verifies against its own reported public key and
still fails `OP_CHECKSIG`.

That failure is deeply misleading. `OP_EQUALVERIFY` passes first, proving the
pushed public key is right, so the error points at a signature that is
cryptographically valid over the wrong message. Isolated conformance probes of
each field also pass, because the divergence only appears when both fields are
sent together.

`src/wallet/signingConformance.ts` now probes that combined case alongside the
individual ones, and the request in `signDerivedP2PKHInput` carries the sighash
alone. Reaching this took ruling out several plausible causes by measurement:
the anchor's output position, the anchor's input position, and the wallet's key
derivation were each tested and cleared before the request shape was examined.

## Anchor output and input positions

`createAction` declares outputs and inputs; it does not fix their final
positions. The anchor code assumed both: the fee reserve was read from output 0
of the anchor transaction, and the anchor spend was signed at input 0 of the
record transaction. Yours Wallet satisfies both assumptions, so they held until
Metanet Desktop, which adds funding of its own.

Signing a fixed index applies an application-derived key to whichever input the
wallet happened to place there. The failure surfaces as a local `Spend`
evaluation error, `The top stack element must be truthy after script
evaluation`, at the `OP_CHECKSIG` of a P2PKH locking script the application does
not control. A first Metanet mint attempt failed exactly that way against an
anchor transaction that, being no-send, existed nowhere on chain to inspect.

`src/actions/anchorOutput.ts` now locates the reserve by its exact locking
script and satoshi value, and locates the spending input by the outpoint it
consumes. A missing reserve, a duplicated byte-identical reserve, and a
transaction that never spends the reserve are all refused with their own
message rather than producing an opaque signature failure. Both the collection
and the mint/decision paths use it.

## Reserved wallet funding

A refused collection rehearsal used to strand real satoshis. Every Adinals
action is built as a no-send anchor and child pair, and a no-send action keeps
its funding input *and its no-send change* reserved inside the wallet until the
action is published or aborted. The wallet keeps counting those satoshis in its
displayed balance while refusing to spend them, so one abandoned rehearsal that
consumed a large funding output can lock most of a balance rather than only its
few-hundred-satoshi anchor reserve.

The lifecycle path already aborted on failure. Collections did not:
`createAdinalsCollection` released its own internal failures, but a rehearsal
refused by the audit that runs afterwards had no cleanup path, and the returned
rehearsal did not carry the wallet's opaque abort handles.

`AdinalsCollectionRehearsal` now retains `actionReference` and
`anchorReference`, and `src/actions/releaseCollectionRehearsal.ts` releases the
child before its anchor. That helper never throws, because it runs while another
failure is already being reported and must not replace the original
explanation. `publishCollection` calls it whenever the audit refuses a
rehearsal and appends the outcome to the error. The developer panel also lists
every retained rehearsal with a release control, and says plainly when an older
candidate has no retained reference: recovery is read-only and never learns
those handles, so such an action can only be released from the wallet's own
interface. Wallet-local references stay out of exported fixtures.

### Releasing an action whose reference was lost

BRC-100 offers no recovery once a `createAction` reference is discarded:
`listActions` returns `txid`, `satoshis`, `status`, `description`, labels, and
inputs/outputs, but never a reference, and `abortAction` accepts nothing else.
`relinquishOutput` is unrelated; it removes an output from a basket rather than
releasing an action's reserved inputs.

`@bsv/wallet-toolbox` fills that gap with reserved `listActions` labels. Passing
`ac6b20a3bb320adafecd637b25c84b792ad828d3aa510d05dc841481f664277d`
(`specOpNoSendActions`) filters to `nosend` status, and adding the literal label
`abort` makes its storage layer call `abortAction` for each match using the
reference it holds internally. A parallel `specOpInvalidChange` basket value
releases change outputs that no longer validate, and
`bsv-blockchain/ts-stack#188` added the IndexedDB status review that repairs
outputs still held by terminally failed transactions.

`src/wallet/noSendMaintenance.ts` exposes this as a reviewed and a releasing
call, surfaced in the developer panel behind an explicit acknowledgement. Two
properties matter. It is a wallet-toolbox extension rather than a BRC-100
guarantee, so a wallet that does not implement it treats the value as an
ordinary label and releases nothing, which is a safe outcome. And releasing is
not scoped to this application: every `nosend` action for the connected wallet
user is aborted, including a rehearsal that was about to be published.

## Admitted transaction coverage

A shadow node is only useful if every kind of Adinals transaction reaches it, so
the local database was inventoried directly on 2026-08-02. It holds 71 distinct
transactions and 83 admitted outputs: 5 collections, 20 mint records, 16 OrdLock
listings, 22 successor ownership states, 12 sibling `adUpdate` records, and 8
creator decisions. Thirty-eight outputs are marked spent and one output is still
unconfirmed.

Walking those spends from predecessor to successor classifies all 38 confirmed
transitions with none unresolved: 16 listings, 9 purchases, 1 cancellation, and
12 updates. There are no plain ownership transfers in the confirmed production
namespace yet, so transfer admission currently rests on its backend regression
test rather than a live mainnet vector. Every other transition type is proven
against real transactions, and the confirmed replay reports zero failures and no
unresolved spend links.

One observation from that inventory: the optional `lifecycleKind`,
`predecessorOutpoint` storage annotations are never populated, because
`classifyLifecycleTransition` runs at admission against the admitted
transaction's own BEEF. Ownership epochs, listings, purchases, and updates are
still derived correctly at query time, which is what the passing parity runs
verify, but the stored rows cannot be filtered by transition kind without
re-deriving. This is a storage-annotation gap, not an admission or resolution
defect.

## CARS shadow preparation

The release mechanism itself is simple: `cars build` packages a local artifact
and `cars release now` uploads it. The work that must be finished first is the
project account and the new node's ingestion, not the upload.

Prepared on 2026-08-02, with nothing deployed:

- `@bsv/cars-cli` 1.2.9 is pinned in the root development dependencies.
- `deployment-info.json` now carries a second configuration, `adinals-shadow`:
  provider CARS, mainnet, `https://cars.babbage.systems`, and `deploy:
  ["backend"]`. LARS selects its own configuration by provider, so local
  development is unaffected and `cars config ls` lists both.
- The configuration deliberately has **no** `projectID`. Every CARS release,
  logs, domain, and billing command fails closed until an operator sets one.
- `npm run overlay:cars:preflight` proves the packaging boundary offline. It
  checks the schema, the single LARS/CARS configuration pair, matching mainnet
  networks, an HTTPS cloud URL, a backend-only deploy list, that every
  registered topic manager and lookup service path exists under `./backend/`,
  and that no backend runtime file imports outside `backend/src` or uses a
  package the backend `package.json` does not declare. It currently reports 2
  registered services, 12 runtime files, 6 test files, a clean boundary, and the
  intentional missing-project warning.
- `npm run overlay:cars:build` produced one local 10.9 MB artifact with 4,353
  entries: `deployment-info.json`, the root `package.json`/`package-lock.json`,
  and `backend/` including its reinstalled dependencies. The root `src`,
  `local-data`, LARS keys, and wallet fixtures are absent, matching the same
  boundary LARS enforces. The artifact was inspected and deleted; artifacts and
  shadow reports are ignored by Git.

### Deployed shadow node

The first CARS node was deployed on 2026-08-02 as project
`93913ed6b421f18f80e669c61239a690` (`adinals-overlay`) at

`https://backend.93913ed6b421f18f80e669c61239a690.projects.babbage.systems`

Release `6cbe8de96aea771de80508ad368f51ae` built and rolled out in about ninety
seconds. The node reports `status: ok`, registers `tm_adinals` 0.4.0 and
`ls_adinals` 0.2.0 over HTTPS, and answers a browser CORS preflight for binary
`/submit` with `access-control-allow-origin: *` plus the required `X-Topics`
header, so the same-origin proxy that local development needs is unnecessary
against CARS.

Two operational surprises are worth recording. The cloud rejects any single
top-up above 10,000 satoshis, and `cars project topup` prints a success message
regardless of the response body, so a rejected 1,000,000 satoshi payment looks
identical to a successful one. Verify a top-up by reading the balance back.
Metered burn is 108 satoshis per five-minute tick, roughly 1,300 per hour or
31,000 per day, so a 100,000 satoshi balance funds about three days.

The confirmed namespace replay admitted 70 of 71 transactions with zero
failures. The one skipped transaction was the still-unconfirmed Ad #5, which
GorillaPool continued to report at `height: null` after the chain had confirmed
it, so the confirmed-only backfill correctly declined to submit it. Relaying its
retained 2,329-byte BEEF from the local node closed the gap: the CARS topic
manager independently returned `outputsToAdmit: [0]` on the evidence alone.
After that relay the node passed the full shadow round, matching the public
reader across 5 collections and 20 ads with 20 reconciled current states.

The remaining steps all require explicit operator permission and real funds:

1. Open a BRC-100 wallet first. The CARS CLI authenticates with
   `new WalletClient('auto', 'localhost')`, so Metanet Desktop must be running
   and unlocked before any cloud command; the alternative is an explicit
   `--key` with hosted wallet storage. Then run
   `npx cars config edit adinals-shadow` to select the cloud, create or choose
   the mainnet project, and record its `projectID`, and fund it with
   `npx cars project topup adinals-shadow`. The finished entry looks exactly
   like the AdventureSV template's CARS block, with an Adinals project
   identifier.
2. `npm run overlay:cars:build` followed by `cars release now adinals-shadow`,
   then `cars project info` until the backend domain reports online with SSL.
3. Ingest history into the new node. A CARS project starts with an empty
   database, so the shadow node knows nothing until it is replayed:
   `ADINALS_OVERLAY_URL=https://<shadow-host> npm run overlay:backfill --
   --dry-run`, then the same command without `--dry-run`. The 2026-08-02
   confirmed inventory is 5 collections, 20 mint origins, 38 lifecycle
   transitions, 12 sibling updates, and 8 decisions, which is 71 submitted
   transactions with no unresolved confirmed spend links.
4. `ADINALS_OVERLAY_URL=https://<shadow-host> npm run overlay:shadow` for the
   same repeated parity and reconciliation the local node passes, keeping the
   local node running as the comparison baseline.
5. Only then consider a production build with
   `VITE_ADINALS_OVERLAY_URL=https://<shadow-host>` so browsers deliver live
   BEEF to the shadow node. Confirm the hosted node's CORS response and binary
   `/submit` acceptance from the browser before relying on it, exactly as the
   local proxy canary did.

Steps 1 through 4 are complete. The cross-origin browser canary in step 5 also
passed: a Metanet Desktop collection published from local development delivered
its BEEF straight to the hosted node with no proxy, and
`541cbf83d45fb2f33c6fb555ce6cf506d63a1a8063ed7a5b940cf101aa224d86_0` is visible
there with hydrated BEEF while the local LARS node correctly holds nothing for
it. `.env.production` is committed with that endpoint so a host without
dashboard environment variables still builds with overlay delivery enabled;
`.env` overrides it locally and remains ignored by Git.

GorillaPool stays the authoritative production discovery and fallback path
throughout. Two build-boundary items to watch on the first cloud build: the
artifact carries the root `package.json`, whose frontend dependency tree
includes the `@1sat/types` extensionless ESM import that Node cannot execute
directly, and the backend ships TypeScript sources that the cloud image
compiles the same way LARS does. The backend runtime imports neither
`@1sat/templates` nor anything from the root `src`, so a failure there would be
an installation-level surprise rather than a runtime dependency.

## CARS gate

Deploy with CARS only after the local overlay passes the parity suite and can be
rebuilt from its retained fixtures/reconciliation inputs. The first production
deployment remains a single node in shadow mode. It does not replace
GorillaPool or become the default `api.adinals.com` reader until repeated
dual-read comparisons show no unexplained divergence.

## AdventureSV template note

`/home/to/Desktop/Medford_AdventureSV/full-stack-project-template` is a useful
LARS/CARS layout reference. Its current topic manager does **not** admit every
overlay output: it requires the exact AdventureSV PushDrop marker and a valid
`aoc.v1` sibling record, with regression tests rejecting unrelated protocols.

It must not be copied as Adinals lifecycle logic. That application returns no
`coinsToRetain`, uses transaction-ID-only spend notifications, and deletes its
spent lookup rows. Those choices are appropriate for its current public feed
but would lose the sale, purchase, cancellation, transfer, and update history
that Adinals requires.
